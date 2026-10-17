import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { profitAndLoss } from '../server/services/accounting.ts'
import { dashboardRange } from '../server/services/home.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('home dashboard', () => {
  it('uses the year ledger for Jiangbei and keeps another company out', async () => {
    const year = dashboardRange('year')
    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Jiangbei Goods Co.' } })
    const pnl = await profitAndLoss(company.id, year.from, year.to)
    const home = await call('/api/home?range=year', maya)
    expect(home.status).toBe(200)
    expect(home.body).toMatchObject({
      range: 'year',
      empty: false,
      kpis: {
        revenue: { amount: pnl.income },
        profit: { amount: pnl.profit },
        receivable: { amount: jiangbeiBooks.receivable },
        payable: { amount: jiangbeiBooks.payable },
      },
    })
    const allTime = await profitAndLoss(company.id)
    expect(allTime.profit).toBe(jiangbeiBooks.profit)
    const months = (home.body?.chart as { months: unknown[] }).months
    expect(months).toHaveLength(12)
    expect(home.body?.bank).toMatchObject({ accounts: 2 })

    const sample = await prisma.product.findFirstOrThrow({
      where: { companyId: company.id },
      select: { sku: true },
    })
    const harbour = await prisma.user.findUniqueOrThrow({
      where: { email: 'amira@harbourline.example' },
      select: { companyId: true },
    })
    const own = await call(`/api/home/search?q=${encodeURIComponent(sample.sku)}`, maya)
    const ownIds = ((own.body?.products ?? []) as { id: number }[]).map((row) => row.id)
    expect(ownIds.length).toBeGreaterThan(0)
    expect(await prisma.product.count({ where: { id: { in: ownIds }, companyId: company.id } })).toBe(ownIds.length)
    const found = await call(`/api/home/search?q=${encodeURIComponent(sample.sku)}`, amira)
    expect(found.status).toBe(200)
    const productIds = ((found.body?.products ?? []) as { id: number }[]).map((row) => row.id)
    expect(await prisma.product.count({ where: { id: { in: productIds.length ? productIds : [0] }, companyId: company.id } })).toBe(0)
    if (productIds.length > 0) {
      expect(await prisma.product.count({ where: { id: { in: productIds }, companyId: harbour.companyId } })).toBe(productIds.length)
    }
    const other = await call('/api/home?range=year', amira)
    const otherIds = ((other.body?.orders ?? []) as { id: number }[]).map((row) => row.id)
    expect(await prisma.salesOrder.count({ where: { id: { in: otherIds.length ? otherIds : [0] }, companyId: company.id } })).toBe(0)
    expect((other.body?.kpis as { profit: { amount: number } }).profit.amount).not.toBe(jiangbeiBooks.profit)
  })

  it('follows the selected month instead of a fixed figure', async () => {
    const month = dashboardRange('month')
    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Jiangbei Goods Co.' } })
    const pnl = await profitAndLoss(company.id, month.from, month.to)
    const home = await call('/api/home?range=month', maya)
    expect(home.status).toBe(200)
    expect(home.body).toMatchObject({
      range: 'month',
      from: month.from,
      to: month.to,
      kpis: { revenue: { amount: pnl.income }, profit: { amount: pnl.profit } },
    })
    const rejected = await call('/api/home?range=quarter', maya)
    expect(rejected.status).toBe(400)
  })

  it('opens an empty checklist for a new company with no books', async () => {
    const created = await call('/api/signup', '', {
      method: 'POST',
      headers: { 'x-forwarded-for': '198.51.100.44' },
      body: JSON.stringify({
        companyName: 'Empty Kiln Co.',
        country: 'CN',
        name: 'Wei Empty',
        email: 'wei@emptykiln.example',
        password: 'keel-empty-desk',
        loadSample: false,
      }),
    })
    expect(created.status).toBe(201)
    const cookie = created.setCookie?.split(';')[0] ?? ''
    const home = await call('/api/home?range=month', cookie)
    expect(home.status).toBe(200)
    expect(home.body).toMatchObject({
      empty: true,
      kpis: {
        revenue: { amount: 0 },
        profit: { amount: 0 },
        receivable: { amount: 0 },
        payable: { amount: 0 },
      },
      orders: [],
      attention: [],
      attentionCount: 0,
      onboarding: { done: 1, total: 6 },
    })
    const steps = (home.body?.onboarding as { steps: { key: string; done: boolean }[] }).steps
    expect(steps.find((step) => step.key === 'company')?.done).toBe(true)
    expect(steps.filter((step) => step.key !== 'company').every((step) => step.done === false)).toBe(true)
  })
})
