import { Bot, InlineKeyboard } from 'grammy'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

export function createAlertService(bot: Bot) {
  return {
    async sendReviewAlert(businessId: string, telegramId: string, businessName: string, review: any) {
      try {
        const rating = '⭐'.repeat(review.rating)
        const messageText = `🔔 <b>ULASAN BARU MASUK</b>\n🏢 <b>${businessName}</b>\n━━━━━━━━━━━━━━━━━━\n👤 <b>Pelanggan:</b> ${review.reviewerName}\n🌟 <b>Penilaian:</b> ${rating}\n💬 <i>"${review.comment || 'Tidak ada teks'}"</i>\n\nSistem telah memasukkan ulasan ini ke dalam antrean.`

        const keyboard = new InlineKeyboard().text('📥 Buka Pusat Balas Ulasan', 'go_antrean')

        const message = await bot.api.sendMessage(telegramId, messageText, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        })

        await prisma.notification.create({
          data: {
            businessId,
            notificationType: 'REVIEW_ALERT',
            message: `Ulasan baru dari ${review.reviewerName}`,
            status: 'SENT',
            telegramMessageId: message.message_id.toString()
          }
        })

        return { success: true, messageId: message.message_id }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    },

    async sendSummaryAlert(telegramId: string, businessName: string, businessId: string, count: number) {
      try {
        const text = `⏰ <b>PENGINGAT ANTREAN</b>\n━━━━━━━━━━━━━━━━━━\n\nSaat ini terdapat <b>${count} ulasan pelanggan</b> di cabang <b>${businessName}</b> yang belum dibalas.\n\nJangan biarkan pelanggan merasa diabaikan. Klik tombol di bawah untuk memproses antrean!`
        
        const keyboard = new InlineKeyboard().text('🚀 Balas Sekarang', `antrean_${businessId}`)
        
        await bot.api.sendMessage(telegramId, text, {
          parse_mode: 'HTML',
          reply_markup: keyboard
        })

        return { success: true }
      } catch (error: any) {
        return { success: false, error: error.message }
      }
    }
  }
}