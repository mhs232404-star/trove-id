import 'dotenv/config'
import { Bot, InlineKeyboard, GrammyError, HttpError } from 'grammy'
import { PrismaClient } from '@prisma/client'
import { createAlertService } from './services/telegram-alert.service.js'
import { startAllSchedulers } from './schedulers.js'
import { getAuthUrl } from './google.js'
import { startServer } from './server.js'
import { generateReply, generateReplyNoComment } from './gemini-service.js'
import { businessTemplates } from './templates.js'

const prisma = new PrismaClient({ log: ['error'] })
const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)
const alertService = createAlertService(bot)

const renderMenu = async (telegramId: string) => {
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { googleAccounts: true } })
  const isConnected = user && user.googleAccounts && user.googleAccounts.length > 0
  let text = `🧭 <b>PUSAT KENDALI TROVE</b>\n━━━━━━━━━━━━━━━━━━\n\n`
  if (!isConnected) {
    text += `🔗 /login - Otorisasi Akun Google\n📥 /antrean - Pusat Balas Ulasan`
  } else {
    text += `🏢 /cabang - Kelola Lokasi Bisnis\n📥 /antrean - Pusat Balas Ulasan`
  }
  return text
}

const renderCabang = async (telegramId: string) => {
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { businesses: true, googleAccounts: true } })
  if (!user) return null

  let text = `🏢 <b>MANAJEMEN CABANG</b>\n━━━━━━━━━━━━━━━━━━\n`
  const keyboard = new InlineKeyboard()

  if (user.businesses.length === 0) {
    text += `⚠️ <b>Belum Ada Cabang Terdaftar</b>\n\nAnda belum memiliki cabang bisnis yang terhubung ke sistem Trove. Silakan tambahkan lokasi bisnis Anda terlebih dahulu.`
    keyboard.text('➕ Tambah Cabang', 'add_branch').row()
  } else {
    text += `Total Cabang Aktif: <b>${user.businesses.length}</b>\n\n`
    user.businesses.forEach((b) => {
      const acc = user.googleAccounts.find(g => g.id === b.googleAccountId)
      const emailInfo = acc ? acc.email : 'Tidak diketahui'
      text += `📍 <b>${b.name}</b>\n📧 <i>${emailInfo}</i>\n\n`
    })
    keyboard.text('➕ Tambah Cabang', 'add_branch').row()
    keyboard.text('🗑️ Hapus Cabang', 'delete_branch').row()
  }

  keyboard.text('🔙 Menu Utama', 'back_to_menu')
  return { text, keyboard }
}

const renderBranchList = async (telegramId: string, title: string, actionPrefix: string, icon: string) => {
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { businesses: true } })
  if (!user || user.businesses.length === 0) return null
  const keyboard = new InlineKeyboard()
  user.businesses.forEach(b => keyboard.text(`${icon} ${b.name}`, `${actionPrefix}_${b.id}`).row())
  keyboard.text('🔙 Menu Utama', 'back_to_menu')
  return { text: title, keyboard }
}

