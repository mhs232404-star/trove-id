import { google, Auth } from 'googleapis'

// Inisialisasi OAuth2 menggunakan data dari .env
export const oauth2Client: Auth.OAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/api/auth/callback/google' // Harus sama persis dengan yang di Google Cloud!
)

// Fungsi untuk membuat link login
export function getAuthUrl() {
  // Scope (ruang lingkup izin) untuk membaca dan membalas ulasan bisnis
  const scopes = [
    'https://www.googleapis.com/auth/business.manage'
  ]

  return oauth2Client.generateAuthUrl({
    access_type: 'offline', // Wajib 'offline' agar Google memberikan refreshToken
    prompt: 'consent',      // Memaksa layar persetujuan muncul
    scope: scopes,
  })
}