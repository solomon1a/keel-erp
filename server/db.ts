import { neonConfig } from '@neondatabase/serverless'
import { PrismaNeon } from '@prisma/adapter-neon'
import { Prisma, PrismaClient } from '@prisma/client'
import ws from 'ws'
import { noteQuery } from './timing.ts'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

const nearestVercelRegion: Record<string, string> = {
  'us-east-1': 'iad1',
  'us-east-2': 'cle1',
  'us-west-1': 'sfo1',
  'us-west-2': 'pdx1',
  'ca-central-1': 'yul1',
  'sa-east-1': 'gru1',
  'eu-central-1': 'fra1',
  'eu-west-1': 'dub1',
  'eu-west-2': 'lhr1',
  'eu-west-3': 'cdg1',
  'eu-north-1': 'arn1',
  'ap-southeast-1': 'sin1',
  'ap-southeast-2': 'syd1',
  'ap-northeast-1': 'hnd1',
  'ap-northeast-2': 'icn1',
  'ap-south-1': 'bom1',
}

export type DatabaseTarget = {
  region: string
  nearest: string
  pooler: boolean
  driver: 'neon-http' | 'pg'
}

export function databaseTarget(url = process.env.DATABASE_URL): DatabaseTarget {
  if (!url) return { region: 'unset', nearest: 'unset', pooler: false, driver: 'pg' }
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return { region: 'unparsed', nearest: 'unset', pooler: false, driver: 'pg' }
  }
  if (host === 'localhost' || host === '127.0.0.1') {
    return { region: 'local', nearest: 'local', pooler: false, driver: 'pg' }
  }
  const region = host.match(/[a-z]{2}-[a-z]+-\d+/)?.[0] ?? 'unknown'
  const neon = host === 'neon.tech' || host.endsWith('.neon.tech')
  const pooler = host.includes('-pooler') || url.includes('pgbouncer=true')
  return {
    region,
    nearest: nearestVercelRegion[region] ?? 'unknown',
    pooler,
    driver: neon ? 'neon-http' : 'pg',
  }
}

/**
 * Interactive transactions from the app and the seed.
 * Runtime in sin1 is next to Neon (~30ms): posting an invoice or a payment is about a
 * dozen queries, and producing a normal bill is a few seconds. The build seed runs in
 * iad1 (~200–400ms per query), so the old 5s default closed confirm before it finished.
 */
export const transactionOptions = {
  maxWait: 15_000,
  timeout: 60_000,
} satisfies NonNullable<Prisma.PrismaClientOptions['transactionOptions']>

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

function pgClient() {
  const url = runtimeDatabaseUrl()
  return new PrismaClient({
    transactionOptions,
    ...(url ? { datasourceUrl: url } : {}),
  })
}

function createClient() {
  const target = databaseTarget()
  const url = process.env.DATABASE_URL
  const base = target.driver === 'neon-http' && url ? neonClient(url) : pgClient()
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          const started = performance.now()
          try {
            return await query(args)
          } finally {
            noteQuery(performance.now() - started)
          }
        },
      },
    },
  }) as unknown as PrismaClient
}

function neonClient(url: string) {
  neonConfig.poolQueryViaFetch = true
  neonConfig.webSocketConstructor = ws
  const adapter = new PrismaNeon({ connectionString: url, max: 3 })
  return new PrismaClient({ adapter, transactionOptions })
}

export const dbTarget = databaseTarget()

console.info(
  `keel database region=${dbTarget.region} nearest=${dbTarget.nearest} pooler=${dbTarget.pooler} driver=${dbTarget.driver}`,
)

export const prisma = globalForPrisma.prisma ?? createClient()

globalForPrisma.prisma = prisma

export type Tx = Prisma.TransactionClient
