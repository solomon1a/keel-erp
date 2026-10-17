import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { balanceSheet } from '../server/services/accounting.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let companyId = 0

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  companyId = (await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })).companyId
})

afterAll(async () => {
  await prisma.$disconnect()
})

type BomRow = {
  id: number
  productId: number
  version: number
  active: boolean
  unitCost: number
  material: number
  operating: number
  byproduct: number
  product: { sku: string }
}

async function booksBalance() {
  const items = await prisma.journalItem.findMany({
    where: { entry: { companyId } },
    select: { debit: true, credit: true },
  })
  const debit = Math.round(items.reduce((sum, row) => sum + row.debit, 0) * 100) / 100
  const credit = Math.round(items.reduce((sum, row) => sum + row.credit, 0) * 100) / 100
  expect(debit).toBe(credit)
  const sheet = await balanceSheet(companyId)
  expect(sheet.balanced).toBe(true)
}

describe('shop floor', () => {
  it('reads plans, wastage, and workspace figures without opening accounts', async () => {
    const before = await prisma.account.count({ where: { companyId } })
    const plans = await call('/api/manufacturing/plans', maya)
    const wastage = await call('/api/manufacturing/wastage', maya)
    const making = await call('/api/workspaces/manufacturing', maya)
    const scrap = await call('/api/workspaces/wastage', maya)
    expect(plans.status).toBe(200)
    expect(wastage.status).toBe(200)
    expect(making.status).toBe(200)
    expect(scrap.status).toBe(200)
    const pulse = making.body as { kpis?: number[]; chart?: number[] }
    expect(pulse.kpis).toHaveLength(3)
    expect(pulse.chart).toHaveLength(12)
    expect(await prisma.account.count({ where: { companyId } })).toBe(before)
  })

  it('rolls a multi-level bill into material, operating, and by-product cost', async () => {
    const response = await call('/api/boms', maya)
    expect(response.status).toBe(200)
    const bills = response.body as unknown as BomRow[]
    const apron = bills.find((row) => row.product.sku.endsWith('-APRON') && row.active)
    expect(apron?.material).toBe(10.08)
    expect(apron?.operating).toBe(30)
    expect(apron?.byproduct).toBe(0.2)
    expect(apron?.unitCost).toBe(39.88)
    const revised = await call(`/api/boms/${apron?.id}/revise`, maya, { method: 'POST' })
    expect(revised.status).toBe(201)
    expect((revised.body as { version?: number; active?: boolean }).version).toBe(2)
    expect((revised.body as { active?: boolean }).active).toBe(true)
  })

  it('raises a production plan once', async () => {
    const listed = await call('/api/manufacturing/plans', maya)
    const plans = listed.body as unknown as Array<{ id: number; name: string; lines: Array<{ toMake: number }> }>
    const plan = plans.find((row) => row.name.startsWith('PLAN-FLOOR-'))
    expect(plan?.lines.some((line) => line.toMake === 6)).toBe(true)
    const raised = await call(`/api/manufacturing/plans/${plan?.id}/raise`, maya, { method: 'POST' })
    expect(raised.status).toBe(200)
    expect((raised.body as { state?: string }).state).toBe('raised')
    const before = await prisma.manufacturingOrder.count({ where: { companyId } })
    const again = await call(`/api/manufacturing/plans/${plan?.id}/raise`, maya, { method: 'POST' })
    expect(again.status).toBe(200)
    expect(await prisma.manufacturingOrder.count({ where: { companyId } })).toBe(before)
  })

  it('posts wastage, labour, and a partial receipt without unbalancing the books', async () => {
    const order = await prisma.manufacturingOrder.findFirstOrThrow({
      where: { companyId, name: { startsWith: 'MO-WIP-' } },
      include: { lines: true, jobCards: true },
    })
    const card = order.jobCards[0]
    expect(card).toBeTruthy()
    const logged = await call(`/api/job-cards/${card?.id}/log`, maya, {
      method: 'POST',
      body: JSON.stringify({ operatorName: 'Lin', minutes: 15, note: 'Second pass' }),
    })
    expect(logged.status).toBe(201)
    const loss = await call(`/api/manufacturing/${order.id}/wastage`, maya, {
      method: 'POST',
      body: JSON.stringify({ productId: order.lines[0]?.productId, quantity: 0.1, reason: 'Knife nick', kind: 'process_loss' }),
    })
    expect(loss.status).toBe(201)
    const produced = await call(`/api/manufacturing/${order.id}/produce`, maya, {
      method: 'POST',
      body: JSON.stringify({ quantity: 1 }),
    })
    expect(produced.status).toBe(200)
    expect((produced.body as { quantityDone?: number; state?: string }).quantityDone).toBe(2)
    expect((produced.body as { state?: string }).state).toBe('progress')
    const report = await call('/api/manufacturing/wastage', maya)
    const body = report.body as { byReason?: Array<{ reason: string }>; cost?: number }
    expect(body.byReason?.some((row) => row.reason === 'Frayed edge')).toBe(true)
    expect(body.byReason?.some((row) => row.reason === 'Knife nick')).toBe(true)
    expect((body.cost ?? 0) > 0).toBe(true)
    await booksBalance()
  })

  it('sends material to a supplier and receives the finished good', async () => {
    const order = await prisma.manufacturingOrder.findFirstOrThrow({ where: { companyId, purpose: 'subcontract' } })
    const sent = await call(`/api/manufacturing/${order.id}/subcontract/send`, maya, { method: 'POST' })
    expect(sent.status).toBe(200)
    expect((sent.body as { subcontractState?: string }).subcontractState).toBe('sent')
    const received = await call(`/api/manufacturing/${order.id}/subcontract/receive`, maya, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(received.status).toBe(200)
    expect((received.body as { state?: string; subcontractState?: string }).state).toBe('done')
    expect((received.body as { subcontractState?: string }).subcontractState).toBe('received')
    await booksBalance()
  })
})
