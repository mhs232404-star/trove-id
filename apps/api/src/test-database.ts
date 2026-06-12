import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const dotenv = require('dotenv')
dotenv.config()

import { simpanBisnisKeDatabase, tarikDanSimpanUlasan } from './maps-service.js'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log("🚀 Memulai pengujian integrasi Database & Google Service...\n")

  // 1. Ambil salah satu User dari database (Pastikan kamu sudah pernah ketik /start di bot Telegram)
  const user = await prisma.user.findFirst()
  
  if (!user) {
    console.log("❌ Database kamu masih kosong. Silakan buka bot Telegram dan ketik /start terlebih dahulu agar datamu masuk ke tabel User.")
    return
  }

  console.log(`👤 Menggunakan User: ${user.name} (${user.telegramId})`)

  // 2. Jalankan fungsi simpan bisnis
  const bisnis = await simpanBisnisKeDatabase(user.telegramId)

  if (bisnis) {
    // 3. Jalankan fungsi tarik ulasan
    await tarikDanSimpanUlasan(bisnis.id)
    
    // 4. Cek hasil akhir di database
    const totalUlasan = await prisma.review.count({
      where: { businessId: bisnis.id }
    })
    console.log(`\n🎉 PENGUJIAN SUKSES! Total ulasan di tabel 'Review': ${totalUlasan}`)
  }
}

main()