import { serve } from '@hono/node-server'
import { prisma } from './db.ts'
import { createApp } from './app.ts'
import { seedDatabase } from '../prisma/seed.ts'

const port = Number(process.env.PORT ?? 43124)
const hostname = '0.0.0.0'

const companies = await prisma.company.count()
if (companies === 0) {
  await seedDatabase()
  console.log('Seeded Northline Goods.')
}

serve({ fetch: createApp().fetch, port, hostname }, () => {
  console.log(`Keel API http://${hostname}:${port}`)
})
