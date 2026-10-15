import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDatabase } from '../prisma/seed.ts'
import { createApp } from '../server/app.ts'
import { prisma } from '../server/db.ts'

beforeAll(async () => {
  rmSync('prisma/test.db', { force: true })
  execSync('npx prisma db push --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  })
  await seedDatabase(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function actor(email: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { email } })
  return String(user.id)
}

async function call(path: string, user: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  headers.set('x-user-id', user)
  if (init.body) headers.set('content-type', 'application/json')
  const response = await createApp().request(path, { ...init, headers })
  const text = await response.text()
  return { status: response.status, body: text ? JSON.parse(text) as Record<string, unknown> : null }
}

describe('sales and stock', () => {
  it('refuses to confirm when the shelf is short, then delivers after a receipt', async () => {
    const maya = await actor('maya@northline.example')
    const milo = await prisma.contact.findFirstOrThrow({ where: { name: 'Milo Park' } })
    const tote = await prisma.product.findFirstOrThrow({ where: { sku: 'TO-11' } })
    const tax = await prisma.tax.findFirstOrThrow()

    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: milo.id,
        validityDate: '2026-06-01',
        lines: [{ productId: tote.id, quantity: 10, unitPrice: 24, discount: 0, taxId: tax.id }],
      }),
    })
    expect(created.status).toBe(201)
    const orderId = created.body?.id

    const blocked = await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' })
    expect(blocked.status).toBe(409)
    expect(String(blocked.body?.error)).toContain('Canvas tote')

    const receipt = await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: tote.id, quantityDelta: 8, note: 'Received from Brightmill' }),
    })
    expect(receipt.status).toBe(201)

    const confirmed = await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' })
    expect(confirmed.status).toBe(200)
    expect(confirmed.body?.state).toBe('sale')

    const delivered = await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' })
    expect(delivered.status).toBe(200)
    expect(delivered.body?.state).toBe('done')

    const internal = await prisma.stockLocation.findFirstOrThrow({ where: { type: 'internal' } })
    const quant = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: tote.id, locationId: internal.id } },
    })
    expect(quant.quantity).toBe(0)

    const cancelled = await call(`/api/orders/${orderId}/cancel`, maya, { method: 'POST' })
    expect(cancelled.status).toBe(409)
  })

  it('fulfills a service quotation without touching stock', async () => {
    const jonah = await actor('jonah@northline.example')
    const avery = await prisma.contact.findFirstOrThrow({ where: { name: 'Avery Lang' } })
    const service = await prisma.product.findFirstOrThrow({ where: { sku: 'SV-02' } })
    const created = await call('/api/orders', jonah, {
      method: 'POST',
      body: JSON.stringify({
        customerId: avery.id,
        lines: [{ productId: service.id, quantity: 1, unitPrice: 140, discount: 10, taxId: null }],
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body?.amountUntaxed).toBe(126)
    const orderId = created.body?.id
    expect((await call(`/api/orders/${orderId}/confirm`, jonah, { method: 'POST' })).status).toBe(200)
    const done = await call(`/api/orders/${orderId}/deliver`, jonah, { method: 'POST' })
    expect(done.status).toBe(200)
    expect(done.body?.state).toBe('done')
  })
})
