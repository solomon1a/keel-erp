import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedMfgPlanning } from '../prisma/seed-mfg.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { roundMoney } from '../src/domain/money.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''
let companyId = 0

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
  companyId = (await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })).companyId
})

afterAll(async () => {
  await prisma.$disconnect()
})

function expectStatus(response: { status: number; body: unknown }, status: number) {
  expect(response.status, JSON.stringify(response.body)).toBe(status)
}

async function setSetting(key: string, value: string) {
  const saved = await call('/api/module-settings', maya, {
    method: 'PUT',
    body: JSON.stringify({ module: 'manufacturing', values: [{ key, value }] }),
  })
  expectStatus(saved, 200)
}

type PlanLine = {
  productId: number
  demandQty: number
  toMake: number
  toBuy: number
  leadDays: number
  source: string
  purchaseOrder: { name: string; state: string } | null
}

type Plan = { id: number; name: string; lines: PlanLine[] }

function monthPeriod(offset: number) {
  const now = new Date()
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

describe('manufacturing part 2', () => {
  it('keeps the Jiangbei books healthy and shows the seeded plan', async () => {
    const pnl = await call('/api/reports/pnl', maya)
    const balance = await call('/api/reports/balance', maya)
    expectStatus(pnl, 200)
    expectStatus(balance, 200)
    const profit = (pnl.body as { profit?: number; income?: number }).profit ?? 0
    const income = (pnl.body as { income?: number }).income ?? 0
    expect(profit).toBeGreaterThan(0)
    const margin = income > 0 ? (profit / income) * 100 : 0
    expect(margin).toBeGreaterThan(5)
    expect(margin).toBeLessThan(25)
    expect((balance.body as { balanced?: boolean }).balanced).toBe(true)
    expect((balance.body as { assets?: number }).assets ?? 0).toBeGreaterThan(0)

    const forecasts = await call('/api/manufacturing/forecasts', maya)
    expectStatus(forecasts, 200)
    expect((forecasts.body as unknown as Array<{ name: string }>).some((row) => row.name === 'FC-JB-01')).toBe(true)
    const foreignForecasts = await call('/api/manufacturing/forecasts', amira)
    expect((foreignForecasts.body as unknown as Array<{ name: string }>).some((row) => row.name === 'FC-JB-01')).toBe(false)

    const downtime = await call('/api/manufacturing/downtime', maya)
    const entries = downtime.body as unknown as Array<{ name: string; state: string; workstation: { name: string } }>
    expect(entries.some((row) => row.name === 'DT-JB-01' && row.state === 'confirmed' && row.workstation.name === 'Packing table')).toBe(true)
    expect(entries.some((row) => row.name === 'DT-JB-03' && row.state === 'draft')).toBe(true)
    expect(entries.some((row) => row.workstation.name === 'Dye vat' || row.workstation.name === 'Hem station' || row.workstation.name === 'Cutting bench')).toBe(false)

    const unbuilds = await call('/api/manufacturing/unbuild', maya)
    expect((unbuilds.body as unknown as Array<{ name: string; state: string }>).some((row) => row.name === 'UBV-01' && row.state === 'draft')).toBe(true)

    const plans = await call('/api/manufacturing/plans', maya)
    const mps = (plans.body as unknown as Plan[]).find((row) => row.name.startsWith('PLAN-MPS-'))
    expect(mps?.lines.some((line) => line.toMake === 36 && line.source === 'forecast' && line.leadDays === 5)).toBe(true)
    expect(mps?.lines.some((line) => line.toBuy === 40 && line.leadDays === 12)).toBe(true)

    const stations = await call('/api/workstations', maya)
    const dye = (stations.body as unknown as Array<{ name: string; oee: number | null }>).find((row) => row.name === 'Dye vat')
    const hem = (stations.body as unknown as Array<{ name: string; oee: number | null }>).find((row) => row.name === 'Hem station')
    const bench = (stations.body as unknown as Array<{ name: string; oee: number | null }>).find((row) => row.name === 'Cutting bench')
    expect(dye?.oee).toBe(62.5)
    expect(hem?.oee).toBe(53.3)
    expect(bench?.oee).toBe(33.9)

    const journals = await prisma.journalEntry.count({ where: { companyId } })
    const forecastCount = await prisma.demandForecast.count({ where: { companyId, name: { startsWith: 'FC-JB-' } } })
    await seedMfgPlanning(prisma)
    expect(await prisma.demandForecast.count({ where: { companyId, name: { startsWith: 'FC-JB-' } } })).toBe(forecastCount)
    expect(await prisma.journalEntry.count({ where: { companyId } })).toBe(journals)
  })

  it('plans from forecasts, the horizon, reorder, and lead time, and drafts a purchase without taking the next number', async () => {
    const raw = await prisma.product.create({
      data: { companyId, name: 'Plan yarn', sku: 'PLAN-YARN', type: 'product', kind: 'raw', listPrice: 4, costPrice: 4, purchasable: true },
    })
    const made = await prisma.product.create({
      data: { companyId, name: 'Plan scarf', sku: 'PLAN-SCARF', type: 'product', kind: 'finished', listPrice: 20, costPrice: 1, leadDays: 14 },
    })
    const button = await prisma.product.create({
      data: { companyId, name: 'Plan button', sku: 'PLAN-BTN', type: 'product', kind: 'raw', listPrice: 1, costPrice: 1, purchasable: true, leadDays: 0 },
    })
    const bom = await call('/api/boms', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: made.id, yieldQty: 1, lines: [{ productId: raw.id, quantity: 1 }] }),
    })
    expectStatus(bom, 201)
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId, isDefault: true } })
    await prisma.reorderRule.create({
      data: { companyId, productId: button.id, warehouseId: warehouse.id, minQty: 4, maxQty: 10 },
    })
    await call('/api/manufacturing/forecasts', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'FC-SCARF-NEAR', productId: made.id, period: monthPeriod(0), quantity: 6, note: 'This month' }),
    })
    await call('/api/manufacturing/forecasts', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'FC-SCARF-FAR', productId: made.id, period: '2099-06', quantity: 10, note: 'Far ahead' }),
    })

    await setSetting('forecast', 'yes')
    await setSetting('reorder', 'yes')
    await setSetting('horizon', '0')
    await setSetting('plead', '21')
    const open = await call('/api/manufacturing/plans', maya, { method: 'POST' })
    expectStatus(open, 201)
    const openPlan = open.body as unknown as Plan
    const scarf = openPlan.lines.find((line) => line.productId === made.id)
    const buttons = openPlan.lines.find((line) => line.productId === button.id)
    expect(scarf?.demandQty).toBe(16)
    expect(scarf?.toMake).toBe(16)
    expect(scarf?.leadDays).toBe(14)
    expect(scarf?.source === 'forecast' || scarf?.source === 'mixed').toBe(true)
    expect(buttons?.toBuy).toBe(10)
    expect(buttons?.leadDays).toBe(21)
    expect(buttons?.source).toBe('reorder')

    await setSetting('horizon', '30')
    const near = await call('/api/manufacturing/plans', maya, { method: 'POST' })
    expectStatus(near, 201)
    const nearScarf = (near.body as unknown as Plan).lines.find((line) => line.productId === made.id)
    expect(nearScarf?.demandQty).toBe(6)

    await setSetting('forecast', 'no')
    const silent = await call('/api/manufacturing/plans', maya, { method: 'POST' })
    expectStatus(silent, 201)
    expect((silent.body as unknown as Plan).lines.some((line) => line.productId === made.id)).toBe(false)

    await setSetting('reorder', 'no')
    await setSetting('forecast', 'yes')
    await setSetting('plead', '9')
    const noReorder = await call('/api/manufacturing/plans', maya, { method: 'POST' })
    expectStatus(noReorder, 201)
    expect((noReorder.body as unknown as Plan).lines.some((line) => line.productId === button.id)).toBe(false)

    const drafted = await call(`/api/manufacturing/plans/${openPlan.id}/purchases`, maya, { method: 'POST' })
    expectStatus(drafted, 200)
    const bought = (drafted.body as unknown as Plan).lines.find((line) => line.productId === button.id)
    expect(bought?.purchaseOrder?.name.startsWith('POV-')).toBe(true)
    expect(bought?.purchaseOrder?.state).toBe('draft')
    const series = await call('/api/number-series', maya)
    const rows = series.body as unknown as Array<{ document: string; preview: string }>
    expect(rows.find((row) => row.document === 'purchase.order')?.preview).toBe('PO0002')
    expect(rows.find((row) => row.document === 'manufacturing.order')?.preview).toBe('MO0002')

    await setSetting('forecast', 'yes')
    await setSetting('reorder', 'yes')
    await setSetting('horizon', '0')
    await setSetting('plead', '7')
  }, 60_000)

  it('lets confirmed downtime change availability and leaves the seeded centers alone when the setting is off', async () => {
    const before = await call('/api/workstations', maya)
    const packing = (before.body as unknown as Array<{ name: string; availability: number | null; oee: number | null }>).find((row) => row.name === 'Packing table')
    expect(packing?.availability).not.toBeNull()
    await setSetting('downtime', 'no')
    const ignored = await call('/api/workstations', maya)
    const open = (ignored.body as unknown as Array<{ name: string; availability: number | null; oee: number | null }>).find((row) => row.name === 'Packing table')
    expect(open?.availability ?? 0).toBeGreaterThan(packing?.availability ?? 0)
    const dye = (ignored.body as unknown as Array<{ name: string; oee: number | null }>).find((row) => row.name === 'Dye vat')
    expect(dye?.oee).toBe(62.5)
    await setSetting('downtime', 'yes')
    const restored = await call('/api/workstations', maya)
    const again = (restored.body as unknown as Array<{ name: string; availability: number | null }>).find((row) => row.name === 'Packing table')
    expect(again?.availability).toBe(packing?.availability ?? null)
  })

  it('unbuilds a finished good into its component without unbalancing the books', async () => {
    const before = await call('/api/reports/pnl', maya)
    const profit = (before.body as { profit?: number }).profit
    const made = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'PLAN-SCARF' } })
    const raw = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'PLAN-YARN' } })
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId, isDefault: true } })
    const locations = await prisma.stockLocation.findMany({ where: { warehouseId: warehouse.id, type: 'internal' }, orderBy: { id: 'asc' } })
    const location = locations.find((row) => row.isDefault) ?? locations[0]
    expect(location).toBeTruthy()
    await prisma.product.update({ where: { id: made.id }, data: { costPrice: 4 } })
    await prisma.stockQuant.create({ data: { productId: made.id, locationId: location!.id, quantity: 2 } })
    const created = await call('/api/manufacturing/unbuild', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'UBV-TEST', productId: made.id, quantity: 1, note: 'Test piece' }),
    })
    expectStatus(created, 201)
    const id = (created.body as { id?: number }).id
    const done = await call(`/api/manufacturing/unbuild/${id}/done`, maya, { method: 'POST' })
    expectStatus(done, 200)
    expect((done.body as { state?: string }).state).toBe('done')
    const again = await call(`/api/manufacturing/unbuild/${id}/done`, maya, { method: 'POST' })
    expectStatus(again, 200)
    const fg = await prisma.stockQuant.findUniqueOrThrow({ where: { productId_locationId: { productId: made.id, locationId: location!.id } } })
    const component = await prisma.stockQuant.findUniqueOrThrow({ where: { productId_locationId: { productId: raw.id, locationId: location!.id } } })
    expect(fg.quantity).toBe(1)
    expect(component.quantity).toBe(1)
    const hidden = await call(`/api/manufacturing/unbuild/${id}/done`, amira, { method: 'POST' })
    expectStatus(hidden, 404)
    const items = await prisma.journalItem.findMany({ where: { entry: { companyId } }, select: { debit: true, credit: true } })
    const debit = roundMoney(items.reduce((sum, row) => sum + row.debit, 0))
    const credit = roundMoney(items.reduce((sum, row) => sum + row.credit, 0))
    expect(debit).toBe(credit)
    const after = await call('/api/reports/pnl', maya)
    expect((after.body as { profit?: number }).profit).toBe(profit)
    const sheet = await call('/api/reports/balance', maya)
    expect((sheet.body as { balanced?: boolean }).balanced).toBe(true)
  })

  it('reports production, variance, utilisation, and scrap, and compares and explodes bills', async () => {
    const report = await call('/api/manufacturing/reports', maya)
    expectStatus(report, 200)
    const body = report.body as {
      production: unknown[]
      wip: { orders: unknown[]; value: number }
      variance: unknown[]
      utilisation: Array<{ name: string; downtimeMinutes: number }>
      scrap: { cost: number; expected: number; actual: number; variancePct: number; byReason: Array<{ reason: string }> }
    }
    expect(body.production.length).toBeGreaterThan(0)
    expect(Array.isArray(body.variance)).toBe(true)
    expect(body.wip.value).toBeGreaterThanOrEqual(0)
    expect(body.utilisation.find((row) => row.name === 'Packing table')?.downtimeMinutes).toBe(45)
    expect(body.utilisation.find((row) => row.name === 'Dye vat')?.downtimeMinutes).toBe(0)
    expect(body.scrap.byReason.length).toBeGreaterThan(0)
    expect(body.scrap.variancePct).toBeGreaterThanOrEqual(0)
    expect(body.scrap.variancePct).toBeLessThanOrEqual(100)
    if (body.scrap.expected > 0.0001) {
      const inflated = roundMoney(((body.scrap.actual - body.scrap.expected) / body.scrap.expected) * 100)
      if (inflated > 100) expect(body.scrap.variancePct).toBeLessThan(inflated)
    }

    const bills = await call('/api/boms', maya)
    const rows = bills.body as unknown as Array<{ id: number; unitCost: number; product: { sku: string; name: string }; active?: boolean }>
    const apron = rows.find((row) => row.product.name === 'Shop apron' && row.active !== false)
    const tote = rows.find((row) => row.product.name === 'Canvas tote' && row.active !== false)
    expect(apron).toBeTruthy()
    const exploded = await call(`/api/boms/${apron?.id}/explode`, maya)
    expectStatus(exploded, 200)
    const flat = (exploded.body as { flat?: Array<{ level: number }>; levels?: number }).flat ?? []
    expect(flat.some((row) => row.level >= 2) || ((exploded.body as { levels?: number }).levels ?? 0) >= 2).toBe(true)

    const scarfBom = rows.find((row) => row.product.sku === 'PLAN-SCARF')
    const compared = await call('/api/boms/compare', maya, {
      method: 'POST',
      body: JSON.stringify({ leftId: apron?.id, rightId: scarfBom?.id }),
    })
    expectStatus(compared, 200)
    const lines = (compared.body as { lines?: Array<{ leftQty: number; rightQty: number }> }).lines ?? []
    expect(lines.some((line) => line.leftQty !== line.rightQty)).toBe(true)
    expect((compared.body as { left?: { unitCost?: number } }).left?.unitCost).toBe(39.88)

    const updated = await call(`/api/boms/${scarfBom?.id}/cost`, maya, { method: 'POST' })
    expectStatus(updated, 200)
    const scarf = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'PLAN-SCARF' } })
    expect(scarf.costPrice).toBe(4)
    expect(tote?.unitCost).toBe(24)
    const apronAfter = await prisma.billOfMaterials.findFirstOrThrow({
      where: { companyId, product: { name: 'Shop apron' }, active: true },
    })
    const listed = await call('/api/boms', maya)
    const apronCost = (listed.body as unknown as Array<{ id: number; unitCost: number }>).find((row) => row.id === apronAfter.id)
    expect(apronCost?.unitCost).toBe(39.88)
  })
})
