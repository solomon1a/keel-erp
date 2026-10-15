import { execSync } from 'node:child_process'
import { seedDatabase } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'

export async function resetAndSeed() {
  execSync('npx tsx prisma/reset.ts', {
    stdio: 'pipe',
    env: process.env,
  })
  execSync('npx prisma migrate deploy', {
    stdio: 'pipe',
    env: process.env,
  })
  await seedDatabase(prisma)
}
