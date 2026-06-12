import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const dotenv = require('dotenv')
dotenv.config()

import { generateReply } from './gemini-service.js'

const result = await generateReply(
  'Budi',
  2,
  'Pelayanannya lambat sekali, hampir 30 menit baru dilayani.',
  'Warung Makan Bu Sari'
)

console.log('Saran balasan:')
console.log(result)