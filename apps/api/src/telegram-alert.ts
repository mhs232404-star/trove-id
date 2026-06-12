import { bot } from './bot.js'; // Pastikan bot Telegram kamu diekspor dari file utama bot

/**
 * Fungsi ini akan dipanggil setiap kali cron job/webhook mendeteksi
 * ada baris ulasan baru (status: NEW) di tabel database kamu.
 */
export async function sendNewReviewAlert(
  telegramId: string,
  reviewId: string,
  businessName: string,
  reviewerName: string,
  rating: number,
  comment: string
) {
  // Membuat visualisasi bintang
  const stars = '⭐'.repeat(rating) + '🌑'.repeat(5 - rating);

  const messageText = `
🔔 <b>ULASAN BARU MASUK!</b>
🏪 <b>${businessName}</b>

👤 <b>${reviewerName}</b> memberikan nilai:
${stars} (${rating}/5)

💬 <i>"${comment || 'Tidak ada teks komentar.'}"</i>

👇 Pilih tindakan untuk ulasan ini:
  `;

  try {
    await bot.telegram.sendMessage(telegramId, messageText, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            // Tombol ini akan memicu Gemini untuk meracik balasan
            { text: '🤖 Buat Balasan AI', callback_data: `generate_reply:${reviewId}` }
          ],
          [
            // Tombol ini jika pemilik bisnis ingin mengetik manual
            { text: '✍️ Balas Manual', callback_data: `manual_reply:${reviewId}` },
            { text: '✅ Abaikan', callback_data: `ignore:${reviewId}` }
          ]
        ]
      }
    });
    console.log(`✅ Alert ulasan berhasil dikirim ke Telegram ID: ${telegramId}`);
  } catch (error: any) {
    console.error("❌ Gagal mengirim alert Telegram:", error.message);
  }
}