import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { jiangbeiSubcontractBooks } from '../shared/demo-adjustments.ts'
import { prisma } from '../server/db.ts'
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

describe('subcontract stock', () => {
  it('keeps the books and shows the partial dye order', async () => {
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.body).toMatchObject({ profit: jiangbeiBooks.profit })
    const balance = await call('/api/reports/balance', maya)
    expect(balance.body).toMatchObject({
      assets: jiangbeiBooks.assets,
      liabilities: jiangbeiBooks.liabilities,
      equity: jiangbeiBooks.equity,
    })
    const listed = await call('/api/subcontracting', maya)
    expect(listed.status).toBe(200)
    const orders = listed.body as unknown as Array<{ id: number; name: string; received: number; quantity: number; state: string }>
    const dye = orders.find((order) => order.name === jiangbeiSubcontractBooks.order)
    expect(dye).toBeTruthy()
    expect(dye?.received).toBe(jiangbeiSubcontractBooks.received)
    expect(dye?.quantity).toBe(jiangbeiSubcontractBooks.ordered)
    expect(dye?.state).toBe('progress')
    const detail = await call(`/api/subcontracting/${dye?.id}`, maya)
    expect(detail.status).toBe(200)
    const lines = detail.body?.lines as Array<{ sku: string; sent: number; consumed: number; onHand: number }>
    expect(lines[0]).toMatchObject({
      sku: jiangbeiSubcontractBooks.componentSku,
      sent: jiangbeiSubcontractBooks.sent,
      consumed: jiangbeiSubcontractBooks.received * jiangbeiSubcontractBooks.perUnit,
      onHand: jiangbeiSubcontractBooks.sent - jiangbeiSubcontractBooks.received * jiangbeiSubcontractBooks.perUnit,
    })
    const stock = await call('/api/subcontracting/stock', maya)
    const locations = stock.body as unknown as Array<{ vendor: { name: string } | null; lines: Array<{ sku: string; quantity: number }> }>
    const held = locations.find((location) => location.vendor?.name === jiangbeiSubcontractBooks.vendor)
    expect(held?.lines.find((line) => line.sku === 'DYE-GREIGE')?.quantity).toBe(2)
    const finished = await prisma.product.findFirstOrThrow({
      where: { sku: jiangbeiSubcontractBooks.finishedSku, company: { users: { some: { email: 'maya@northline.example' } } } },
      include: { quants: true },
    })
    expect(finished.quants.reduce((sum, quant) => sum + quant.quantity, 0)).toBe(2)
    expect(finished.costPrice).toBe(26)
    const hidden = await call(`/api/subcontracting/${dye?.id}`, amira)
    expect(hidden.status).toBe(404)
  })

  it('moves components without a profit hit and refuses a short receipt', async () => {
    const company = await prisma.user.findFirstOrThrow({
      where: { email: 'maya@northline.example' },
      select: { companyId: true },
    })
    const sendEntry = await prisma.journalEntry.findFirst({
      where: { companyId: company.companyId, lines: { some: { label: `${jiangbeiSubcontractBooks.order} send` } } },
      include: { lines: { include: { account: true } } },
    })
    expect(sendEntry?.lines.map((line) => line.account.code).sort()).toEqual(['1405', '1408'])
    const sendDebit = sendEntry?.lines.reduce((sum, line) => sum + line.debit, 0) ?? 0
    const sendCredit = sendEntry?.lines.reduce((sum, line) => sum + line.credit, 0) ?? 0
    expect(sendDebit).toBe(sendCredit)
    expect(sendDebit).toBe(jiangbeiSubcontractBooks.sent * jiangbeiSubcontractBooks.componentCost)
    const bill = await prisma.invoice.findFirst({
      where: {
        companyId: company.companyId,
        moveType: 'in_invoice',
        lines: { some: { description: `Subcontract service ${jiangbeiSubcontractBooks.order}` } },
      },
    })
    expect(bill).toMatchObject({
      state: 'posted',
      amountUntaxed: jiangbeiSubcontractBooks.fee,
      amountTax: jiangbeiSubcontractBooks.tax,
      amountTotal: jiangbeiSubcontractBooks.payable,
    })
    const orders = await call('/api/subcontracting', maya)
    const dye = (orders.body as unknown as Array<{ id: number; name: string }>).find((order) => order.name === jiangbeiSubcontractBooks.order)
    const short = await call(`/api/subcontracting/${dye?.id}/receive`, maya, {
      method: 'POST',
      body: JSON.stringify({ quantity: 2, date: '2026-05-18' }),
    })
    expect(short.status).toBe(409)
    expect(short.body?.error).toBe('The subcontractor is short of components.')
  })
})
