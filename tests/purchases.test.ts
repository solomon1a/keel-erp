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

describe('purchases', () => {
  it('lets a user draft an RFQ and blocks confirm until an admin receives stock in parts', async () => {
    const vendor = await prisma.contact.findFirstOrThrow({ where: { name: '苏杭织造' } })
    const canvas = await prisma.product.findFirstOrThrow({ where: { sku: 'RM-CV' } })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01' } })
    const tax = await prisma.tax.findFirstOrThrow()

    const seeded = await prisma.purchaseOrder.findFirstOrThrow({ where: { name: 'PO0001' } })
    expect(seeded.state).toBe('draft')
    expect(seeded.amountTotal).toBe(2260)

    const blockedProduct = await call('/api/purchases', jonah, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: vendor.id,
        lines: [{ productId: notebook.id, quantity: 1, unitCost: 6, taxId: tax.id }],
      }),
    })
    expect(blockedProduct.status).toBe(400)

    const created = await call('/api/purchases', jonah, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: vendor.id,
        lines: [{ productId: canvas.id, quantity: 10, unitCost: 12, taxId: tax.id }],
      }),
    })
    expect(created.status).toBe(201)
    const createdBody = created.body as {
      id: number
      name: string
      state: string
      amountUntaxed: number
      amountTax: number
      amountTotal: number
    }
    expect(createdBody.name).toBe('PO0002')
    expect(createdBody.state).toBe('draft')
    expect(createdBody.amountUntaxed).toBe(120)
    expect(createdBody.amountTax).toBe(15.6)
    expect(createdBody.amountTotal).toBe(135.6)
    const orderId = createdBody.id

    const denied = await call(`/api/purchases/${orderId}/confirm`, jonah, { method: 'POST' })
    expect(denied.status).toBe(403)

    const confirmed = await call(`/api/purchases/${orderId}/confirm`, maya, { method: 'POST' })
    expect(confirmed.status).toBe(200)
    const confirmedBody = confirmed.body as {
      state: string
      moves: Array<{ id: number; state: string }>
    }
    expect(confirmedBody.state).toBe('purchase')
    const moveId = confirmedBody.moves[0]?.id
    expect(confirmedBody.moves[0]?.state).toBe('draft')

    const internal = await prisma.stockLocation.findFirstOrThrow({ where: { type: 'internal' } })
    const before = await prisma.stockQuant.findUnique({
      where: { productId_locationId: { productId: canvas.id, locationId: internal.id } },
    })
    expect(before?.quantity ?? 0).toBe(0)

    const partial = await call(`/api/purchases/${orderId}/receive`, jonah, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ moveId, quantity: 4 }] }),
    })
    expect(partial.status).toBe(200)
    expect((partial.body as { state: string }).state).toBe('purchase')

    const mid = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: canvas.id, locationId: internal.id } },
    })
    expect(mid.quantity).toBe(4)

    const rest = await call(`/api/purchases/${orderId}/receive`, maya, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(rest.status).toBe(200)
    expect((rest.body as { state: string }).state).toBe('done')

    const after = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: canvas.id, locationId: internal.id } },
    })
    expect(after.quantity).toBe(10)

    const cancelled = await call(`/api/purchases/${orderId}/cancel`, maya, { method: 'POST' })
    expect(cancelled.status).toBe(409)
  })
})
