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

describe('manufacturing', () => {
  it('refuses a short confirm, then consumes components and adds finished goods', async () => {
    const tote = await prisma.product.findFirstOrThrow({ where: { sku: 'TO-11' } })
    const canvas = await prisma.product.findFirstOrThrow({ where: { sku: 'RM-CV' } })
    const yarn = await prisma.product.findFirstOrThrow({ where: { sku: 'RM-YN' } })

    const seeded = await prisma.manufacturingOrder.findFirstOrThrow({ where: { name: 'MO0001' } })
    expect(seeded.state).toBe('draft')
    expect(seeded.quantity).toBe(4)

    const bom = await call('/api/boms', maya)
    expect(bom.status).toBe(200)
    const bills = bom.body as unknown as Array<{ productId: number; unitCost: number; yieldQty: number }>
    expect(bills.find((row) => row.productId === tote.id)?.unitCost).toBe(24)

    const created = await call('/api/manufacturing', jonah, {
      method: 'POST',
      body: JSON.stringify({ productId: tote.id, quantity: 2 }),
    })
    expect(created.status).toBe(201)
    const draft = created.body as { id: number; name: string; lines: Array<{ productId: number; quantity: number }> }
    expect(draft.name).toBe('MO0002')
    expect(draft.lines.find((line) => line.productId === canvas.id)?.quantity).toBe(3)
    expect(draft.lines.find((line) => line.productId === yarn.id)?.quantity).toBe(0.3)

    const denied = await call(`/api/manufacturing/${draft.id}/confirm`, jonah, { method: 'POST' })
    expect(denied.status).toBe(403)

    const blocked = await call(`/api/manufacturing/${draft.id}/confirm`, maya, { method: 'POST' })
    expect(blocked.status).toBe(409)
    expect(String(blocked.body?.error)).toContain('本色帆布')
    expect(String(blocked.body?.error)).toContain('0')

    await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: canvas.id, quantityDelta: 10, note: 'Canvas for the bench' }),
    })
    await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: yarn.id, quantityDelta: 5, note: 'Yarn for the bench', lotName: 'YN-BENCH' }),
    })

    const confirmed = await call(`/api/manufacturing/${draft.id}/confirm`, maya, { method: 'POST' })
    expect(confirmed.status).toBe(200)
    expect((confirmed.body as { state: string }).state).toBe('confirmed')

    const started = await call(`/api/manufacturing/${draft.id}/start`, jonah, { method: 'POST' })
    expect(started.status).toBe(200)
    expect((started.body as { state: string }).state).toBe('progress')

    const partial = await call(`/api/manufacturing/${draft.id}/produce`, jonah, {
      method: 'POST',
      body: JSON.stringify({ quantity: 1 }),
    })
    expect(partial.status).toBe(200)
    expect((partial.body as { state: string; quantityDone: number }).state).toBe('progress')
    expect((partial.body as { quantityDone: number }).quantityDone).toBe(1)

    const internal = await prisma.stockLocation.findFirstOrThrow({ where: { type: 'internal' } })
    const toteQuant = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: tote.id, locationId: internal.id } },
    })
    expect(toteQuant.quantity).toBe(3)

    const rest = await call(`/api/manufacturing/${draft.id}/produce`, maya, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    expect(rest.status).toBe(200)
    expect((rest.body as { state: string }).state).toBe('done')

    const finished = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: tote.id, locationId: internal.id } },
    })
    const canvasQuant = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: canvas.id, locationId: internal.id } },
    })
    const yarnQuant = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: yarn.id, locationId: internal.id } },
    })
    expect(finished.quantity).toBe(4)
    expect(canvasQuant.quantity).toBe(7)
    expect(yarnQuant.quantity).toBeCloseTo(4.7)

    const cancelled = await call(`/api/manufacturing/${draft.id}/cancel`, maya, { method: 'POST' })
    expect(cancelled.status).toBe(409)

    const moves = await prisma.stockMove.count({ where: { manufacturingOrderId: draft.id, state: 'done' } })
    expect(moves).toBeGreaterThan(0)
  })
})
