import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// Memaksa Node.js membaca .env SEBELUM yang lain
require('dotenv').config();

import * as http from 'http';
import { google } from 'googleapis';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = 'http://localhost:3000/api/auth/callback/google';

if (!clientId || !clientSecret) {
  console.log("❌ Error: Kunci di file .env belum terbaca!");
  process.exit(1);
}

// Membuat mesin OAuth yang benar-benar baru di sini
const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: ['https://www.googleapis.com/auth/business.manage'],
});

const server = http.createServer(async (req, res) => {
  if (req.url && req.url.startsWith('/api/auth/callback/google')) {
    const urlObj = new URL(req.url, 'http://localhost:3000');
    const code = urlObj.searchParams.get('code');

    if (code) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>✅ Autentikasi Sukses!</h1><p>Server berhasil menangkap kode. Silakan tutup browser ini dan cek terminal VS Code kamu.</p>');
      
      console.log("\n🎯 KODE TERTANGKAP OTOMATIS! Menukar dengan token...");
      try {
        const { tokens } = await oauth2Client.getToken(code);
        console.log("\n🎉 BERHASIL TOTAL! Ini dia Kunci Token kamu:");
        console.log("========================================");
        console.log("🔑 Access Token  :", tokens.access_token?.substring(0, 30) + "...");
        console.log("♻️ Refresh Token :", tokens.refresh_token);
        console.log("========================================");
        console.log("👉 SIMPAN Refresh Token ini, tugas integrasi Google kita selesai!");
        
        process.exit(0);
      } catch (error: any) {
        console.error("❌ Gagal menukar kode:", error.message);
        process.exit(1);
      }
    }
  }
});

server.listen(3000, () => {
  console.log("🤖 Server penangkap token otomatis menyala di port 3000...");
  console.log("👉 KLIK LINK INI:\n" + authUrl);
});