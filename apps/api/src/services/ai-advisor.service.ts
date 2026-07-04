import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export async function generateAIRecommendations(businessId: string) {
  try {
    console.log(`💡 Generating AI recommendations untuk bisnis: ${businessId}`)

    const healthScore = await prisma.healthScore.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' }
    })

    if (!healthScore) {
      console.log('⚠️ Tidak ada health score untuk generate recommendations')
      return []
    }

    const recommendations: Array<{
      priority: string
      category: string
      recommendation: string
      reason: string
      expectedImpact: string
      implementationSteps: string[]
    }> = []

    if (healthScore.averageRating >= 4 && healthScore.responseRate < 70) {
      recommendations.push({
        priority: 'HIGH',
        category: 'Response Rate',
        recommendation: 'Tingkatkan response rate dengan menjawab semua review dalam 24 jam',
        reason: `Rating bisnis Anda bagus (${healthScore.averageRating.toFixed(1)}/5) namun masih banyak review yang belum dijawab (${healthScore.responseRate.toFixed(1)}%). Pelanggan menghargai balasan cepat.`,
        expectedImpact: 'Meningkatkan kepercayaan pelanggan 15-20% dan boost SEO di Google Maps',
        implementationSteps: [
          'Pasang notifikasi review baru di team Anda',
          'Buat template jawaban untuk review positif',
          'Prioritaskan review negatif untuk dijawab terlebih dahulu',
          'Target: jawab semua review dalam 24 jam'
        ]
      })
    }

    if (healthScore.positiveReviewsPercent < 70 && healthScore.totalReviews > 10) {
      recommendations.push({
        priority: 'CRITICAL',
        category: 'Review Management',
        recommendation: 'Ada peningkatan review negatif - butuh investigation dan action plan',
        reason: `Hanya ${healthScore.positiveReviewsPercent.toFixed(1)}% review Anda yang positif. Ini bisa mempengaruhi rating dan trust pelanggan baru.`,
        expectedImpact: 'Stabilisasi rating dan cegah penurunan lebih lanjut',
        implementationSteps: [
          'Identifikasi pola complain di review negatif',
          'Hubungi reviewer untuk understanding masalah mereka',
          'Buat action plan untuk improvement',
          'Follow-up dengan reviewer setelah perbaikan'
        ]
      })
    }

    if (healthScore.responseTimeHours > 48) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Customer Service',
        recommendation: 'Percepat response time untuk meningkatkan customer satisfaction',
        reason: `Rata-rata response time Anda ${healthScore.responseTimeHours.toFixed(1)} jam. Customer prefer response dalam 24 jam.`,
        expectedImpact: 'Tingkatkan customer satisfaction dan response positivity',
        implementationSteps: [
          'Delegate review management ke team member',
          'Setup automated preliminary response untuk review',
          'Monitor daily dan target <24 jam',
          'Weekly review of response quality'
        ]
      })
    }

    if (healthScore.totalReviews < 20) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'Review Generation',
        recommendation: 'Dorong pelanggan untuk meninggalkan review',
        reason: `Hanya ${healthScore.totalReviews} review dalam 90 hari terakhir. Review baru membantu kredibilitas dan SEO.`,
        expectedImpact: 'Lebih banyak social proof dan organic traffic dari Google Maps',
        implementationSteps: [
          'Minta pelanggan satisfied untuk review',
          'Send follow-up email/SMS setelah purchase',
          'Add review link di signature dan marketing materials',
          'Target: 3-5 review per minggu'
        ]
      })
    }

    if (healthScore.overallScore >= 80) {
      recommendations.push({
        priority: 'LOW',
        category: 'Maintenance',
        recommendation: 'Maintain momentum dengan consistency',
        reason: 'Health score Anda sudah excellent. Focus pada konsistensi dan continuous improvement.',
        expectedImpact: 'Maintain reputation dan trust',
        implementationSteps: [
          'Continue answering all reviews',
          'Monthly review of metrics',
          'Stay engaged dengan customers'
        ]
      })
    }

    await prisma.aIRecommendation.deleteMany({
      where: {
        businessId,
        createdAt: {
          lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        }
      }
    })

    for (const rec of recommendations) {
      await prisma.aIRecommendation.create({
        data: {
          businessId,
          priority: rec.priority,
          category: rec.category,
          recommendation: rec.recommendation,
          reason: rec.reason,
          expectedImpact: rec.expectedImpact,
          implementationSteps: rec.implementationSteps
        }
      })
    }

    console.log(`✅ Generated ${recommendations.length} recommendations`)
    return recommendations
  } catch (error: any) {
    console.error('❌ Error generating recommendations:', error.message)
    throw error
  }
}

export async function getRecommendations(businessId: string) {
  try {
    const recommendations = await prisma.aIRecommendation.findMany({
      where: {
        businessId,
        isCompleted: false
      },
      orderBy: [
        {
          priority: 'desc'
        },
        {
          createdAt: 'desc'
        }
      ]
    })

    return recommendations
  } catch (error: any) {
    console.error('❌ Error getting recommendations:', error.message)
    return []
  }
}

export async function completeRecommendation(recommendationId: string) {
  try {
    const updated = await prisma.aIRecommendation.update({
      where: { id: recommendationId },
      data: {
        isCompleted: true,
        completedAt: new Date()
      }
    })

    console.log(`✅ Recommendation marked as completed`)
    return updated
  } catch (error: any) {
    console.error('❌ Error completing recommendation:', error.message)
    throw error
  }
}