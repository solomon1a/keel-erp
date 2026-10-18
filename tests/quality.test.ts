import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let jonah = ''
let amira = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('quality checks', () => {
  it('keeps Jiangbei books and shows the seeded alert without a journal', async () => {
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.body).toMatchObject({ profit: jiangbeiBooks.profit })
    const dashboard = await call('/api/quality/dashboard', maya)
    expect(dashboard.status).toBe(200)
    expect((dashboard.body as { openAlerts: number }).openAlerts).toBeGreaterThanOrEqual(1)
    const alerts = await call('/api/quality/alerts', maya)
    const rows = alerts.body as unknown as Array<{ product: { sku: string }; status: string; entry: { id: number } | null }>
    const linen = rows.find((row) => row.product.sku === 'QC-LINEN')
    expect(linen?.status).toBe('open')
    expect(linen?.entry).toBeNull()
    expect((await call('/api/quality/alerts', amira)).status).toBe(200)
    const foreign = (await call('/api/quality/alerts', amira)).body as unknown as Array<{ product: { sku: string } }>
    expect(foreign.some((row) => row.product.sku === 'QC-LINEN')).toBe(false)
  })

  it('blocks a receipt until an admin records a reason, and Jonah cannot override', async () => {
    const company = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    const product = await prisma.product.create({
      data: {
        companyId: company.companyId,
        name: 'Checked cloth',
        sku: 'QC-CLOTH',
        type: 'product',
        kind: 'raw',
        listPrice: 10,
        costPrice: 6,
        purchasable: true,
      },
    })
    const point = await call('/api/quality/points', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Cloth on receipt', productId: product.id, trigger: 'receipt', checkType: 'pass_fail' }),
    })
    expect(point.status).toBe(201)
    const vendor = await prisma.contact.findFirstOrThrow({ where: { companyId: company.companyId, name: 'Suhang Weaving' } })
    const purchase = await call('/api/purchases', maya, {
      method: 'POST',
      body: JSON.stringify({ vendorId: vendor.id, lines: [{ productId: product.id, quantity: 4, unitCost: 6, taxId: null }] }),
    })
    const purchaseId = (purchase.body as { id: number }).id
    expect((await call(`/api/purchases/${purchaseId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    const blocked = await call(`/api/purchases/${purchaseId}/receive`, maya, { method: 'POST', body: JSON.stringify({}) })
    expect(blocked.status).toBe(409)
    expect(String(blocked.body?.error)).toContain('Checked cloth')
    const checks = await call('/api/quality/checks', maya)
    const check = (checks.body as unknown as Array<{ id: number; product: { sku: string }; status: string }>).find((row) => row.product.sku === 'QC-CLOTH')
    expect(check?.status).toBe('pending')
    if (!check) throw new Error('missing check')
    const denied = await call(`/api/quality/checks/${check.id}/override`, jonah, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Jonah should not release this' }),
    })
    expect(denied.status).toBe(403)
    const released = await call(`/api/quality/checks/${check.id}/override`, maya, {
      method: 'POST',
      body: JSON.stringify({ reason: 'Buyer accepted the lot' }),
    })
    expect(released.status).toBe(200)
    expect((released.body as { overrideReason: string }).overrideReason).toContain('Buyer accepted')
    const received = await call(`/api/purchases/${purchaseId}/receive`, maya, { method: 'POST', body: JSON.stringify({}) })
    expect(received.status).toBe(200)
    expect((received.body as { state: string }).state).toBe('done')
  })

  it('fails a receipt into quarantine and scraps it through the wastage account', async () => {
    const company = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    const product = await prisma.product.create({
      data: {
        companyId: company.companyId,
        name: 'Torn roll',
        sku: 'QC-TORN',
        type: 'product',
        kind: 'raw',
        listPrice: 9,
        costPrice: 5,
        purchasable: true,
      },
    })
    expect((await call('/api/quality/points', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Torn on receipt', productId: product.id, trigger: 'receipt', checkType: 'pass_fail' }),
    })).status).toBe(201)
    const vendor = await prisma.contact.findFirstOrThrow({ where: { companyId: company.companyId, name: 'Qingpu Yarn' } })
    const purchase = await call('/api/purchases', maya, {
      method: 'POST',
      body: JSON.stringify({ vendorId: vendor.id, lines: [{ productId: product.id, quantity: 3, unitCost: 5, taxId: null }] }),
    })
    const purchaseId = (purchase.body as { id: number }).id
    expect((await call(`/api/purchases/${purchaseId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    const checks = await call('/api/quality/checks', maya)
    const check = (checks.body as unknown as Array<{ id: number; product: { sku: string } }>).find((row) => row.product.sku === 'QC-TORN')
    if (!check) throw new Error('missing check')
    const failed = await call(`/api/quality/checks/${check.id}/record`, maya, {
      method: 'POST',
      body: JSON.stringify({ status: 'fail', notes: 'Edge is torn' }),
    })
    expect(failed.status).toBe(200)
    const quarantine = await prisma.stockLocation.findFirstOrThrow({ where: { companyId: company.companyId, type: 'quarantine' } })
    const quant = await prisma.stockQuant.findUniqueOrThrow({ where: { productId_locationId: { productId: product.id, locationId: quarantine.id } } })
    expect(quant.quantity).toBe(3)
    const internal = await prisma.stockQuant.findUnique({ where: { productId_locationId: { productId: product.id, locationId: (await prisma.stockLocation.findFirstOrThrow({ where: { companyId: company.companyId, type: 'internal', isDefault: true } })).id } } })
    expect(internal?.quantity ?? 0).toBe(0)
    const stillBlocked = await call(`/api/purchases/${purchaseId}/receive`, maya, { method: 'POST', body: JSON.stringify({}) })
    expect(stillBlocked.status).toBe(409)
    const alerts = await call('/api/quality/alerts', maya)
    const alert = (alerts.body as unknown as Array<{ id: number; product: { sku: string }; status: string }>).find((row) => row.product.sku === 'QC-TORN')
    if (!alert) throw new Error('missing alert')
    const scrapped = await call(`/api/quality/alerts/${alert.id}/resolve`, maya, {
      method: 'POST',
      body: JSON.stringify({ action: 'scrap' }),
    })
    expect(scrapped.status).toBe(200)
    const entryId = (scrapped.body as { entry: { id: number } | null }).entry?.id
    expect(entryId).toBeTruthy()
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id: entryId ?? 0 }, include: { lines: { include: { account: true } } } })
    const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0)
    const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0)
    expect(debit).toBe(credit)
    expect(entry.lines.some((line) => line.account.code === '6603' && line.debit === 15)).toBe(true)
    expect(entry.lines.some((line) => line.account.code === '1410' && line.credit === 15)).toBe(true)
    const left = await prisma.stockQuant.findUnique({ where: { productId_locationId: { productId: product.id, locationId: quarantine.id } } })
    expect(left?.quantity ?? 0).toBe(0)
  })

  it('blocks production until the operation check passes', async () => {
    const company = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    const finished = await prisma.product.create({
      data: { companyId: company.companyId, name: 'Checked tote', sku: 'QC-TOTE', type: 'product', kind: 'finished', listPrice: 20, costPrice: 4 },
    })
    const cloth = await prisma.product.create({
      data: { companyId: company.companyId, name: 'Checked canvas', sku: 'QC-CANVAS', type: 'product', kind: 'raw', listPrice: 3, costPrice: 2, purchasable: true },
    })
    const bench = await prisma.workstation.findFirstOrThrow({ where: { companyId: company.companyId, name: 'Cutting bench' } })
    const bom = await call('/api/boms', maya, {
      method: 'POST',
      body: JSON.stringify({
        productId: finished.id,
        yieldQty: 1,
        lines: [{ productId: cloth.id, quantity: 1 }],
        operations: [{ name: 'Inspect', workstationId: bench.id, hours: 0.2 }],
      }),
    })
    expect(bom.status).toBe(201)
    expect((await call('/api/quality/points', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Inspect the tote', productId: finished.id, trigger: 'operation', operationName: 'Inspect', checkType: 'checklist', checklist: 'Stitch\nHem' }),
    })).status).toBe(201)
    await call('/api/stock/adjust', maya, { method: 'POST', body: JSON.stringify({ productId: cloth.id, quantityDelta: 2, note: 'Cloth for the quality bench' }) })
    const order = await call('/api/manufacturing', maya, { method: 'POST', body: JSON.stringify({ productId: finished.id, quantity: 1 }) })
    const orderId = (order.body as { id: number }).id
    expect((await call(`/api/manufacturing/${orderId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    expect((await call(`/api/manufacturing/${orderId}/start`, maya, { method: 'POST' })).status).toBe(200)
    const blocked = await call(`/api/manufacturing/${orderId}/produce`, maya, { method: 'POST', body: JSON.stringify({ quantity: 1 }) })
    expect(blocked.status).toBe(409)
    const checks = await call('/api/quality/checks', maya)
    const check = (checks.body as unknown as Array<{ id: number; product: { sku: string } }>).find((row) => row.product.sku === 'QC-TOTE')
    if (!check) throw new Error('missing operation check')
    expect((await call(`/api/quality/checks/${check.id}/record`, maya, {
      method: 'POST',
      body: JSON.stringify({ checklist: ['Stitch', 'Hem'] }),
    })).status).toBe(200)
    const produced = await call(`/api/manufacturing/${orderId}/produce`, maya, { method: 'POST', body: JSON.stringify({ quantity: 1 }) })
    expect(produced.status).toBe(200)
  })
})
