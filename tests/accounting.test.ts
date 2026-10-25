import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks, seedHealthyBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { createApp } from '../server/app.ts'
import { prisma } from '../server/db.ts'
import { roundMoney } from '../src/domain/money.ts'
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
    expect(jiangbeiBooks.profit).toBe(roundMoney(jiangbeiBooks.income - jiangbeiBooks.expense))

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
    expect(jiangbeiBooks.profit).toBeGreaterThan(0)
    expect(jiangbeiBooks.assets).toBeGreaterThan(0)
    const margin = roundMoney((jiangbeiBooks.profit / jiangbeiBooks.income) * 100)
    expect(margin).toBeGreaterThanOrEqual(5)
    expect(margin).toBeLessThanOrEqual(25)

    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Jiangbei Goods Co.' } })
    const chart = await prisma.account.findMany({
      where: { companyId: company.id },
      select: { id: true, code: true, type: true },
    })
    const byId = new Map(chart.map((account) => [account.id, account]))
    const items = await prisma.journalItem.findMany({
      where: { entry: { companyId: company.id } },
      select: { accountId: true, debit: true, credit: true, entry: { select: { date: true } } },
    })
    const closing = new Map<string, number>()
    for (const item of items) {
      const account = byId.get(item.accountId)
      if (!account) continue
      closing.set(account.code, roundMoney((closing.get(account.code) ?? 0) + item.debit - item.credit))
    }
    for (const account of chart) {
      if (account.type !== 'asset' || account.code === '1602') continue
      expect(closing.get(account.code) ?? 0, account.code).toBeGreaterThanOrEqual(0)
    }
    expect(closing.get('1602') ?? 0).toBeLessThanOrEqual(0)
    expect(roundMoney((closing.get('1601') ?? 0) + (closing.get('1602') ?? 0))).toBeGreaterThanOrEqual(0)

    const cashCodes = new Set(['1001', '1002'])
    const running = new Map<string, number>()
    const monthEnd = new Map<string, number>()
    const ordered = items
      .filter((item) => cashCodes.has(byId.get(item.accountId)?.code ?? ''))
      .sort((a, b) => a.entry.date.getTime() - b.entry.date.getTime() || a.accountId - b.accountId)
    for (const item of ordered) {
      const code = byId.get(item.accountId)?.code ?? ''
      const balanceNow = roundMoney((running.get(code) ?? 0) + item.debit - item.credit)
      running.set(code, balanceNow)
      monthEnd.set(`${code}:${item.entry.date.toISOString().slice(0, 7)}`, balanceNow)
    }
    for (const [key, amount] of monthEnd) expect(amount, key).toBeGreaterThanOrEqual(0)

    const volumeProducts = await prisma.product.findMany({
      where: { companyId: company.id, sku: { startsWith: 'VOL-' } },
      select: { id: true, sku: true },
    })
    const ledgers = await prisma.stockLedger.findMany({
      where: { companyId: company.id, productId: { in: volumeProducts.map((product) => product.id) } },
      orderBy: { id: 'asc' },
      select: { productId: true, balanceQty: true },
    })
    const latestQty = new Map<number, number>()
    for (const row of ledgers) latestQty.set(row.productId, row.balanceQty)
    const quants = await prisma.stockQuant.groupBy({
      by: ['productId'],
      where: { location: { companyId: company.id }, productId: { in: [...latestQty.keys()] } },
      _sum: { quantity: true },
    })
    const onHand = new Map(quants.map((row) => [row.productId, row._sum.quantity ?? 0]))
    for (const product of volumeProducts) {
      const qty = latestQty.get(product.id)
      if (qty === undefined) continue
      expect(onHand.get(product.id) ?? 0, product.sku).toBe(qty)
    }
    expect(latestQty.size).toBeGreaterThan(0)
    expect(closing.get('1405') ?? 0).toBeGreaterThan(0)

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

  it('ages open documents by due date and reads cash flow without posting', async () => {
    await seedHealthyBooks(prisma)
    const before = await call('/api/reports/pnl', maya)
    const aged = await call('/api/reports/aged?side=receivable&asOf=2026-10-16', maya)
    expect(aged.status).toBe(200)
    const body = aged.body as {
      partners: Array<{ name: string; documents: Array<{ name: string; bucket: string; amount: number }> }>
      totals: { total: number }
    }
    const doc = (partner: string, name: string) => body.partners.find((row) => row.name === partner)?.documents.find((row) => row.name === name)
    expect(doc('Milo Park', 'INV-S2006')?.bucket).toBe('d1_30')
    expect(doc('Milo Park', 'INV-S2003')?.bucket).toBe('d90')
    expect(doc('Cedar & Co', 'INV-S2004')?.bucket).toBe('d61_90')
    expect(doc('Harbor Clinic', 'INV-S2005')?.bucket).toBe('d31_60')
    const summed = roundMoney(body.partners.reduce((sum, partner) => sum + partner.documents.reduce((inner, row) => inner + row.amount, 0), 0))
    expect(summed).toBe(body.totals.total)
    const payable = await call('/api/reports/aged?side=payable&asOf=2026-10-16', maya)
    const bill = (payable.body as { partners: Array<{ name: string; documents: Array<{ name: string; bucket: string }> }> }).partners
      .find((row) => row.name === 'Qingpu Yarn')?.documents.find((row) => row.name === 'BILL-S2002')
    expect(bill?.bucket).toBe('d31_60')
    const csv = await createApp().request('/api/reports/aged?side=receivable&asOf=2026-10-16&format=csv', { headers: { cookie: maya } })
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect(await csv.text()).toContain('INV-S2006')
    expect((await call('/api/reports/aged?side=other', maya)).status).toBe(400)
    const amira = await signIn('amira@harbourline.example', demoPasswords.amira)
    const hidden = await call('/api/reports/aged?side=receivable&asOf=2026-10-16', amira)
    expect((hidden.body as { partners: Array<{ name: string }> }).partners.some((row) => row.name === 'Milo Park')).toBe(false)
    const flow = await call('/api/reports/cashflow?from=2026-01-01&to=2026-04-30', maya)
    const cash = flow.body as { operating: number; investing: number; financing: number; net: number; opening: number; closing: number; lines: Array<{ label: string; section: string; amount: number }> }
    expect(cash.lines.some((line) => line.label === 'January studio rent' && line.section === 'operating' && line.amount === -2400)).toBe(true)
    expect(cash.lines.some((line) => line.label === 'Cutting table' && line.section === 'investing' && line.amount === -12000)).toBe(true)
    expect(cash.investing).toBe(-16800)
    expect(cash.financing).toBe(0)
    expect(cash.net).toBe(roundMoney(cash.operating + cash.investing + cash.financing))
    expect(cash.closing).toBe(roundMoney(cash.opening + cash.net))
    const after = await call('/api/reports/pnl', maya)
    expect(after.body).toMatchObject(before.body as Record<string, unknown>)
  })
})