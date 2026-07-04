import { GoogleGenerativeAI } from '@google/generative-ai'

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
const model = genAI.getGenerativeModel({ model: 'gemini-flash-lite-latest' })

export async function generateReply(
  reviewerName: string,
  rating: number,
  comment: string,
  businessName: string
): Promise<string> {
  try {
    const prompt = `
      Kamu adalah asisten virtual untuk bisnis UMKM bernama "${businessName}".
      Tugasmu adalah membalas ulasan pelanggan di Google Maps secara profesional, ramah, dan bernada lokal (Indonesia).
      
      Detail Ulasan:
      - Nama Pelanggan: ${reviewerName}
      - Rating: ${rating} dari 5 bintang
      - Komentar: "${comment}"
      
      Instruksi:
      1. Jika rating 4-5: Ucapkan terima kasih dengan antusias atas komentar mereka.
      2. Jika rating 1-3: Minta maaf atas ketidaknyamanan, berikan empati, dan tawarkan solusi.
      3. Balasan harus singkat, tidak lebih dari 3 kalimat.
      4. Jangan gunakan bahasa robot. Gunakan gaya bahasa ramah dan sopan (misal: menggunakan kata "Kak", dsb).
      5. Langsung berikan teks balasannya saja, tanpa basa-basi pengantar.
    `

    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (error: any) {
    return "Maaf, AI sedang mengalami gangguan saat meracik balasan. Silakan balas manual."
  }
}

export async function generateReplyNoComment(
  reviewerName: string,
  rating: number,
  businessName: string
): Promise<string> {
  try {
    const prompt = `
      Kamu adalah asisten virtual untuk bisnis UMKM bernama "${businessName}".
      Tugasmu adalah membalas ulasan pelanggan di Google Maps secara profesional, ramah, dan bernada lokal (Indonesia).
      
      Detail Ulasan:
      - Nama Pelanggan: ${reviewerName}
      - Rating: ${rating} dari 5 bintang
      - Komentar: (Pelanggan hanya meninggalkan bintang tanpa menuliskan ulasan)
      
      Instruksi:
      1. Jika rating 4-5: Ucapkan terima kasih atas penilaian bintang yang diberikan.
      2. Jika rating 1-3: Minta maaf jika ada pengalaman yang kurang maksimal dan persilakan mereka menghubungi manajemen jika ada masukan.
      3. Balasan harus singkat, maksimal 2 kalimat saja.
      4. Gaya bahasa ramah dan sopan.
      5. Langsung berikan teks balasannya saja, tanpa basa-basi pengantar.
    `

    const result = await model.generateContent(prompt)
    return result.response.text().trim()
  } catch (error: any) {
    return "Maaf, AI sedang mengalami gangguan saat meracik balasan. Silakan balas manual."
  }
}