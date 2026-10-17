import { Prisma, PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function runtimeDatabaseUrl() {
  const url = process.env.DATABASE_URL
  if (!url) return undefined
  const onVercel = Boolean(process.env.VERCEL)
  const pooled = url.includes('-pooler') || url.includes('pgbouncer=true')
  if (!onVercel && !pooled) return url
  const parsed = new URL(url)
  if (!parsed.searchParams.has('connection_limit')) parsed.searchParams.set('connection_limit', '1')
  if (!parsed.searchParams.has('pool_timeout')) parsed.searchParams.set('pool_timeout', '15')
  if ((onVercel || pooled) && !parsed.searchParams.has('pgbouncer')) parsed.searchParams.set('pgbouncer', 'true')
  return parsed.toString()
}

const databaseUrl = runtimeDatabaseUrl()

export const prisma = globalForPrisma.prisma ?? new PrismaClient(databaseUrl ? { datasourceUrl: databaseUrl } : undefined)

globalForPrisma.prisma = prisma

export type Tx = Prisma.TransactionClient
