import { PrismaClient } from '@prisma/client'
import { google } from 'googleapis'

const prisma = new PrismaClient()

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'https://gray-maker-smelting.ngrok-free.dev/api/auth/callback/google'
)

export async function simpanBisnisKeDatabase(telegramId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { googleAccounts: true }
    })

    const googleAccount = user?.googleAccounts?.[0]

    if (!user || !googleAccount) {
      return null
    }

    oauth2Client.setCredentials({
      access_token: googleAccount.accessToken,
      refresh_token: googleAccount.refreshToken
    })

    const accountRes = await oauth2Client.request({
      url: 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts',
      method: 'GET'
    })
    
    const accounts = (accountRes.data as any).accounts
    if (!accounts || accounts.length === 0) {
      return null
    }
    
    const accountName = accounts[0].name 
    const accountId = accountName.split('/')[1]

    const locationRes = await oauth2Client.request({
      url: `https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title`,
      method: 'GET'
    })

    const locations = (locationRes.data as any).locations
    if (!locations || locations.length === 0) {
      return null
    }

    const locationName = locations[0].name 
    const locationId = locationName.split('/')[3]
    const namaBisnisAsli = locations[0].title

    const bisnis = await prisma.business.upsert({
      where: { gbpLocationId: locationId },
      update: {},
      create: {
        userId: user.id,
        googleAccountId: googleAccount.id,
        gbpLocationId: locationId,
        gbpAccountId: accountId,
        name: namaBisnisAsli,
        isActive: true
      }
    })

    return bisnis
  } catch (error: any) {
    return null
  }
}

export async function tarikDanSimpanUlasan(businessId: string) {
  try {
    const bisnis = await prisma.business.findUnique({
      where: { id: businessId },
      include: { googleAccount: true }
    })

    const akunGoogle = bisnis?.googleAccount

    if (!bisnis || !akunGoogle) return 0

    oauth2Client.setCredentials({
      access_token: akunGoogle.accessToken,
      refresh_token: akunGoogle.refreshToken
    })

    const accountName = `accounts/${bisnis.gbpAccountId}`
    const locationName = `locations/${bisnis.gbpLocationId}`

    const reviewsRes = await oauth2Client.request({
      url: `https://mybusiness.googleapis.com/v4/${accountName}/${locationName}/reviews`,
      method: 'GET'
    })

    const reviews = (reviewsRes.data as any).reviews
    
    if (!reviews || reviews.length === 0) {
      return 0
    }

    let ulasanBaruCount = 0

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

    return ulasanBaruCount
  } catch (error: any) {
    return 0
  }
}