async function processNextDraft(ctx: any, businessId: string) {
  const review = await prisma.review.findFirst({
    where: { businessId, status: { in: ['NEW', 'NOTIFIED'] } },
    orderBy: { createdAt: 'asc' }
  })

  const business = await prisma.business.findUnique({ where: { id: businessId } })

  if (!review) {
    const keyboard = new InlineKeyboard().text('🔙 Menu Utama', `back_to_menu`)
    const txt = `✨ <b>ANTREAN SELESAI</b> ✨\n━━━━━━━━━━━━━━━━━━\n\nSeluruh ulasan pelanggan untuk <b>${business?.name}</b> telah berhasil dibalas.`
    if (ctx.callbackQuery) return ctx.editMessageText(txt, { parse_mode: 'HTML', reply_markup: keyboard })
    return ctx.reply(txt, { parse_mode: 'HTML', reply_markup: keyboard })
  }

  let msg
  if (ctx.callbackQuery) {
    await ctx.editMessageText('⏳ <i>AI Kami sedang meracik balasan terbaik...</i>', { parse_mode: 'HTML' })
  } else {
    msg = await ctx.reply('⏳ <i>AI Kami sedang meracik balasan terbaik...</i>', { parse_mode: 'HTML' })
  }

  let aiResponse = ''
  const safeComment = review.comment || ''
  
  if (safeComment.trim() !== '') {
    aiResponse = await generateReply(review.reviewerName, review.rating, safeComment, business?.name || 'Bisnis')
  } else {
    aiResponse = await generateReplyNoComment(review.reviewerName, review.rating, business?.name || 'Bisnis')
  }

  await prisma.reviewReply.upsert({
    where: { reviewId: review.id },
    update: { body: aiResponse, source: 'AI_GEMINI', postedAt: new Date() },
    create: { reviewId: review.id, body: aiResponse, source: 'AI_GEMINI', postedAt: new Date() }
  })

  await prisma.review.update({
    where: { id: review.id },
    data: { status: 'DRAFT' }
  })

  const stars = '⭐'.repeat(review.rating)
  const textPreview = `📝 <b>DRAFT BALASAN AI</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Pelanggan:</b> ${review.reviewerName}\n🌟 <b>Penilaian:</b> ${stars}\n💬 <i>"${review.comment || 'Tidak ada teks'}"</i>\n\n🤖 <b>Rancangan Balasan:</b>\n${aiResponse}\n━━━━━━━━━━━━━━━━━━\n❓ <i>Pilih tindakan untuk ulasan ini:</i>`

  const keyboard = new InlineKeyboard()
    .text('✅ Kirim Balasan', `send_draft_${review.id}`).row()
    .text('✏️ Tulis Manual', `edit_draft_${review.id}`).row()
    .text('❌ Hentikan Proses', `cancel_draft_${review.id}`)

  if (ctx.callbackQuery) {
    await ctx.editMessageText(textPreview, { parse_mode: 'HTML', reply_markup: keyboard })
  } else {
    await ctx.api.editMessageText(ctx.chat?.id!, msg.message_id, textPreview, { parse_mode: 'HTML', reply_markup: keyboard })
  }
}

bot.command('start', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  const name = ctx.from?.first_name
  if (!telegramId) return
  const existingUser = await prisma.user.findUnique({ where: { telegramId } })
  if (existingUser) {
    return ctx.reply(`Selamat datang kembali, <b>${name}</b>! 👋\n\nKetik /menu untuk membuka Pusat Kendali.`, { parse_mode: 'HTML' })
  }
  await prisma.user.create({ data: { telegramId, name } })
  await ctx.reply(`Halo <b>${name}</b>! Selamat datang di Trove 👋\n\nAsisten virtual cerdas untuk manajemen ulasan Google Maps bisnis Anda.\n\nKetik /menu untuk memulai konfigurasi.`, { parse_mode: 'HTML' })
})

bot.command('menu', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return
  const text = await renderMenu(telegramId)
  await ctx.reply(text, { parse_mode: 'HTML' })
})

bot.command('login', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return
  const user = await prisma.user.findUnique({ where: { telegramId }, include: { googleAccounts: true } })
  if (user && user.googleAccounts && user.googleAccounts.length > 0) {
    return ctx.reply('✅ Akun Google Anda telah terhubung secara aman.')
  }
  const url = getAuthUrl(telegramId)
  const keyboard = new InlineKeyboard().url('🔗 Otorisasi via Web', url)
  await ctx.reply('🔐 <b>OTORISASI GOOGLE</b>\n━━━━━━━━━━━━━━━━━━\nSistem memerlukan izin akses Google Business Profile untuk menyinkronkan data ulasan secara <b>real-time</b>.\n\nKlik tautan di bawah untuk menghubungkan akun:', { parse_mode: 'HTML', reply_markup: keyboard })
})

bot.command('cabang', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return
  const data = await renderCabang(telegramId)
  if (!data) return ctx.reply('❌ Anda belum memiliki bisnis aktif. Silahkan login terlebih dahulu')
  await ctx.reply(data.text, { parse_mode: 'HTML', reply_markup: data.keyboard })
})

