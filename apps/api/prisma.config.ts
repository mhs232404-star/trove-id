import path from 'node:path'
import * as dotenv from 'dotenv'

dotenv.config({ path: path.join(__dirname, '.env') })

export default {
  schema: path.join(__dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
}