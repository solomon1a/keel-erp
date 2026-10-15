import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords, seedDatabase } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'

let maya = ''
let jonah = ''

beforeAll(async () => {
  rmSync('prisma/test.db', { force: true })
  execSync('npx prisma db push --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  })
  await seedDatabase(prisma)
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('point of sale', () => {
  it('sells from the shop shelf, refunds as admin, and closes a difference as admin', async () => {
    const shop = await prisma.warehouse.findFirstOrThrow({ where: { code: 'SZ' } })
    const session = await prisma.posSession.findFirstOrThrow({ where: { name: 'SES0001' } })
    expect(session.state).toBe('open')
    expect(session.openingCash).toBe(200)

    const catalog = await call(`/api/pos/catalog?warehouseId=${shop.id}`, jonah)
    expect(catalog.status).toBe(200)
    const products = (catalog.body as { products: Array<{ sku: string; barcode: string; onHand: number; categoryName: string }> }).products
    const notebook = products.find((row) => row.sku === 'NB-01')
    const blanket = products.find((row) => row.sku === 'BL-04')
    expect(notebook).toMatchObject({ barcode: '6901000000018', onHand: 7, categoryName: '文具' })
    expect(blanket).toMatchObject({ barcode: '6901000000025', onHand: 4, categoryName: '家居' })

    const seeded = await call('/api/pos/orders', maya)
    const seededOrders = seeded.body as unknown as Array<{ name: string; amountTotal: number; state: string }>
    expect(seededOrders.find((row) => row.name === 'POS0001')).toMatchObject({ amountTotal: 20.34, state: 'paid' })

    const again = await call('/api/pos/sessions', jonah, {
      method: 'POST',
      body: JSON.stringify({ warehouseId: shop.id, openingCash: 50 }),
    })
    expect(again.status).toBe(409)

    const sold = await call('/api/pos/orders', jonah, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.id,
        customerId: null,
        lines: [{ productId: (await prisma.product.findFirstOrThrow({ where: { sku: 'BL-04' } })).id, quantity: 1, discount: 0 }],
        payments: [
          { method: 'cash', amount: 40, tendered: 40 },
          { method: 'card', amount: 57.18 },
        ],
      }),
    })
    expect(sold.status).toBe(201)
    const order = sold.body as { id: number; name: string; amountTotal: number; amountTax: number; state: string }
    expect(order.name).toBe('POS0002')
    expect(order.amountTax).toBe(11.18)
    expect(order.amountTotal).toBe(97.18)

    const shelf = await prisma.stockQuant.findFirstOrThrow({
      where: { product: { sku: 'BL-04' }, location: { name: '店面' } },
    })
    expect(shelf.quantity).toBe(3)

    const short = await call('/api/pos/orders', jonah, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.id,
        lines: [{ productId: (await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01' } })).id, quantity: 100 }],
        payments: [{ method: 'cash', amount: 2034 }],
      }),
    })
    expect(short.status).toBe(409)
    expect(String(short.body?.error)).toContain('on hand')

    const denied = await call(`/api/pos/orders/${order.id}/refund`, jonah, {
      method: 'POST',
      body: JSON.stringify({
        lines: [{ lineId: (sold.body as { lines: Array<{ id: number }> }).lines[0].id, quantity: 1 }],
        payments: [{ method: 'cash', amount: 97.18 }],
      }),
    })
    expect(denied.status).toBe(403)

    const refunded = await call(`/api/pos/orders/${order.id}/refund`, maya, {
      method: 'POST',
      body: JSON.stringify({
        lines: [{ lineId: (sold.body as { lines: Array<{ id: number }> }).lines[0].id, quantity: 1 }],
        payments: [{ method: 'cash', amount: 97.18 }],
      }),
    })
    expect(refunded.status).toBe(200)
    expect((refunded.body as { state: string }).state).toBe('refunded')
    const restored = await prisma.stockQuant.findFirstOrThrow({
      where: { product: { sku: 'BL-04' }, location: { name: '店面' } },
    })
    expect(restored.quantity).toBe(4)

    const open = await call(`/api/pos/sessions/${session.id}`, jonah)
    const expected = (open.body as { summary: { expectedCash: number } }).summary.expectedCash
    expect(expected).toBe(163.16)

    const blocked = await call(`/api/pos/sessions/${session.id}/close`, jonah, {
      method: 'POST',
      body: JSON.stringify({ closingCash: expected + 5 }),
    })
    expect(blocked.status).toBe(403)

    const closed = await call(`/api/pos/sessions/${session.id}/close`, maya, {
      method: 'POST',
      body: JSON.stringify({ closingCash: expected + 5, note: 'Drawer was over' }),
    })
    expect(closed.status).toBe(200)
    expect((closed.body as { state: string; difference: number }).difference).toBe(5)

    const today = new Date().toISOString().slice(0, 10)
    const report = await call(`/api/pos/report?warehouseId=${shop.id}&date=${today}`, maya)
    expect(report.status).toBe(200)
    const daily = report.body as { salesTotal: number; refundTotal: number; payments: { cash: number; card: number }; orderCount: number }
    expect(daily.orderCount).toBe(2)
    expect(daily.salesTotal).toBe(117.52)
    expect(daily.refundTotal).toBe(97.18)
    expect(daily.payments.card).toBe(57.18)
  })
})
