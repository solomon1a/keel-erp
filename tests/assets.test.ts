import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { depreciationSchedule } from '../shared/depreciation.ts'
import { jiangbeiAssets, jiangbeiDepreciationAsOf, jiangbeiDepreciationTotal } from '../shared/demo-adjustments.ts'
import { roundMoney } from '../src/domain/money.ts'
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

describe('asset depreciation', () => {
  it('keeps the seeded Jiangbei books and posts depreciation through April', async () => {
    const pnl = await call('/api/reports/pnl', maya)
    const balance = await call('/api/reports/balance', maya)
    expect(pnl.body).toMatchObject({
      income: jiangbeiBooks.income,
      expense: jiangbeiBooks.expense,
      profit: jiangbeiBooks.profit,
    })
    expect(balance.body).toMatchObject({
      assets: jiangbeiBooks.assets,
      liabilities: jiangbeiBooks.liabilities,
      equity: jiangbeiBooks.equity,
    })
    const listed = await call('/api/assets', maya)
    expect(listed.status).toBe(200)
    const assets = listed.body as unknown as Array<{ id: number; name: string; postedDepreciation: number; bookValue: number; lines: Array<{ date: string; state: string; amount: number; entry: { lines: Array<{ debit: number; credit: number; account: { code: string } }> } | null }> }>
    expect(assets.map((asset) => asset.name).sort()).toEqual(['Cutting table', 'Shop counter'])
    const cutting = assets.find((asset) => asset.name === 'Cutting table')
    const counter = assets.find((asset) => asset.name === 'Shop counter')
    expect(cutting?.postedDepreciation).toBe(720)
    const counterPlan = depreciationSchedule(jiangbeiAssets[1]).filter((slot) => slot.date <= jiangbeiDepreciationAsOf)
    expect(counter?.postedDepreciation).toBe(roundMoney(counterPlan.reduce((sum, slot) => sum + slot.amount, 0)))
    expect(roundMoney((cutting?.postedDepreciation ?? 0) + (counter?.postedDepreciation ?? 0))).toBe(jiangbeiDepreciationTotal())
    const posted = cutting?.lines.find((line) => line.state === 'posted' && line.entry)
    expect(posted?.entry?.lines.map((line) => line.account.code).sort()).toEqual(['1602', '6605'])
    const debit = roundMoney(posted?.entry?.lines.reduce((sum, line) => sum + line.debit, 0) ?? 0)
    const credit = roundMoney(posted?.entry?.lines.reduce((sum, line) => sum + line.credit, 0) ?? 0)
    expect(debit).toBe(credit)
    expect(debit).toBe(posted?.amount)
    expect(cutting?.lines.some((line) => line.state === 'draft' && line.date > jiangbeiDepreciationAsOf)).toBe(true)
    expect(cutting && (await call(`/api/assets/${cutting.id}`, amira)).status).toBe(404)
  })

  it('posts one line, refuses future depreciation, and records a sale or scrap', async () => {
    const created = await call('/api/assets', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Packing bench',
        purchaseValue: 1200,
        salvageValue: 0,
        start: '2026-06-30',
        method: 'straight_line',
        months: 12,
      }),
    })
    expect(created.status).toBe(201)
    const id = created.body?.id as number
    const early = await call(`/api/assets/${id}/post-due`, maya, {
      method: 'POST',
      body: JSON.stringify({ asOf: '2026-05-31' }),
    })
    expect(early.status).toBe(200)
    expect(early.body?.postedDepreciation).toBe(0)
    const one = await call(`/api/assets/${id}/lines/${(created.body?.lines as Array<{ id: number }>)[0]?.id}/post`, maya, { method: 'POST' })
    expect(one.status).toBe(200)
    expect(one.body?.postedDepreciation).toBe(100)
    expect(one.body?.bookValue).toBe(1100)
    const sold = await call(`/api/assets/${id}/dispose`, maya, {
      method: 'POST',
      body: JSON.stringify({ price: 1500, date: '2026-06-30' }),
    })
    expect(sold.status).toBe(200)
    expect(sold.body?.state).toBe('sold')
    const gain = await prisma.journalItem.findFirst({
      where: { entryId: (await prisma.asset.findUniqueOrThrow({ where: { id } })).disposalEntryId ?? 0, account: { code: '6052' } },
    })
    expect(gain?.credit).toBe(400)

    const scrap = await call('/api/assets', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Worn stool',
        purchaseValue: 300,
        salvageValue: 0,
        start: '2026-06-30',
        method: 'straight_line',
        months: 3,
      }),
    })
    const scrapId = scrap.body?.id as number
    const scrapped = await call(`/api/assets/${scrapId}/dispose`, maya, {
      method: 'POST',
      body: JSON.stringify({ price: 0, date: '2026-06-30' }),
    })
    expect(scrapped.status).toBe(200)
    expect(scrapped.body?.state).toBe('disposed')
    const loss = await prisma.journalItem.findFirst({
      where: { entryId: (await prisma.asset.findUniqueOrThrow({ where: { id: scrapId } })).disposalEntryId ?? 0, account: { code: '6606' } },
    })
    expect(loss?.debit).toBe(300)
  })

  it('reclasses a posted vendor bill line onto the asset account', async () => {
    const company = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' }, select: { companyId: true } })
    const vendor = await prisma.contact.findFirstOrThrow({ where: { companyId: company.companyId, isSupplier: true } })
    const invoice = await prisma.invoice.create({
      data: {
        name: 'BILL-ASSET-TEST',
        moveType: 'in_invoice',
        state: 'posted',
        partnerId: vendor.id,
        companyId: company.companyId,
        invoiceDate: new Date('2026-05-01T00:00:00.000Z'),
        amountUntaxed: 3000,
        amountTax: 0,
        amountTotal: 3000,
        residual: 0,
        lines: { create: [{ description: 'Bench', quantity: 1, unitPrice: 3000, taxRate: 0, subtotal: 3000, taxAmount: 0 }] },
      },
      include: { lines: true },
    })
    const lineId = invoice.lines[0]?.id
    const created = await call('/api/assets/from-bill', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Billed bench',
        salvageValue: 0,
        start: '2026-05-31',
        method: 'straight_line',
        months: 30,
        invoiceLineId: lineId,
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body?.purchaseValue).toBe(3000)
    const entry = await prisma.journalEntry.findFirst({
      where: { companyId: company.companyId, lines: { some: { label: 'Billed bench', account: { code: '1405' } } } },
      include: { lines: { include: { account: true } } },
    })
    const codes = entry?.lines.map((line) => `${line.account.code}:${line.debit}:${line.credit}`).sort()
    expect(codes).toEqual(['1405:0:3000', '1601:3000:0'])
  })
})
