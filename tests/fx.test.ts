import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { roundMoney } from '../src/domain/money.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
}, 60_000)

afterAll(async () => {
  await prisma.$disconnect()
})

function expectStatus(response: { status: number; body: unknown }, status: number) {
  expect(response.status, JSON.stringify(response.body)).toBe(status)
}

describe('document currency', () => {
  it('posts, pays, and revalues a foreign invoice in the company currency', async () => {
    const customer = await prisma.contact.findFirstOrThrow({ where: { name: 'Avery Lang' } })
    const service = await prisma.product.findFirstOrThrow({ where: { companyId: customer.companyId, sku: 'SV-02' } })
    const order = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        validityDate: '2026-12-20',
        lines: [{ productId: service.id, quantity: 1, unitPrice: 100, discount: 0, taxId: null }],
      }),
    })
    expectStatus(order, 201)
    const orderId = order.body?.id as number
    expectStatus(await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' }), 200)
    expectStatus(await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' }), 200)
    const draft = await call(`/api/invoices/from/sales/${orderId}`, maya, { method: 'POST' })
    expectStatus(draft, 201)
    const invoiceId = draft.body?.id as number
    const priced = await call(`/api/invoices/${invoiceId}/currency`, maya, {
      method: 'PATCH',
      body: JSON.stringify({ currency: 'USD', rate: 0.14 }),
    })
    expectStatus(priced, 200)
    expect(priced.body).toMatchObject({ currency: 'USD', rate: 0.14, amountTotal: 100 })
    expectStatus(await call(`/api/invoices/${invoiceId}/post`, maya, { method: 'POST' }), 200)
    const locked = await call(`/api/invoices/${invoiceId}/currency`, maya, {
      method: 'PATCH',
      body: JSON.stringify({ currency: 'EUR', rate: 0.13 }),
    })
    expectStatus(locked, 409)

    const base = roundMoney(100 / 0.14)
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { invoiceId, companyId: customer.companyId },
      include: { lines: { include: { account: true } } },
    })
    const side = (code: string) => {
      const line = entry.lines.find((row) => row.account.code === code)
      return { debit: line?.debit ?? 0, credit: line?.credit ?? 0 }
    }
    expect(side('1122')).toEqual({ debit: base, credit: 0 })
    expect(side('6001')).toEqual({ debit: 0, credit: base })
    const debit = roundMoney(entry.lines.reduce((sum, line) => sum + line.debit, 0))
    const credit = roundMoney(entry.lines.reduce((sum, line) => sum + line.credit, 0))
    expect(debit).toBe(credit)

    const before = await call('/api/reports/pnl', maya)
    const paid = await call(`/api/invoices/${invoiceId}/pay`, maya, {
      method: 'POST',
      body: JSON.stringify({ amount: 40, method: 'bank', rate: 0.13 }),
    })
    expectStatus(paid, 200)
    expect((paid.body as { residual: number }).residual).toBe(60)
    const cashBase = roundMoney(40 / 0.13)
    const clearBase = roundMoney(40 / 0.14)
    const gain = roundMoney(cashBase - clearBase)
    const payment = await prisma.journalEntry.findFirstOrThrow({
      where: { invoiceId, lines: { some: { account: { code: '6061' } } } },
      include: { lines: { include: { account: true } } },
    })
    expect(payment.lines.find((line) => line.account.code === '1002')?.debit).toBe(cashBase)
    expect(payment.lines.find((line) => line.account.code === '1122')?.credit).toBe(clearBase)
    expect(payment.lines.find((line) => line.account.code === '6061')?.credit).toBe(gain)

    const rates = await call('/api/exchange-rates', maya)
    const table = (rates.body as { rates: Array<{ currency: string; rate: number }> }).rates.map((row) => (
      row.currency === 'USD' ? { ...row, rate: 0.12 } : row
    ))
    expectStatus(await call('/api/exchange-rates', maya, {
      method: 'PUT',
      body: JSON.stringify({ rates: table }),
    }), 200)

    const open = await call('/api/reports/fx', maya)
    expectStatus(open, 200)
    const row = (open.body as { rows: Array<{ name: string; unrealised: number; booked: number; currentBase: number }> }).rows.find((item) => item.booked === roundMoney(60 / 0.14))
    expect(row?.currentBase).toBe(roundMoney(60 / 0.12))
    expect(row?.unrealised).toBe(roundMoney(roundMoney(60 / 0.12) - roundMoney(60 / 0.14)))

    const revalued = await call('/api/fx/revalue', maya, { method: 'POST' })
    expectStatus(revalued, 200)
    expect(revalued.body?.posted).toBe(true)
    const again = await call('/api/fx/revalue', maya, { method: 'POST' })
    expectStatus(again, 200)
    const gainAccount = await prisma.account.findFirstOrThrow({ where: { companyId: customer.companyId, code: '6061' } })
    const gainLines = await prisma.journalItem.findMany({ where: { accountId: gainAccount.id } })
    const gainNet = roundMoney(gainLines.reduce((sum, line) => sum + line.credit - line.debit, 0))
    expect(gainNet).toBe(roundMoney(gain + (row?.unrealised ?? 0)))

    const balance = await call('/api/reports/balance', maya)
    expect(balance.body?.balanced).toBe(true)
    const after = await call('/api/reports/pnl', maya)
    const beforeProfit = (before.body as { profit: number }).profit
    const afterProfit = (after.body as { profit: number }).profit
    expect(afterProfit).toBe(roundMoney(beforeProfit + gain + (row?.unrealised ?? 0)))

    await call('/api/module-settings', maya, {
      method: 'PUT',
      body: JSON.stringify({ module: 'accounting', values: [{ key: 'fxGain', value: '9999' }] }),
    })
    const blocked = await call('/api/fx/revalue', maya, { method: 'POST' })
    expectStatus(blocked, 400)
    await call('/api/module-settings', maya, {
      method: 'PUT',
      body: JSON.stringify({ module: 'accounting', values: [{ key: 'fxGain', value: '6061' }] }),
    })

    const paymentDraft = await call('/api/payments', maya, {
      method: 'POST',
      body: JSON.stringify({
        kind: 'customer',
        partnerId: customer.id,
        amount: 10,
        date: '2026-10-25',
        method: 'bank',
        memo: 'Foreign allocate',
      }),
    })
    expectStatus(paymentDraft, 201)
    const paymentId = paymentDraft.body?.id as number
    expectStatus(await call(`/api/payments/${paymentId}/post`, maya, { method: 'POST' }), 200)
    const allocated = await call(`/api/payments/${paymentId}/allocate`, maya, {
      method: 'POST',
      body: JSON.stringify({ invoiceId, amount: 10 }),
    })
    expectStatus(allocated, 400)
  }, 60_000)
})
