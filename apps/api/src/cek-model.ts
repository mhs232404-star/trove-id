import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const dotenv = require('dotenv');
dotenv.config();

async function cekDaftarModel() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log("❌ GEMINI_API_KEY belum terbaca di .env");
    return;
  }

  console.log("🔍 Sedang bertanya ke server Google...");
  
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();

    if (data.models) {
      console.log("\n✅ Ini daftar model yang TERSEDIA untuk API Key kamu:");
      console.log("-----------------------------------------------------");
      data.models.forEach((m: any) => {
        // Kita hanya tampilkan model yang bisa dipakai untuk membalas teks (generateContent)
        if (m.supportedGenerationMethods.includes('generateContent')) {
          console.log(`- ${m.name.replace('models/', '')}`);
        }
      });
      console.log("-----------------------------------------------------");
      console.log("👉 Silakan COPAS salah satu nama di atas ke dalam gemini.ts kamu!");
    } else {
      console.log("❌ Gagal mengambil data:", data);
    }
  } catch (error) {
    console.log("❌ Terjadi kesalahan jaringan:", error);
  }
}

cekDaftarModel();