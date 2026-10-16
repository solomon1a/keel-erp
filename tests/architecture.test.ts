import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { canTransition } from '../shared/workflow.ts'
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

describe('architecture', () => {
  it('keeps the state machines closed', () => {
    expect(canTransition('sale.order', 'draft', 'done')).toBe(false)
    expect(canTransition('sale.order', 'draft', 'sale')).toBe(true)
    expect(canTransition('purchase.order', 'draft', 'purchase')).toBe(true)
    expect(canTransition('mrp.order', 'draft', 'done')).toBe(false)
    expect(canTransition('mrp.order', 'progress', 'done')).toBe(true)
    expect(canTransition('stock.transfer', 'draft', 'ready')).toBe(true)
    expect(canTransition('stock.transfer', 'draft', 'done')).toBe(false)
    expect(canTransition('account.move', 'draft', 'posted')).toBe(true)
    expect(canTransition('account.move', 'posted', 'paid')).toBe(true)
    expect(canTransition('account.move', 'posted', 'cancel')).toBe(false)
  })

  it('lets an internal user read a list and refuses a delete', async () => {
    const listed = await call('/api/desk-records?module=sales&screen=tags', jonah)
    expect(listed.status).toBe(200)
    expect(Array.isArray(listed.body)).toBe(true)

    const created = await call('/api/desk-records', maya, {
      method: 'POST',
      body: JSON.stringify({ module: 'sales', screen: 'tags', name: 'Architecture tag', state: 'active' }),
    })
    expect(created.status).toBe(201)
    const id = (created.body as { id: number }).id
    const denied = await call(`/api/desk-records/${id}`, jonah, { method: 'DELETE' })
    expect(denied.status).toBe(403)
    const removed = await call(`/api/desk-records/${id}`, maya, { method: 'DELETE' })
    expect(removed.status).toBe(200)

    const paged = await call('/api/desk-records?module=sales&screen=tags&page=1&pageSize=2', maya)
    expect(paged.status).toBe(200)
    expect(paged.body).toMatchObject({ page: 1, pageSize: 2 })
    expect(Array.isArray((paged.body as { rows?: unknown }).rows)).toBe(true)
  })

  it('hides another company’s saved filter and applies a record rule', async () => {
    const saved = await call('/api/saved-filters', maya, {
      method: 'POST',
      body: JSON.stringify({ model: 'sales.tags', name: 'Maya only', query: 'spring', groupBy: 'none', state: 'all' }),
    })
    expect(saved.status).toBe(201)
    const other = await call('/api/saved-filters?model=sales.tags', amira)
    const names = (other.body as unknown as Array<{ name: string }>).map((row) => row.name)
    expect(names).not.toContain('Maya only')

    const rule = await call('/api/access/rules', maya, {
      method: 'POST',
      body: JSON.stringify({
        groupKey: 'internal',
        model: 'desk.record',
        name: 'Own rows',
        field: 'owner',
        op: 'eq',
        value: 'Jonah Ellis',
      }),
    })
    expect(rule.status).toBe(200)
    const visible = await call('/api/desk-records?module=sales&screen=tags', jonah)
    const rows = visible.body as unknown as Array<{ owner: string }>
    expect(rows.every((row) => row.owner === 'Jonah Ellis')).toBe(true)
    const ruleId = ((rule.body as { groups: Array<{ key: string; rules: Array<{ id: number; name: string }> }> }).groups
      .find((group) => group.key === 'internal')?.rules.find((row) => row.name === 'Own rows')?.id) ?? 0
    expect((await call(`/api/access/rules/${ruleId}`, maya, { method: 'DELETE' })).status).toBe(200)
  })

  it('refuses to deliver a draft and logs a legal confirmation', async () => {
    const customer = await prisma.contact.findFirstOrThrow({ where: { name: 'Lin Xiao', company: { name: 'Jiangbei Goods Co.' } } })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01', company: { name: 'Jiangbei Goods Co.' } } })
    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        lines: [{ productId: notebook.id, quantity: 1, unitPrice: 100, discount: 0, taxId: null }],
      }),
    })
    expect(created.status).toBe(201)
    const orderId = (created.body as { id: number }).id
    expect((await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' })).status).toBe(409)
    expect((await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    const log = await call(`/api/chatter?model=sale.order&recordId=${orderId}`, maya)
    expect(log.status).toBe(200)
    expect((log.body as unknown as Array<{ summary: string }>).some((row) => row.summary.includes('draft → sale'))).toBe(true)
  })

  it('posts FIFO and AVCO layers, then walks a multi-step route', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Jiangbei Goods Co.' } })
    const fifo = await prisma.product.create({
      data: {
        name: 'FIFO cloth',
        sku: 'FIFO-1',
        type: 'product',
        kind: 'raw',
        listPrice: 1,
        costPrice: 10,
        costMethod: 'fifo',
        companyId: company.id,
      },
    })
    const shelf = await prisma.stockLocation.findFirstOrThrow({
      where: { companyId: company.id, type: 'internal', name: 'Main stock' },
    })
    expect((await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: fifo.id, locationId: shelf.id, quantityDelta: 2, note: 'First FIFO receipt' }),
    })).status).toBe(201)
    await prisma.product.update({ where: { id: fifo.id }, data: { costPrice: 30 } })
    expect((await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: fifo.id, locationId: shelf.id, quantityDelta: 2, note: 'Second FIFO receipt' }),
    })).status).toBe(201)
    const layers = await prisma.valuationLayer.findMany({ where: { productId: fifo.id, quantity: { gt: 0 } }, orderBy: { id: 'asc' } })
    expect(layers.map((row) => row.unitCost)).toEqual([10, 30])
    expect((await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: fifo.id, locationId: shelf.id, quantityDelta: -2, note: 'FIFO issue' }),
    })).status).toBe(201)
    const after = await prisma.valuationLayer.findMany({ where: { productId: fifo.id, quantity: { gt: 0 } }, orderBy: { id: 'asc' } })
    expect(after.map((row) => row.remaining)).toEqual([0, 2])
    const issued = await prisma.valuationLayer.findFirstOrThrow({ where: { productId: fifo.id, quantity: { lt: 0 } } })
    expect(issued.value).toBe(-20)

    const avco = await prisma.product.create({
      data: {
        name: 'AVCO cloth',
        sku: 'AVCO-1',
        type: 'product',
        kind: 'raw',
        listPrice: 1,
        costPrice: 10,
        costMethod: 'avco',
        purchasable: true,
        companyId: company.id,
      },
    })
    const vendor = await prisma.contact.findFirstOrThrow({ where: { name: 'Suhang Weaving', companyId: company.id } })
    async function receive(unitCost: number) {
      const created = await call('/api/purchases', maya, {
        method: 'POST',
        body: JSON.stringify({ vendorId: vendor.id, lines: [{ productId: avco.id, quantity: 2, unitCost, taxId: null }] }),
      })
      expect(created.status).toBe(201)
      const orderId = (created.body as { id: number }).id
      expect((await call(`/api/purchases/${orderId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
      expect((await call(`/api/purchases/${orderId}/receive`, maya, { method: 'POST', body: JSON.stringify({}) })).status).toBe(200)
    }
    await receive(10)
    await receive(30)
    const averaged = await prisma.product.findUniqueOrThrow({ where: { id: avco.id } })
    expect(averaged.costPrice).toBe(20)
    const avcoLayers = await prisma.valuationLayer.findMany({
      where: { productId: avco.id, quantity: { gt: 0 } },
      orderBy: { id: 'asc' },
    })
    expect(avcoLayers.map((row) => row.unitCost)).toEqual([10, 30])
    expect(avcoLayers[0]?.entryId).toBeTruthy()

    const route = await prisma.stockRoute.findFirstOrThrow({ where: { companyId: company.id, kind: 'outgoing' } })
    const dest = await prisma.stockLocation.findFirstOrThrow({
      where: { companyId: company.id, type: 'internal', name: 'Finished goods' },
    })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01', companyId: company.id } })
    const transfer = await call('/api/transfers', maya, {
      method: 'POST',
      body: JSON.stringify({
        locationFromId: shelf.id,
        locationToId: dest.id,
        routeId: route.id,
        lines: [{ productId: notebook.id, quantity: 1 }],
      }),
    })
    expect(transfer.status).toBe(201)
    const transferId = (transfer.body as { id: number }).id
    expect((await call(`/api/transfers/${transferId}/done`, maya, { method: 'POST' })).status).toBe(409)
    expect((await call(`/api/transfers/${transferId}/ready`, maya, { method: 'POST' })).body).toMatchObject({ state: 'ready', step: 'pick' })
    expect((await call(`/api/transfers/${transferId}/done`, maya, { method: 'POST' })).body).toMatchObject({ state: 'ready', step: 'pack' })
    expect((await call(`/api/transfers/${transferId}/done`, maya, { method: 'POST' })).body).toMatchObject({ state: 'ready', step: 'ship' })
    expect((await call(`/api/transfers/${transferId}/done`, maya, { method: 'POST' })).body).toMatchObject({ state: 'done', step: 'ship' })
  })

  it('reconciles part of a statement line, then the rest, and honours a lock date', async () => {
    const customer = await prisma.contact.findFirstOrThrow({ where: { name: 'Cedar & Co', company: { name: 'Jiangbei Goods Co.' } } })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01', company: { name: 'Jiangbei Goods Co.' } } })
    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        lines: [{ productId: notebook.id, quantity: 1, unitPrice: 100, discount: 0, taxId: null }],
      }),
    })
    const orderId = (created.body as { id: number }).id
    expect((await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    expect((await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' })).status).toBe(200)
    const draft = await call(`/api/invoices/from/sales/${orderId}`, maya, { method: 'POST' })
    expect(draft.status).toBe(201)
    const invoice = draft.body as { id: number; amountTotal: number }
    expect(invoice.amountTotal).toBe(100)
    expect((await call(`/api/invoices/${invoice.id}/post`, maya, { method: 'POST' })).status).toBe(200)

    const imported = await call('/api/bank/statements', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'April match', csv: 'date,label,amount\n2026-04-16,Cedar receipt,100' }),
    })
    expect(imported.status).toBe(201)
    const lineId = (imported.body as { lines: Array<{ id: number }> }).lines[0]?.id ?? 0
    const partial = await call(`/api/bank/lines/${lineId}/reconcile`, maya, {
      method: 'POST',
      body: JSON.stringify({ invoiceId: invoice.id, amount: 40 }),
    })
    expect(partial.status).toBe(200)
    expect((partial.body as { reconciled: number }).reconciled).toBe(40)
    const open = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })
    expect(open.state).toBe('posted')
    expect(open.residual).toBe(60)
    const rest = await call(`/api/bank/lines/${lineId}/reconcile`, maya, {
      method: 'POST',
      body: JSON.stringify({ invoiceId: invoice.id, amount: 60 }),
    })
    expect(rest.status).toBe(200)
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).state).toBe('paid')

    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Jiangbei Goods Co.' } })
    const blocked = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        lines: [{ productId: notebook.id, quantity: 1, unitPrice: 10, discount: 0, taxId: null }],
      }),
    })
    const blockedId = (blocked.body as { id: number }).id
    expect((await call(`/api/orders/${blockedId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    expect((await call(`/api/orders/${blockedId}/deliver`, maya, { method: 'POST' })).status).toBe(200)
    const blockedDraft = await call(`/api/invoices/from/sales/${blockedId}`, maya, { method: 'POST' })
    const blockedInvoice = (blockedDraft.body as { id: number }).id
    expect((await call('/api/accounting/locks', maya, {
      method: 'PUT',
      body: JSON.stringify({ lockDate: '2099-01-01', taxLockDate: null }),
    })).status).toBe(200)
    expect((await call(`/api/invoices/${blockedInvoice}/post`, maya, { method: 'POST' })).status).toBe(409)
    await prisma.company.update({ where: { id: company.id }, data: { lockDate: null } })
  })
})
