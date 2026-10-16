import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.status).toBe(200)
    expect(pnl.body).toMatchObject({ income: 436, expense: 36168, profit: -35732 })

    const vat = await call('/api/reports/vat', maya)
    expect(vat.body).toMatchObject({ output: 56.68, input: 10.4, payable: 46.28 })

    const balance = await call('/api/reports/balance', maya)
    expect(balance.body).toMatchObject({ assets: 404.68, liabilities: 36136.68, equity: -35732, balanced: true })

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