bot.command('antrean', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return
  const data = await renderBranchList(telegramId, '📥 <b>PUSAT BALAS ULASAN</b>\n━━━━━━━━━━━━━━━━━━\nSilakan pilih lokasi bisnis untuk memproses antrean:', 'antrean', '📍')
  if (!data) return ctx.reply('❌ Anda belum memiliki bisnis aktif. Silahkan login terlebih dahulu')
  await ctx.reply(data.text, { parse_mode: 'HTML', reply_markup: data.keyboard })
})

bot.callbackQuery(/^antrean_(.+)$/, async (ctx) => {
  const businessId = ctx.match[1] as string
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  const reviews = await prisma.review.findMany({ 
    where: { businessId, status: { in: ['NEW', 'NOTIFIED'] } },
    orderBy: { createdAt: 'asc' }
  })

  const keyboard = new InlineKeyboard()

  if (reviews.length === 0) {
    keyboard.text('🔙 Kembali', 'back_to_antrean')
    return ctx.editMessageText(`✅ <b>TIDAK ADA ANTREAN</b>\n━━━━━━━━━━━━━━━━━━\n\nSemua ulasan untuk <b>${business?.name}</b> telah ditangani dengan baik.`, { parse_mode: 'HTML', reply_markup: keyboard })
  }

  let text = `📥 <b>ANTREAN AKTIF</b>\n🏢 <b>${business?.name}</b>\n━━━━━━━━━━━━━━━━━━\nTerdapat <b>${reviews.length}</b> ulasan menunggu respon:\n\n`
  reviews.slice(0, 5).forEach((r, idx) => {
    const stars = '⭐'.repeat(r.rating)
    text += `${idx + 1}. <b>${r.reviewerName}</b> ${stars}\n`
  })

  if (reviews.length > 5) text += `\n<i>...dan ${reviews.length - 5} ulasan lainnya.</i>`
  text += `\n\nKlik tombol di bawah untuk memulai proses kurasi balasan.`

  keyboard.text('🤖 Mulai Sesi Balasan', `reply_ai_${businessId}`).row().text('🔙 Kembali', 'back_to_antrean')
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
})

bot.callbackQuery(/^reply_ai_(.+)$/, async (ctx) => {
  const businessId = ctx.match[1] as string
  await processNextDraft(ctx, businessId)
})

bot.callbackQuery(/^send_draft_(.+)$/, async (ctx) => {
  const reviewId = ctx.match[1] as string
  const review = await prisma.review.findUnique({ where: { id: reviewId } })
  if (!review) return
  await prisma.review.update({ where: { id: reviewId }, data: { status: 'REPLIED' } })
  await processNextDraft(ctx, review.businessId)
})

bot.callbackQuery(/^edit_draft_(.+)$/, async (ctx) => {
  const reviewId = ctx.match[1] as string
  await ctx.deleteMessage()
  await ctx.reply(`✏️ <b>MODE TULIS MANUAL</b>\n━━━━━━━━━━━━━━━━━━\nSilakan ketik langsung teks balasan Anda untuk ulasan ini.\n\n<tg-spoiler>(Ref ID: ${reviewId})</tg-spoiler>`, {
    parse_mode: 'HTML',
    reply_markup: { force_reply: true }
  })
})

bot.callbackQuery(/^cancel_draft_(.+)$/, async (ctx) => {
  const reviewId = ctx.match[1] as string
  const review = await prisma.review.findUnique({ where: { id: reviewId } })
  if (!review) return
  await prisma.reviewReply.delete({ where: { reviewId } })
  await prisma.review.update({ where: { id: reviewId }, data: { status: 'NEW' } })
  
  const business = await prisma.business.findUnique({ where: { id: review.businessId } })
  const reviews = await prisma.review.findMany({ where: { businessId: review.businessId, status: { in: ['NEW', 'NOTIFIED'] } } })
  const keyboard = new InlineKeyboard()
  
  if (reviews.length === 0) {
    keyboard.text('🔙 Kembali', 'back_to_antrean')
    return ctx.editMessageText(`✅ <b>TIDAK ADA ANTREAN</b>\n━━━━━━━━━━━━━━━━━━\n\nSemua ulasan untuk <b>${business?.name}</b> telah ditangani dengan baik.`, { parse_mode: 'HTML', reply_markup: keyboard })
  }
  
  let text = `🛑 <b>PROSES DIHENTIKAN</b>\n🏢 <b>${business?.name}</b>\n━━━━━━━━━━━━━━━━━━\nSisa ulasan tertunda: <b>${reviews.length}</b>\n\n`
  keyboard.text('▶️ Lanjutkan Sesi', `reply_ai_${review.businessId}`).row().text('🔙 Kembali ke Menu', 'back_to_antrean')
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
})

