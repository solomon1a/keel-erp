import { PrismaClient } from '@prisma/client'

const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL
if (!url) throw new Error('Set DIRECT_URL or DATABASE_URL before resetting the database.')

const prisma = new PrismaClient({ datasources: { db: { url } } })

await prisma.$executeRawUnsafe('DROP SCHEMA IF EXISTS public CASCADE')
await prisma.$executeRawUnsafe('CREATE SCHEMA public')
await prisma.$executeRawUnsafe('GRANT ALL ON SCHEMA public TO public')
await prisma.$disconnect()
