import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords, seedDatabase } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'

let maya = ''

beforeAll(async () => {
  rmSync('prisma/test.db', { force: true })
  execSync('npx prisma db push --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  })
  await seedDatabase(prisma)
  maya = await signIn('maya@northline.example', demoPasswords.maya)
})

afterAll(async () => {
  await prisma.$disconnect()
})

type WarehouseRow = {
  id: number
  name: string
  code: string
  isDefault: boolean
  locations: Array<{ id: number; name: string; isDefault: boolean }>
}

describe('inventory', () => {
  it('keeps a second warehouse, a short reorder rule, a transfer, and a lot count', async () => {
    const listed = await call('/api/warehouses', maya)
    expect(listed.status).toBe(200)
    const warehouses = listed.body as unknown as WarehouseRow[]
    const shanghai = warehouses.find((row) => row.code === 'SH')
    const shop = warehouses.find((row) => row.code === 'SZ')
    expect(shanghai?.isDefault).toBe(true)
    expect(shanghai?.name).toBe('上海仓')
    expect(shop?.name).toBe('深圳门店')
    const main = shanghai?.locations.find((location) => location.name === '主库')
    const finished = shanghai?.locations.find((location) => location.name === '成品区')
    const counter = shop?.locations.find((location) => location.name === '店面')
    expect(main?.isDefault).toBe(true)
    expect(finished?.isDefault).toBe(false)
    expect(counter?.isDefault).toBe(true)

    const replenish = await call('/api/stock/replenish', maya)
    expect(replenish.status).toBe(200)
    const rules = replenish.body as unknown as Array<{
      minQty: number
      maxQty: number
      onHand: number
      suggestQty: number
      short: boolean
      product: { name: string; hasBom: boolean; purchasable: boolean }
      warehouse: { code: string }
    }>
    const toteRule = rules.find((rule) => rule.product.name === 'Canvas tote')
    expect(toteRule).toMatchObject({
      minQty: 5,
      maxQty: 12,
      onHand: 2,
      suggestQty: 10,
      short: true,
      warehouse: { code: 'SH' },
    })
    expect(toteRule?.product.hasBom).toBe(true)
    expect(toteRule?.product.purchasable).toBe(true)

    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01' } })
    const yarn = await prisma.product.findFirstOrThrow({ where: { sku: 'RM-YN' } })
    const created = await call('/api/transfers', maya, {
      method: 'POST',
      body: JSON.stringify({
        locationFromId: main?.id,
        locationToId: counter?.id,
        lines: [{ productId: notebook.id, quantity: 1 }],
      }),
    })
    expect(created.status).toBe(201)
    const transfer = created.body as { id: number; name: string; state: string }
    expect(transfer.name).toBe('INT0002')
    expect(transfer.state).toBe('draft')

    const ready = await call(`/api/transfers/${transfer.id}/ready`, maya, { method: 'POST' })
    expect(ready.status).toBe(200)
    expect((ready.body as { state: string }).state).toBe('ready')

    const done = await call(`/api/transfers/${transfer.id}/done`, maya, { method: 'POST' })
    expect(done.status).toBe(200)
    expect((done.body as { state: string }).state).toBe('done')

    const levels = await call('/api/stock', maya)
    expect(levels.status).toBe(200)
    const stock = levels.body as {
      valuation: number
      levels: Array<{ sku: string; locationName: string; onHand: number; value: number }>
    }
    expect(stock.levels.find((row) => row.sku === 'NB-01' && row.locationName === '主库')?.onHand).toBe(39)
    expect(stock.levels.find((row) => row.sku === 'NB-01' && row.locationName === '店面')?.onHand).toBe(8)

    const counted = await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({
        productId: yarn.id,
        locationId: finished?.id,
        quantityDelta: 4,
        note: 'Lot count in finished goods',
        lotName: 'YN-26',
      }),
    })
    expect(counted.status).toBe(201)
    expect((counted.body as { lotName: string }).lotName).toBe('YN-26')

    const missingLot = await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({
        productId: yarn.id,
        locationId: finished?.id,
        quantityDelta: 1,
        note: 'Missing lot',
      }),
    })
    expect(missingLot.status).toBe(400)

    const after = await call('/api/stock', maya)
    const afterStock = after.body as {
      valuation: number
      levels: Array<{ sku: string; locationName: string; onHand: number; value: number }>
    }
    const yarnLevel = afterStock.levels.find((row) => row.sku === 'RM-YN' && row.locationName === '成品区')
    expect(yarnLevel?.onHand).toBe(4)
    expect(yarnLevel?.value).toBe(160)
    expect(afterStock.valuation).toBeGreaterThan(0)

    const ledger = await call(`/api/stock/moves?productId=${yarn.id}&locationId=${finished?.id}`, maya)
    expect(ledger.status).toBe(200)
    const moves = ledger.body as unknown as Array<{ lotName: string | null; reference: string }>
    expect(moves.some((move) => move.lotName === 'YN-26')).toBe(true)

    const order = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: (await prisma.contact.findFirstOrThrow({ where: { name: 'Cedar & Co' } })).id,
        warehouseId: shop?.id,
        validityDate: '2026-12-01',
        lines: [{ productId: notebook.id, quantity: 1, unitPrice: 18, discount: 0, taxId: null }],
      }),
    })
    expect(order.status).toBe(201)
    expect((order.body as { warehouse: { code: string } }).warehouse.code).toBe('SZ')
  })
})
