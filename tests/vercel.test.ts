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

  it('sends crawl files to the /api function and keeps the original path', async () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      rewrites: Array<{ source: string; destination: string }>
    }
    const rewrites = config.rewrites
    const spa = rewrites.findIndex((rule) => rule.destination === '/index.html')
    const expected = [
      { source: '/site/:slug/sitemap.xml', destination: '/api' },
      { source: '/site/:slug/robots.txt', destination: '/api' },
      { source: '/sitemap.xml', destination: '/api' },
      { source: '/robots.txt', destination: '/api' },
    ]
    for (const rule of expected) {
      const index = rewrites.findIndex((item) => item.source === rule.source)
      expect(rewrites[index], rule.source).toEqual(rule)
      expect(index, rule.source).toBeGreaterThan(-1)
      expect(index, rule.source).toBeLessThan(spa)
    }
    expect(rewrites.some((rule) => rule.destination.includes('/api/site/'))).toBe(false)

    const headers = { 'x-forwarded-host': 'keel.example', 'x-forwarded-proto': 'https' }
    const sitemap = await handler(new Request('https://keel.example/site/jiangbei/sitemap.xml', { headers }))
    expect(sitemap.status).toBe(200)
    expect(sitemap.headers.get('content-type')).toContain('xml')
    const xml = await sitemap.text()
    expect(xml).toContain('https://keel.example/site/jiangbei')
    expect(xml).not.toContain('<html')

    const robots = await handler(new Request('https://keel.example/site/jiangbei/robots.txt', { headers }))
    expect(robots.status).toBe(200)
    expect(robots.headers.get('content-type')).toContain('text/plain')
    expect(await robots.text()).toContain('Sitemap: https://keel.example/site/jiangbei/sitemap.xml')

    const index = await handler(new Request('https://keel.example/sitemap.xml', { headers }))
    expect(index.status).toBe(200)
    const indexXml = await index.text()
    expect(indexXml).toContain('<sitemapindex')
    expect(indexXml).toContain('https://keel.example/site/jiangbei/sitemap.xml')
    const rootRobots = await handler(new Request('https://keel.example/robots.txt', { headers }))
    expect(rootRobots.status).toBe(200)
    expect(await rootRobots.text()).toContain('Sitemap: https://keel.example/sitemap.xml')
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