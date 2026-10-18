import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { convertFromBase, defaultRateRows, demoRate } from '../shared/exchange.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

type Rate = { currency: string; rate: number }

let maya = ''
let jonah = ''
let amira = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
})

afterAll(async () => {
  await prisma.$disconnect()
})

function ratesOf(body: Record<string, unknown> | null) {
  return (body?.rates ?? []) as Rate[]
}

describe('display currency', () => {
  it('converts from the company base with the stored rate', () => {
    expect(demoRate('CNY', 'PKR')).toBe(39)
    expect(demoRate('CNY', 'CNY')).toBe(1)
    expect(demoRate('GBP', 'PKR')).toBe(Math.round((39 / 0.11) * 1_000_000) / 1_000_000)
    const rates = defaultRateRows('CNY')
    expect(convertFromBase(100, 'CNY', 'PKR', rates)).toBe(3900)
    expect(convertFromBase(100, 'CNY', 'CNY', [{ currency: 'CNY', rate: 50 }])).toBe(100)
    expect(convertFromBase(80, 'CNY', 'USD', [])).toBe(80)
  })

  it('keeps each company rate table to itself', async () => {
    const jiangbei = await call('/api/exchange-rates', maya)
    const harbour = await call('/api/exchange-rates', amira)
    expect(jiangbei.status).toBe(200)
    expect(harbour.status).toBe(200)
    expect(jiangbei.body?.base).toBe('CNY')
    expect(harbour.body?.base).toBe('GBP')
    expect(ratesOf(jiangbei.body).find((row) => row.currency === 'PKR')?.rate).toBe(39)
    expect(ratesOf(harbour.body).find((row) => row.currency === 'PKR')?.rate).toBe(demoRate('GBP', 'PKR'))

    const blocked = await call('/api/exchange-rates', jonah, {
      method: 'PUT',
      body: JSON.stringify({ rates: ratesOf(jiangbei.body) }),
    })
    expect(blocked.status).toBe(403)

    const edited = ratesOf(jiangbei.body).map((row) => (row.currency === 'PKR' ? { ...row, rate: 41 } : row))
    const saved = await call('/api/exchange-rates', maya, {
      method: 'PUT',
      body: JSON.stringify({ rates: edited }),
    })
    expect(saved.status).toBe(200)
    expect(ratesOf(saved.body).find((row) => row.currency === 'PKR')?.rate).toBe(41)

    const harbourAfter = await call('/api/exchange-rates', amira)
    expect(ratesOf(harbourAfter.body).find((row) => row.currency === 'PKR')?.rate).toBe(demoRate('GBP', 'PKR'))

    const mayaUser = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    const amiraUser = await prisma.user.findUniqueOrThrow({ where: { email: 'amira@harbourline.example' } })
    const jiangbeiRow = await prisma.exchangeRate.findUniqueOrThrow({
      where: { companyId_currency: { companyId: mayaUser.companyId, currency: 'PKR' } },
    })
    const harbourRow = await prisma.exchangeRate.findUniqueOrThrow({
      where: { companyId_currency: { companyId: amiraUser.companyId, currency: 'PKR' } },
    })
    expect(jiangbeiRow.rate).toBe(41)
    expect(harbourRow.rate).toBe(demoRate('GBP', 'PKR'))
  })

  it('stores the display currency on that user only', async () => {
    const before = await call('/api/session/me', maya)
    expect(before.body?.displayCurrency ?? null).toBeNull()
    const patched = await call('/api/session/display-currency', maya, {
      method: 'PATCH',
      body: JSON.stringify({ currency: 'PKR' }),
    })
    expect(patched.status).toBe(200)
    expect(patched.body?.displayCurrency).toBe('PKR')
    const me = await call('/api/session/me', maya)
    expect(me.body?.displayCurrency).toBe('PKR')
    const other = await call('/api/session/me', jonah)
    expect(other.body?.displayCurrency ?? null).toBeNull()
    const row = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    const colleague = await prisma.user.findUniqueOrThrow({ where: { email: 'jonah@northline.example' } })
    expect(row.displayCurrency).toBe('PKR')
    expect(colleague.displayCurrency).toBeNull()
  })

  it('leaves API amounts in the company currency', async () => {
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.status).toBe(200)
    const shown = await call('/api/session/display-currency', maya, {
      method: 'PATCH',
      body: JSON.stringify({ currency: 'USD' }),
    })
    expect(shown.status).toBe(200)
    const pnlAfter = await call('/api/reports/pnl', maya)
    expect(pnlAfter.body).toEqual(pnl.body)

    const mayaUser = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    const customer = await prisma.contact.findFirstOrThrow({
      where: { name: 'Cedar & Co', companyId: mayaUser.companyId },
    })
    const product = await prisma.product.findFirstOrThrow({
      where: { sku: 'NB-01', companyId: mayaUser.companyId },
    })
    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        lines: [{ productId: product.id, quantity: 2, unitPrice: 18, discount: 0, taxId: null }],
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body?.amountUntaxed).toBe(36)
    const stored = await prisma.salesOrder.findUniqueOrThrow({ where: { id: created.body?.id as number } })
    expect(stored.amountUntaxed).toBe(36)
    expect(stored.amountTotal).toBe(created.body?.amountTotal)
    const listed = await call(`/api/orders/${stored.id}`, maya)
    expect(listed.status).toBe(200)
    expect(listed.body?.amountTotal).toBe(stored.amountTotal)
    expect(listed.body?.amountUntaxed).toBe(36)
  })

  it('gives a new company demo rates against its own currency', async () => {
    const created = await call('/api/signup', '', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.77' },
      body: JSON.stringify({
        companyName: 'Rate Glass Ltd',
        country: 'US',
        name: 'Rate Ada',
        email: 'rate@rateglass.example',
        password: 'keel-rate-desk',
        loadSample: false,
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body?.company).toMatchObject({ currency: 'USD' })
    const cookie = created.setCookie?.split(';')[0] ?? ''
    const table = await call('/api/exchange-rates', cookie)
    expect(table.status).toBe(200)
    expect(table.body?.base).toBe('USD')
    const rows = ratesOf(table.body)
    expect(rows.find((row) => row.currency === 'USD')?.rate).toBe(1)
    expect(rows.find((row) => row.currency === 'PKR')?.rate).toBe(demoRate('USD', 'PKR'))
    expect(rows.find((row) => row.currency === 'CNY')?.rate).toBe(demoRate('USD', 'CNY'))
    const mayaRates = await call('/api/exchange-rates', maya)
    expect(ratesOf(mayaRates.body).find((row) => row.currency === 'PKR')?.rate).toBe(41)
  })
})
