import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function calculateHealthScore(businessId: string) {
  try {
    const reviews = await prisma.review.findMany({
      where: {
        businessId,
        publishedAt: {
          gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        }
      },
      include: {
        reply: true
      }
    })

    if (reviews.length === 0) {
      return null
    }

    const totalReviews = reviews.length
    const averageRating = reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
    const positiveReviews = reviews.filter(r => r.rating >= 4).length
    const positiveReviewsPercent = (positiveReviews / totalReviews) * 100
    const respondedReviews = reviews.filter(r => r.reply).length
    const responseRate = (respondedReviews / totalReviews) * 100

    let avgResponseTimeHours = 0
    const repliedReviews = reviews.filter(r => r.reply)
    
    if (repliedReviews.length > 0) {
      const totalResponseTime = repliedReviews.reduce((sum, r) => {
        const postedAt = r.reply?.postedAt
        const responseTime = postedAt
          ? (postedAt.getTime() - r.publishedAt.getTime()) / (1000 * 60 * 60)
          : 0
        return sum + responseTime
      }, 0)
      avgResponseTimeHours = totalResponseTime / repliedReviews.length
    }

    const weights = {
      averageRating: 30,
      responseRate: 25,
      responseTime: 20,
      sentimentScore: 15,
      engagementScore: 10
    }

    const ratingScore = (averageRating / 5) * 100
    const responseRateScore = Math.min(responseRate, 100)
    const responseTimeScore = calculateResponseTimeScore(avgResponseTimeHours)
    const sentimentScore = positiveReviewsPercent
    const engagementScore = calculateEngagementScore(totalReviews)

    const overallScore = Math.round(
      (ratingScore * weights.averageRating / 100) +
      (responseRateScore * weights.responseRate / 100) +
      (responseTimeScore * weights.responseTime / 100) +
      (sentimentScore * weights.sentimentScore / 100) +
      (engagementScore * weights.engagementScore / 100)
    )

    const healthScore = {
      businessId,
      overallScore,
      ratingScore: Math.round(ratingScore),
      responseRateScore: Math.round(responseRateScore),
      responseTimeScore: Math.round(responseTimeScore),
      sentimentScore: Math.round(sentimentScore),
      engagementScore: Math.round(engagementScore),
      averageRating: Math.round(averageRating * 10) / 10,
      responseRate: Math.round(responseRate * 10) / 10,
      responseTimeHours: Math.round(avgResponseTimeHours * 10) / 10,
      positiveReviewsPercent: Math.round(positiveReviewsPercent * 10) / 10,
      totalReviews
    }

    await prisma.healthScore.create({
      data: {
        businessId,
        overallScore: healthScore.overallScore,
        ratingScore: healthScore.ratingScore,
        responseRateScore: healthScore.responseRateScore,
        responseTimeScore: healthScore.responseTimeScore,
        sentimentScore: healthScore.sentimentScore,
        engagementScore: healthScore.engagementScore,
        averageRating: healthScore.averageRating,
        responseRate: healthScore.responseRate,
        responseTimeHours: healthScore.responseTimeHours,
        positiveReviewsPercent: healthScore.positiveReviewsPercent,
        totalReviews: healthScore.totalReviews,
        metadata: {
          weights,
          calculatedAt: new Date().toISOString()
        }
      }
    })

    return healthScore
  } catch (error: any) {
    throw error
  }
}

function calculateResponseTimeScore(avgResponseTimeHours: number): number {
  if (avgResponseTimeHours <= 24) {
    return 100
  } else if (avgResponseTimeHours <= 48) {
    return 80
  } else if (avgResponseTimeHours <= 72) {
    return 60
  } else if (avgResponseTimeHours <= 168) {
    return 40
  } else {
    return Math.max(0, 100 - (avgResponseTimeHours / 168) * 20)
  }
}

function calculateEngagementScore(totalReviews: number): number {
  if (totalReviews >= 50) {
    return 100
  } else if (totalReviews >= 30) {
    return 80
  } else if (totalReviews >= 10) {
    return 60
  } else if (totalReviews > 0) {
    return (totalReviews / 10) * 60
  } else {
    return 0
  }
}

export async function getLatestHealthScore(businessId: string) {
  try {
    const score = await prisma.healthScore.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' }
    })
    return score
  } catch (error: any) {
    return null
  }
}

export async function getHealthScoreHistory(businessId: string, days = 30) {
  try {
    const scores = await prisma.healthScore.findMany({
      where: {
        businessId,
        createdAt: {
          gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000)
        }
      },
      orderBy: { createdAt: 'asc' }
    })
    return scores
  } catch (error: any) {
    return []
  }
}