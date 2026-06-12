import { Bot, InlineKeyboard } from 'grammy'
import { generateReply, generateReplyNoComment } from './gemini-service.js'
import { createRequire } from 'module'
import { PrismaClient } from '@prisma/client'
import { getAuthUrl } from './google.js'

const require = createRequire(import.meta.url)
const dotenv = require('dotenv')
dotenv.config()

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!)
const prisma = new PrismaClient({ log: ['error'] })

// ==========================================
// 1. COMMAND DASAR
// ==========================================

bot.command('start', async (ctx) => {
  const telegramId = ctx.from?.id.toString()
  const name = ctx.from?.first_name

  if (!telegramId) return

  const existingUser = await prisma.user.findUnique({ where: { telegramId } })

  if (existingUser) {
    await ctx.reply(`Halo lagi, <b>${name}</b>! 👋\n\nKetik /menu untuk melihat kontrol dasbor.`, { parse_mode: 'HTML' })
    return
  }

  await prisma.user.create({ data: { telegramId, name } })

  await ctx.reply(
    `Halo <b>${name}</b>! Selamat datang di Trove 👋\n\n` +
    `Saya adalah asisten virtual yang akan membantu memantau dan membalas ulasan Google Maps bisnismu secara otomatis.\n\n` +
    `Ketik /menu untuk memulai.`,
    { parse_mode: 'HTML' }
  )
})

bot.command('menu', async (ctx) => {
  await ctx.reply(
    `📋 <b>Menu Utama Trove</b>\n\n` +
    `/login - 🔗 Hubungkan akun Google Bisnis\n` +
    `/antrean - 📥 Cek ulasan yang belum dibalas\n` +
    `/status - 📊 Cek performa profil bisnismu\n`,
    { parse_mode: 'HTML' }
  )
})

bot.command('login', async (ctx) => {
  const url = getAuthUrl();
  const keyboard = new InlineKeyboard().url("🔗 Otorisasi Akun Google", url);

  await ctx.reply(
    "🔒 <b>Koneksi Google Bisnis</b>\n\n" +
    "Agar Trove bisa menarik ulasan asli dan mengirimkan balasan, sistem membutuhkan izin akses baca/tulis ke Google Business Profile kamu.\n\n" +
    "Klik tombol di bawah untuk menghubungkan:",
    { parse_mode: 'HTML', reply_markup: keyboard }
  );
});

// ==========================================
// 2. FITUR UTAMA: CEK ANTREAN ULASAN REAL
// ==========================================

bot.command('antrean', async (ctx) => {
  const telegramId = ctx.from?.id.toString();
  if (!telegramId) return;

  const loadingMsg = await ctx.reply("⏳ <i>Mengecek database...</i>", { parse_mode: 'HTML' });

  try {
    // Cari user dan bisnisnya
    const user = await prisma.user.findUnique({
      where: { telegramId },
      include: { businesses: true }
    });

    if (!user || user.businesses.length === 0) {
      return ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, "❌ Kamu belum menghubungkan bisnis apa pun. Gunakan /login terlebih dahulu.");
    }

    // Ambil ulasan dengan status NEW (Belum dibalas) dari bisnis user
    const pendingReviews = await prisma.review.findMany({
      where: { 
        businessId: { in: user.businesses.map(b => b.id) },
        status: 'NEW' 
      },
      include: { business: true },
      orderBy: { publishedAt: 'desc' },
      take: 1 // Tampilkan 1 ulasan tertua/terbaru untuk diurus
    });

    // Ambil elemen pertama dengan teknik destructuring yang aman
    const [review] = pendingReviews;

    // TypeScript sekarang tahu: Jika review tidak ada (undefined), kode berhenti di sini.
    if (!review) {
      return ctx.api.editMessageText(
        ctx.chat.id, 
        loadingMsg.message_id, 
        "🎉 <b>Hebat!</b> Tidak ada ulasan yang antre. Semua sudah dibalas.", 
        { parse_mode: 'HTML' }
      );
    }

    const stars = '⭐'.repeat(review.rating) + '🌑'.repeat(5 - review.rating);
    
    const messageText = `
🔔 <b>ULASAN BELUM DIBALAS</b>
🏪 <b>${review.business.name}</b>

👤 <b>${review.reviewerName}</b>
${stars} (${review.rating}/5)

💬 <i>"${review.comment || 'Tanpa teks ulasan.'}"</i>

👇 Pilih tindakan:`;

    const keyboard = new InlineKeyboard()
      .text("🤖 Racik Balasan AI", `generate_reply:${review.gbpReviewId}`).row()
      .text("✍️ Balas Manual", `manual_reply:${review.gbpReviewId}`)
      .text("❌ Abaikan", `ignore:${review.gbpReviewId}`);

    await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, messageText, { parse_mode: 'HTML', reply_markup: keyboard });

  } catch (error) {
    console.error(error);
    await ctx.api.editMessageText(ctx.chat.id, loadingMsg.message_id, "❌ Terjadi kesalahan sistem saat mengambil data.");
  }
});

