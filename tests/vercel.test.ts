import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handler } from '../server/vercel-handler.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { resetAndSeed } from './reset-db.ts'

beforeAll(async () => {
  await resetAndSeed()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('vercel function', () => {
  it('prints a seed failure and still builds', () => {
    const script = readFileSync('scripts/vercel-build.sh', 'utf8')
    expect(script).not.toContain('echo skipped')
    expect(script).toContain('KEEL SEED FAILED')
    expect(script).toContain('if prisma db seed; then')
  })

  it('keeps a long transaction limit and runs floor after trade', () => {
    const db = readFileSync('server/db.ts', 'utf8')
    const seed = readFileSync('prisma/seed.ts', 'utf8')
    expect(db).toContain('maxWait: 15_000')
    expect(db).toContain('timeout: 60_000')
    expect(db).toContain('new PrismaClient({ adapter, transactionOptions })')
    expect(seed).toContain('new PrismaClient({ transactionOptions })')
    const tradeAt = seed.indexOf("runStage('trade'")
    const floorAt = seed.indexOf("runStage('floor'")
    expect(tradeAt).toBeGreaterThan(0)
    expect(floorAt).toBeGreaterThan(tradeAt)
  })

  it('serves health on the original /api path', async () => {
    const response = await handler(new Request('https://keel.example/api/health'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('serves health when the runtime strips the /api prefix', async () => {
    const response = await handler(new Request('https://keel.example/health'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('sets a Secure session cookie on Vercel', async () => {
    const previous = process.env.VERCEL
    process.env.VERCEL = '1'
    try {
      const response = await handler(
        new Request('https://keel.example/api/session/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'maya@northline.example', password: demoPasswords.maya }),
        }),
      )
      expect(response.status).toBe(200)
      const cookie = response.headers.get('set-cookie') ?? ''
      expect(cookie).toContain('keel_session=')
      expect(cookie).toContain('HttpOnly')
      expect(cookie).toContain('Secure')
    } finally {
      if (previous === undefined) delete process.env.VERCEL
      else process.env.VERCEL = previous
    }
  })

  it('refuses a production login when SESSION_SECRET is missing', async () => {
    const previousSecret = process.env.SESSION_SECRET
    const previousNode = process.env.NODE_ENV
    delete process.env.SESSION_SECRET
    process.env.NODE_ENV = 'production'
    try {
      const response = await handler(
        new Request('https://keel.example/api/session/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'maya@northline.example', password: demoPasswords.maya }),
        }),
      )
      expect(response.status).toBe(500)
      const body = (await response.json()) as { error?: string }
      expect(body.error).toBe('SESSION_SECRET is not set.')
    } finally {
      if (previousSecret === undefined) delete process.env.SESSION_SECRET
      else process.env.SESSION_SECRET = previousSecret
      if (previousNode === undefined) delete process.env.NODE_ENV
      else process.env.NODE_ENV = previousNode
    }
  })
})