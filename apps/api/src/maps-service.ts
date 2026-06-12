import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'

const prisma = new PrismaClient()

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/auth/callback/google'
)

/**
 * Langkah 1: Menarik data Akun dan Lokasi Asli dari Google
 */
export async function simpanBisnisKeDatabase(telegramId: string) {
  oauth2Client.setCredentials({
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN
  })

  try {
    const user = await prisma.user.findUnique({
      where: { telegramId }
    })

    if (!user) {
      console.log("❌ User belum terdaftar di database.")
      return null
    }

    // 1. Mengambil Daftar Akun Google Business (Account ID)
    const accountRes = await oauth2Client.request({
      url: 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      method: 'GET'
    })
    
    const accounts = (accountRes.data as any).accounts
    if (!accounts || accounts.length === 0) {
      console.log("❌ Tidak ada akun bisnis yang terhubung dengan email ini.")
      return null
    }
    
    // Kita ambil akun pertama
    const accountName = accounts[0].name 
    const accountId = accountName.split('/')[1]

    // 2. Mengambil Daftar Lokasi Bisnis (Location ID)
    const locationRes = await oauth2Client.request({
      url: `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title`,
      method: 'GET'
    })

    const locations = (locationRes.data as any).locations
    if (!locations || locations.length === 0) {
      console.log("❌ Tidak ada lokasi bisnis (toko) yang ditemukan di akun ini.")
      return null
    }

    // Kita ambil lokasi pertama
    const locationName = locations[0].name 
    const locationId = locationName.split('/')[3]
    const namaBisnisAsli = locations[0].title

    // 3. Simpan ke Database
    const tokenResponse = await oauth2Client.getAccessToken()
    
    const bisnis = await prisma.business.upsert({
      where: { gbpLocationId: locationId },
      update: {
        accessToken: tokenResponse.token || "",
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      },
      create: {
        userId: user.id,
        gbpLocationId: locationId,
        gbpAccountId: accountId,
        name: namaBisnisAsli,
        accessToken: tokenResponse.token || "",
        refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        isActive: true
      }
    })

    console.log(`✅ Bisnis Asli "${bisnis.name}" berhasil ditarik dan disimpan!`)
    return bisnis

  } catch (error: any) {
    console.error("❌ Gagal menarik data bisnis asli:", error.response?.data || error.message)
    return null
  }
}

/**
 * Langkah 2: Menarik ulasan pelanggan yang sesungguhnya dari Google Maps
 */
export async function tarikDanSimpanUlasan(businessId: string) {
  try {
    console.log("⏳ Menarik ulasan pelanggan asli dari Google Maps...")
    
    const bisnis = await prisma.business.findUnique({
      where: { id: businessId }
    })

    if (!bisnis) return

    oauth2Client.setCredentials({
      access_token: bisnis.accessToken,
      refresh_token: bisnis.refreshToken
    })

    const accountName = `accounts/${bisnis.gbpAccountId}`
    const locationName = `locations/${bisnis.gbpLocationId}`

    // 4. Mengambil Ulasan (Reviews) Menggunakan Google My Business API v4
    const reviewsRes = await oauth2Client.request({
      url: `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews`,
      method: 'GET'
    })

    const reviews = (reviewsRes.data as any).reviews
    
    if (!reviews || reviews.length === 0) {
      console.log("📊 Tidak ada ulasan pelanggan yang ditemukan di toko ini.")
      return 0
    }

    let ulasanBaruCount = 0

    // Loop data ulasan asli dan simpan ke database
    for (const rev of reviews) {
      
      const ratingMapping: { [key: string]: number } = {
        'ONE': 1, 'TWO': 2, 'THREE': 3, 'FOUR': 4, 'FIVE': 5
      }
      
      const ulasan = await prisma.review.upsert({
        where: { gbpReviewId: rev.reviewId },
        update: {},
        create: {
          businessId: bisnis.id,
          gbpReviewId: rev.reviewId,
          reviewerName: rev.reviewer.displayName,
          rating: ratingMapping[rev.starRating] || 0,
          comment: rev.comment || "-",
          publishedAt: new Date(rev.createTime),
          status: "NEW"
        }
      })
      
      if (ulasan.createdAt >= new Date(Date.now() - 5000)) {
        ulasanBaruCount++
      }
    }

    console.log(`📊 Sinkronisasi selesai. Berhasil menarik ${ulasanBaruCount} ulasan pelanggan asli.`)
    return ulasanBaruCount

  } catch (error: any) {
    console.error("❌ Gagal menarik ulasan pelanggan:", error.response?.data || error.message)
  }
}