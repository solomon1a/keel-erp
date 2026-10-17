import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks, seedHealthyBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('accounting', () => {
  it('posts the seeded shop invoice into the ledger, VAT, and statements', async () => {
    const accounts = await prisma.account.count()
    const years = await prisma.fiscalYear.count()
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.status).toBe(200)
    expect(pnl.serverTiming).toContain('total;dur=')
    expect(pnl.serverTiming).toContain('db;dur=')
    expect(pnl.serverTiming).toContain('queries;desc="')
    expect(pnl.serverTiming).toContain('region;desc="local"')
    expect(pnl.serverTiming ?? '').not.toContain('postgres://')
    expect(await prisma.account.count()).toBe(accounts)
    const listedYears = await call('/api/fiscal-years', maya)
    expect(listedYears.status).toBe(200)
    expect(await prisma.fiscalYear.count()).toBe(years)
    expect(pnl.body).toMatchObject({
      income: jiangbeiBooks.income,
      expense: jiangbeiBooks.expense,
      profit: jiangbeiBooks.profit,
    })
    const margin = jiangbeiBooks.profit / jiangbeiBooks.income
    expect(margin).toBeGreaterThan(0.15)
    expect(margin).toBeLessThan(0.25)

    const vat = await call('/api/reports/vat', maya)
    expect(vat.body).toMatchObject({
      output: jiangbeiBooks.outputVat,
      input: jiangbeiBooks.inputVat,
      payable: jiangbeiBooks.vatPayable,
    })

    const balance = await call('/api/reports/balance', maya)
    expect(balance.body).toMatchObject({
      assets: jiangbeiBooks.assets,
      liabilities: jiangbeiBooks.liabilities,
      equity: jiangbeiBooks.equity,
      balanced: true,
    })

    const aging = await call('/api/reports/aging?asOf=2026-10-16', maya)
    expect(aging.status).toBe(200)
    const buckets = (aging.body as { receivable: { current: number; d30: number; d60: number; older: number; total: number } }).receivable
    expect(buckets.total).toBe(jiangbeiBooks.receivable)
    expect(buckets.current).toBeGreaterThan(0)
    expect(buckets.d30).toBeGreaterThan(0)
    expect(buckets.d60).toBeGreaterThan(0)
    expect(buckets.older).toBeGreaterThan(0)

    await seedHealthyBooks(prisma)
    const againPnl = await call('/api/reports/pnl', maya)
    expect(againPnl.body).toMatchObject({ profit: jiangbeiBooks.profit })
    expect(await prisma.invoice.count({ where: { name: 'INV-S2001' } })).toBe(1)

    const shopOrder = await prisma.salesOrder.findFirstOrThrow({ where: { name: 'SO0002' } })
    const again = await call(`/api/invoices/from/sales/${shopOrder.id}`, maya, { method: 'POST' })
    expect(again.status).toBe(409)
  })

  it('invoices a delivered sale, records a bank payment, and credits it', async () => {
    const customer = await prisma.contact.findFirstOrThrow({ where: { name: 'Lin Xiao' } })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01' } })
    const tax = await prisma.tax.findFirstOrThrow()
    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        lines: [{ productId: notebook.id, quantity: 1, unitPrice: 18, discount: 0, taxId: tax.id }],
      }),
    })
    expect(created.status).toBe(201)
    const orderId = (created.body as { id: number }).id
    expect((await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    expect((await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' })).status).toBe(200)

    const draft = await call(`/api/invoices/from/sales/${orderId}`, maya, { method: 'POST' })
    expect(draft.status).toBe(201)
    const invoice = draft.body as { id: number; name: string; buyerTaxId: string; amountTotal: number }
    expect(invoice.name).toBe('INV0002')
    expect(invoice.buyerTaxId).toBe('91310000LINX000018')
    expect(invoice.amountTotal).toBe(20.34)

    const posted = await call(`/api/invoices/${invoice.id}/post`, maya, { method: 'POST' })
    expect(posted.status).toBe(200)
    const paid = await call(`/api/invoices/${invoice.id}/pay`, maya, {
      method: 'POST',
      body: JSON.stringify({ amount: 20.34, method: 'wechat' }),
    })
    expect(paid.status).toBe(200)
    expect((paid.body as { state: string; residual: number }).state).toBe('paid')

    const credit = await call(`/api/invoices/${invoice.id}/credit`, maya, { method: 'POST' })
    expect(credit.status).toBe(201)
    expect((credit.body as { name: string; moveType: string }).name).toBe('CN0001')
    const creditId = (credit.body as { id: number }).id
    expect((await call(`/api/invoices/${creditId}/post`, maya, { method: 'POST' })).status).toBe(200)

    const ledger = await call('/api/ledger?account=1122', maya)
    expect(ledger.status).toBe(200)
    expect((ledger.body as unknown as Array<{ label: string }>).some((row) => row.label === 'INV0002')).toBe(true)
  })
})