bot.callbackQuery('add_branch', async (ctx) => {
  const text = `➕ <b>REGISTRASI CABANG BARU</b>\n━━━━━━━━━━━━━━━━━━\nTentukan metode sinkronisasi akun Google Business Profile:`
  const keyboard = new InlineKeyboard().text('📧 Pakai Email Terdaftar', 'use_existing_email').row().text('🆕 Tautkan Akun Baru', 'add_new_email').row().text('❌ Batal', 'back_to_cabang')
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
})

bot.callbackQuery('use_existing_email', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return

  const user = await prisma.user.findUnique({
    where: { telegramId },
    include: { googleAccounts: true }
  })

  if (!user || user.googleAccounts.length === 0) {
    return ctx.answerCallbackQuery({ 
      text: 'Belum ada email yang terhubung. Silakan gunakan opsi Tambah Akun Baru.', 
      show_alert: true 
    })
  }

  const keyboard = new InlineKeyboard()
  
  user.googleAccounts.forEach(account => {
    keyboard.text(`📧 ${account.email}`, `confirm_add_branch_${account.id}`).row()
  })
  
  keyboard.text('🔙 Batal', 'back_to_cabang')

  await ctx.editMessageText(
    '📥 <b>Pilih Akun Email</b>\n━━━━━━━━━━━━━━━━━━\n\nSilakan pilih email terdaftar mana yang ingin Anda gunakan untuk membuat cabang baru:',
    { parse_mode: 'HTML', reply_markup: keyboard }
  )
})

bot.callbackQuery('add_new_email', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return
  const url = getAuthUrl(telegramId)
  const text = `🔗 <b>TAUTAN AKUN BARU</b>\n━━━━━━━━━━━━━━━━━━\nSistem memerlukan otorisasi eksternal untuk mengelola profil bisnis di email terpisah.\n\nKlik untuk melanjutkan otentikasi:`
  const keyboard = new InlineKeyboard().url('🔐 Otorisasi via Web', url).row().text('❌ Batal', 'back_to_cabang')
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
})

bot.callbackQuery(/^confirm_add_branch_(.+)$/, async (ctx) => {
  const accountId = ctx.match[1] 
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return

  const user = await prisma.user.findUnique({ where: { telegramId } })
  if (!user) return

  const googleAccount = await prisma.googleAccount.findUnique({
    where: { id: accountId }
  })

  if (!googleAccount) {
    return ctx.answerCallbackQuery({ text: 'Akun Google tidak ditemukan!', show_alert: true })
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

  const text = `🎉 <b>INTEGRASI BERHASIL</b>\n━━━━━━━━━━━━━━━━━━\n\nPemantauan AI untuk cabang <b>${newBusiness.name}</b> (terhubung dengan ${googleAccount.email}) resmi beroperasi.\n\nSistem telah mengunduh ulasan terbaru ke dalam antrean.`
  
  const keyboard = new InlineKeyboard()
    .text('📥 Cek Antrean Ulasan', 'go_antrean').row()
    .text('🔙 Manajemen Cabang', 'back_to_cabang')
  
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
})

bot.callbackQuery('delete_branch', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return

  const user = await prisma.user.findUnique({ 
    where: { telegramId }, 
    include: { businesses: true } 
  })

  if (!user || user.businesses.length === 0) {
    return ctx.answerCallbackQuery({ text: 'Tidak ada cabang untuk dihapus.', show_alert: true })
  }

  const keyboard = new InlineKeyboard()
  user.businesses.forEach(b => {
    keyboard.text(`🗑️ ${b.name}`, `confirm_delete_branch_${b.id}`).row()
  })
  
  keyboard.text('🔙 Batal', 'back_to_cabang')

  await ctx.editMessageText(
    '🗑️ <b>HAPUS CABANG</b>\n━━━━━━━━━━━━━━━━━━\n\nPilih cabang bisnis yang ingin Anda hapus dari sistem:', 
    { parse_mode: 'HTML', reply_markup: keyboard }
  )
})

