import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { businessTemplates } from './templates.js'

const prisma = new PrismaClient()

export function scheduleReviewMonitoringTask(alertService: any) {
  cron.schedule('* * * * *', async () => {
    try {
      const activeBusinesses = await prisma.business.findMany({
        where: { isActive: true },
        include: { reviews: true, user: true }
      })

      const timestamp = Date.now()

      for (const business of activeBusinesses) {
        const template = businessTemplates.find(t => t.name === business.name)
        if (template) {
          const existingReviewNames = business.reviews.map(r => r.reviewerName)
          const newReviews = template.reviews.filter(r => !existingReviewNames.includes(r.reviewerName))

          if (newReviews.length > 0) {
            const reviewsToInsert = newReviews.map((r, index) => ({
              businessId: business.id,
              gbpReviewId: `AUTO_SYNC_${business.id}_${index}_${timestamp}`,
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
          }
        }
      }

      const newReviewsInDb = await prisma.review.findMany({
        where: {
          status: 'NEW',
          business: { isActive: true }
        },
        include: {
          business: { include: { user: true } }
        }
      })

      if (newReviewsInDb.length === 0) return

      for (const review of newReviewsInDb) {
        try {
          await alertService.sendReviewAlert(
            review.businessId,
            review.business.user.telegramId,
            review.business.name,
            review
          )

          await prisma.review.update({
            where: { id: review.id },
            data: { status: 'NOTIFIED' }
          })
        } catch (error) {}
      }
    } catch (error) {}
  })
}

export function schedulePeriodicReminderTask(alertService: any) {
  cron.schedule('0 * * * *', async () => {
    try {
      const businesses = await prisma.business.findMany({
        where: { isActive: true },
        include: {
          user: true,
          reviews: {
            where: { status: { in: ['NOTIFIED', 'DRAFT'] } }
          }
        }
      })

      for (const business of businesses) {
        const pendingCount = business.reviews.length
        
        if (pendingCount > 0 && business.user?.telegramId) {
          try {
            await alertService.sendSummaryAlert(
              business.user.telegramId,
              business.name,
              business.id,
              pendingCount
            )
          } catch (error) {}
        }
      }
    } catch (error) {}
  })
}

export function startAllSchedulers(alertService: any) {
  scheduleReviewMonitoringTask(alertService)
  schedulePeriodicReminderTask(alertService)
}