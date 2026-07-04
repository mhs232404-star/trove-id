import { PrismaClient } from '@prisma/client'
import { startOfWeek, endOfWeek, subWeeks } from 'date-fns'

const prisma = new PrismaClient()

export async function generateWeeklyReport(businessId: string) {
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId }
    })

    if (!business) {
      return null
    }

    const now = new Date()
    const prevWeekStart = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })
    const prevWeekEnd = endOfWeek(subWeeks(now, 1), { weekStartsOn: 1 })

    const prevWeekScore = await prisma.healthScore.findFirst({
      where: {
        businessId,
        createdAt: {
          gte: prevWeekStart,
          lte: prevWeekEnd
        }
      },
      orderBy: { createdAt: 'asc' }
    })

    const currentWeekScore = await prisma.healthScore.findFirst({
      where: {
        businessId,
        createdAt: {
          gte: prevWeekEnd
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const weeklyReviews = await prisma.review.findMany({
      where: {
        businessId,
        publishedAt: {
          gte: prevWeekStart,
          lte: prevWeekEnd
        }
      }
    })

    const positiveCount = weeklyReviews.filter(r => r.rating >= 4).length
    const negativeCount = weeklyReviews.filter(r => r.rating <= 2).length

    const recommendations = await prisma.aIRecommendation.findMany({
      where: { businessId },
      orderBy: { priority: 'desc' },
      take: 3
    })

    const healthScoreStart = prevWeekScore?.overallScore || 0
    const healthScoreEnd = currentWeekScore?.overallScore || 0
    const avgResponseTime = currentWeekScore?.responseTimeHours || 0

    const summary = generateSummary({
      businessName: business.name,
      healthScoreStart,
      healthScoreEnd,
      reviewsTotal: weeklyReviews.length,
      reviewsPositive: positiveCount,
      reviewsNegative: negativeCount,
      avgResponseTime,
      recommendations
    })

    const report = await prisma.weeklyReport.create({
      data: {
        businessId,
        reportDate: prevWeekEnd,
        healthScoreStart,
        healthScoreEnd,
        reviewsCountNew: weeklyReviews.length,
        reviewsPositiveCount: positiveCount,
        reviewsNegativeCount: negativeCount,
        avgResponseTime,
        recommendations: summary,
        reportContent: {
          businessName: business.name,
          period: {
            start: prevWeekStart.toISOString(),
            end: prevWeekEnd.toISOString()
          },
          scoreChange: healthScoreEnd - healthScoreStart,
          recommendations: recommendations.map(r => ({
            category: r.category,
            priority: r.priority,
            recommendation: r.recommendation
          }))
        }
      }
    })

    return report
  } catch (error: any) {
    throw error
  }
}

function generateSummary(data: {
  businessName: string
  healthScoreStart: number
  healthScoreEnd: number
  reviewsTotal: number
  reviewsPositive: number
  reviewsNegative: number
  avgResponseTime: number
  recommendations: any[]
}): string {
  const lines: string[] = []

  lines.push(`📊 *Ringkasan Laporan Minggu: ${data.businessName}*\n`)

  const scoreChange = data.healthScoreEnd - data.healthScoreStart
  const scoreEmoji = scoreChange > 0 ? '📈' : scoreChange < 0 ? '📉' : '➡️'
  lines.push(`🏥 Health Score: ${data.healthScoreStart} → ${data.healthScoreEnd} ${scoreEmoji}\n`)

  if (data.reviewsTotal > 0) {
    lines.push(`📝 Review Minggu Ini:`)
    lines.push(`  • Total: ${data.reviewsTotal}`)
    lines.push(`  • Positif: ${data.reviewsPositive} ✅`)
    lines.push(`  • Negatif: ${data.reviewsNegative} ❌`)
    lines.push(`  • Response Time: ${data.avgResponseTime.toFixed(1)} jam\n`)
  }

  if (data.recommendations.length > 0) {
    lines.push(`💡 Top Recommendations:`)
    data.recommendations.forEach((rec, i) => {
      lines.push(`${i + 1}. ${rec.category}: ${rec.recommendation}`)
    })
  }

  return lines.join('\n')
}

export async function getReports(businessId: string, limit = 10) {
  try {
    const reports = await prisma.weeklyReport.findMany({
      where: { businessId },
      orderBy: { reportDate: 'desc' },
      take: limit
    })
    return reports
  } catch (error: any) {
    return []
  }
}

export async function getLatestReport(businessId: string) {
  try {
    const report = await prisma.weeklyReport.findFirst({
      where: { businessId },
      orderBy: { reportDate: 'desc' }
    })
    return report
  } catch (error: any) {
    return null
  }
}