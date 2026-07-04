import Fastify from 'fastify'
import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'
import { oauth2Client } from './google.js'
import { bot } from './bot.js'
import { businessTemplates } from './templates.js'

const fastify = Fastify({ logger: true })
const prisma = new PrismaClient()

fastify.get('/api/auth/callback/google', async (request, reply) => {
  const { code, state } = request.query as { code: string; state: string }

  if (!code || !state) {
    return reply.status(400).send('Login gagal: Data dari Google tidak lengkap.')
  }

  try {
    const { tokens } = await oauth2Client.getToken(code)
    oauth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({ auth: oauth2Client, version: 'v2' })
    const userInfo = await oauth2.userinfo.get()
    const emailInfo = userInfo.data.email

    if (!emailInfo || !tokens.refresh_token) {
      return reply.status(400).send('Login gagal: Email atau Refresh Token tidak ditemukan. Pastikan ini pertama kali login, atau hapus akses aplikasi dari Akun Google Anda lalu coba lagi.')
    }

    const user = await prisma.user.findUnique({ 
      where: { telegramId: state },
      include: { googleAccounts: true }
    })
    
    if (user) {
      const isFirstLogin = user.googleAccounts.length === 0

      const googleAccount = await prisma.googleAccount.upsert({
        where: { 
          userId_email: { userId: user.id, email: emailInfo } 
        },
        update: {
          accessToken: tokens.access_token || '',
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(tokens.expiry_date || Date.now() + 3600 * 1000)
        },
        create: {
          userId: user.id,
          email: emailInfo,
          accessToken: tokens.access_token || '',
          refreshToken: tokens.refresh_token,
          tokenExpiresAt: new Date(tokens.expiry_date || Date.now() + 3600 * 1000)
        }
      })

      const existingBusinesses = await prisma.business.findMany({
        where: { googleAccountId: googleAccount.id }
      })
      const businessIds = existingBusinesses.map(b => b.id)

      if (businessIds.length > 0) {
        await prisma.reviewReply.deleteMany({ where: { review: { businessId: { in: businessIds } } } })
        await prisma.review.deleteMany({ where: { businessId: { in: businessIds } } })
        await prisma.business.deleteMany({ where: { id: { in: businessIds } } })
      }

      const selectedTemplate = businessTemplates[Math.floor(Math.random() * businessTemplates.length)]!
      const timestamp = Date.now()

      const newBusiness = await prisma.business.create({
        data: {
          userId: user.id,
          googleAccountId: googleAccount.id,
          name: selectedTemplate.name,
          gbpLocationId: `AUTO_LOC_${timestamp}`,
          gbpAccountId: `AUTO_ACC_${timestamp}`,
          isActive: true
        }
      })

      const reviewsToInsert = selectedTemplate.reviews.map((r, index) => ({
        businessId: newBusiness.id,
        gbpReviewId: `AUTO_REV_${newBusiness.id}_${index + 1}_${timestamp}`,
        reviewerName: r.reviewerName,
        rating: r.rating,
        comment: r.comment,
        status: 'NEW',
        publishedAt: new Date()
      }))

      await prisma.review.createMany({
        data: reviewsToInsert,
        skipDuplicates: true
      })

      try {
        let successMessage = ''
        
        if (isFirstLogin) {
          successMessage = `✅ <b>Koneksi Berhasil!</b>\n\nAkun Google dengan email <b>${emailInfo}</b> telah berhasil dihubungkan ke sistem Trove.\n\nKetik /menu untuk mulai memantau dan membalas ulasan bisnismu.`
        } else {
          successMessage = `🎉 <b>Cabang Baru Berhasil Ditambahkan!</b>\n\nAkun Google dengan email <b>${emailInfo}</b> telah berhasil disinkronisasi.\n\nSistem telah otomatis mendaftarkan lokasi bisnis dari email tersebut. Silakan ketik /cabang untuk mengelola lokasi bisnis Anda.`
        }

        await bot.api.sendMessage(state, successMessage, { parse_mode: 'HTML' })
      } catch (botError) {
        fastify.log.error(botError)
      }
    }

    return reply.header('Content-Type', 'text/html').send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h1 style="color: green;">Login Berhasil! 🎉</h1>
          <p>Email <b>${emailInfo}</b> telah terhubung dengan Bot Trove.</p>
          <p>Silakan tutup halaman browser ini dan kembali ke Telegram.</p>
        </body>
      </html>
    `)

  } catch (error) {
    fastify.log.error(error)
    return reply.status(500).send('Terjadi kesalahan internal saat memproses token Google.')
  }
})

const startServer = async () => {
  try {
    await fastify.listen({ port: 3000, host: '0.0.0.0' })
    console.log('🌐 Web Server Fastify menyala di http://localhost:3000')
  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

export { startServer }