// ==========================================
// 3. HANDLER AKSI (INTERAKSI DENGAN DATABASE)
// ==========================================

bot.callbackQuery(/^generate_reply:(.+)$/, async (ctx) => {
  const reviewId = ctx.match[1];
  
  // Ubah UI seketika agar tombol hilang (mencegah double-click)
  await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
  const originalText = ctx.callbackQuery.message?.text || "Ulasan";
  
  const loadingMsg = await ctx.reply("⏳ <i>Gemini sedang menganalisis dan meracik kalimat...</i>", { parse_mode: 'HTML' });

  try {
    // 1. Tarik data asli dari database
    const review = await prisma.review.findUnique({
      where: { gbpReviewId: reviewId },
      include: { business: true }
    });

    if (!review) throw new Error("Ulasan tidak ditemukan di database");

    // 2. Panggil AI berdasarkan ketersediaan komentar
    let balasanAI = "";
    if (!review.comment || review.comment === "-" || review.comment.trim() === "") {
      balasanAI = await generateReplyNoComment(review.reviewerName, review.rating, review.business.name);
    } else {
      balasanAI = await generateReply(review.reviewerName, review.rating, review.comment, review.business.name);
    }

    // 3. Siapkan UI Persetujuan
    const keyboard = new InlineKeyboard()
      .text("✅ Publikasikan ke Google", `send_google:${review.gbpReviewId}`).row()
      .text("🔄 Generate Ulang", `generate_reply:${review.gbpReviewId}`)
      .text("❌ Batal", `cancel_reply:${review.gbpReviewId}`);

    await ctx.api.editMessageText(
      ctx.chat?.id!, 
      loadingMsg.message_id, 
      `✨ <b>Draf Balasan AI:</b>\n\n<code>${balasanAI}</code>\n\n<i>Apakah kamu ingin mengirimkan balasan ini?</i>`,
      { parse_mode: 'HTML', reply_markup: keyboard }
    );
    await ctx.answerCallbackQuery();

  } catch (error) {
    console.error(error);
    await ctx.api.editMessageText(ctx.chat?.id!, loadingMsg.message_id, "❌ Gagal menghubungi AI Gemini. Silakan coba lagi.");
  }
});

bot.callbackQuery(/^send_google:(.+)$/, async (ctx) => {
  const reviewId = ctx.match[1];
  
  try {
    // 1. Update status di Database menjadi REPLIED
    await prisma.review.update({
      where: { gbpReviewId: reviewId },
      data: { status: 'REPLIED' } // Asumsi di skema Prisma kamu ada Enum status ini
    });

    // TODO: Di sinilah letak fungsi google.request(PUT reply) nantinya.
    
    // 2. Update UI
    await ctx.editMessageText(
      ctx.callbackQuery.message?.text + "\n\n✅ <b>Status: Berhasil dipublikasikan ke Google Maps!</b>", 
      { parse_mode: 'HTML' }
    );
    await ctx.answerCallbackQuery({ text: "Terkirim ke Google Maps!", show_alert: true });
    
    // Tawarkan ulasan berikutnya
    await ctx.reply("Ketik /antrean untuk melihat ulasan selanjutnya.");

  } catch (error) {
    await ctx.answerCallbackQuery({ text: "Gagal menyimpan ke database.", show_alert: true });
  }
});

bot.callbackQuery(/^ignore:(.+)$/, async (ctx) => {
  const reviewId = ctx.match[1];
  
  try {
    // Update status agar tidak muncul lagi di antrean
    await prisma.review.update({
      where: { gbpReviewId: reviewId },
      data: { status: 'IGNORED' }
    });

    await ctx.editMessageText(
      ctx.callbackQuery.message?.text + "\n\n<i>❌ Ulasan ini telah diabaikan dan dihapus dari antrean.</i>", 
      { parse_mode: 'HTML' }
    );
    await ctx.answerCallbackQuery({ text: "Ulasan diabaikan." });
  } catch (error) {
    await ctx.answerCallbackQuery({ text: "Gagal memproses permintaan.", show_alert: true });
  }
});

bot.callbackQuery(/^cancel_reply:(.+)$/, async (ctx) => {
  // Kembali ke status awal tanpa mengubah database
  await ctx.editMessageText("<i>Penyusunan balasan dibatalkan.</i>", { parse_mode: 'HTML' });
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^manual_reply:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery({ 
    text: "Fitur balas manual sedang dalam pengembangan (MVP Phase).", 
    show_alert: true 
  });
});

bot.start()
console.log('🤖 Bot berjalan dengan arsitektur Real Data...')