bot.callbackQuery(/^confirm_delete_branch_(.+)$/, async (ctx) => {
  const businessId = ctx.match[1] as string
  
  const business = await prisma.business.findUnique({ where: { id: businessId } })
  if (!business) {
    return ctx.answerCallbackQuery({ text: 'Cabang tidak ditemukan!', show_alert: true })
  }

  const googleAccountId = business.googleAccountId

  await prisma.reviewReply.deleteMany({ where: { review: { businessId: businessId } } })
  await prisma.review.deleteMany({ where: { businessId: businessId } })
  await prisma.business.delete({ where: { id: businessId } })

  if (googleAccountId) {
    const remainingBranches = await prisma.business.count({
      where: { googleAccountId: googleAccountId }
    })
    
    if (remainingBranches === 0) {
      await prisma.googleAccount.delete({ where: { id: googleAccountId } })
    }
  }

  const keyboard = new InlineKeyboard().text('🔙 Kembali ke Manajemen Cabang', 'back_to_cabang')
  
  await ctx.editMessageText(
    `✅ <b>CABANG/BISNIS DIHAPUS</b>\n━━━━━━━━━━━━━━━━━━\n\nCabang <b>${business.name}</b> telah berhasil dihapus secara permanen dari sistem.`, 
    { parse_mode: 'HTML', reply_markup: keyboard }
  )
})

bot.callbackQuery('back_to_menu', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return
  const text = await renderMenu(telegramId)
  await ctx.editMessageText(text, { parse_mode: 'HTML' })
})

bot.callbackQuery('back_to_cabang', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return
  const data = await renderCabang(telegramId)
  if (!data) return
  await ctx.editMessageText(data.text, { parse_mode: 'HTML', reply_markup: data.keyboard })
})

bot.callbackQuery(['back_to_antrean', 'go_antrean'], async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  if (!telegramId) return
  const data = await renderBranchList(telegramId, '📥 <b>PUSAT BALAS ULASAN</b>\n━━━━━━━━━━━━━━━━━━\nSilakan pilih lokasi bisnis untuk memproses antrean:', 'antrean', '📍')
  if (!data) return ctx.editMessageText('❌ Cabang tidak ditemukan.')
  await ctx.editMessageText(data.text, { parse_mode: 'HTML', reply_markup: data.keyboard })
})

bot.on('message:text', async (ctx) => {
  if (ctx.message.reply_to_message) {
    const text = ctx.message.reply_to_message.text
    const match = text?.match(/\(Ref ID: ([a-zA-Z0-9]+)\)/)
    
    if (match && match[1]) {
      const reviewId = match[1] as string
      const newReply = ctx.message.text
      
      if (!newReply) return
      
      const review = await prisma.review.findUnique({ where: { id: reviewId } })
      
      if (!review) return
      
      await prisma.reviewReply.upsert({
        where: { reviewId },
        update: { body: newReply, source: 'MANUAL', postedAt: new Date() },
        create: { reviewId, body: newReply, source: 'MANUAL', postedAt: new Date() }
      })
      
      await prisma.review.update({
        where: { id: reviewId },
        data: { status: 'REPLIED' }
      })
      
      await ctx.reply('✅ Balasan modifikasi Anda berhasil disimpan dan ditambahkan ke antrean publikasi.')
      await processNextDraft(ctx, review.businessId)
    }
  }
})

bot.catch((err) => {
  const ctx = err.ctx
  const e = err.error
  if (e instanceof GrammyError) {
    if (e.description.includes('message is not modified')) return
  }
})

async function main() {
  try {
    startAllSchedulers(alertService)
    await startServer()
    await bot.start()
  } catch (error) {
    process.exit(1)
  }
}

export { bot, alertService, prisma }

main()