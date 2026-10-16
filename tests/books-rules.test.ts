import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
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

async function balanced(companyId: number) {
  const entries = await prisma.journalEntry.findMany({
    where: { companyId },
    include: { lines: true },
  })
  return entries.every((entry) => {
    const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0)
    const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0)
    return Math.abs(debit - credit) < 0.02
  })
}

async function makeProduct(sku: string, cost: number, tracking: 'none' | 'lot' | 'serial' = 'none') {
  const created = await call('/api/products', maya, {
    method: 'POST',
    body: JSON.stringify({
      name: sku,
      sku,
      type: 'product',
      kind: 'finished',
      tracking,
      listPrice: cost,
      costPrice: cost,
      purchasable: true,
      websitePublished: false,
      description: '',
      active: true,
    }),
  })
  expect(created.status).toBe(201)
  return created.body as { id: number }
}

describe('books rules', () => {
  it('keeps every journal entry balanced, including a charge and a cost centre', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { users: { some: { email: 'maya@northline.example' } } } })
    const customer = await prisma.contact.findFirstOrThrow({ where: { name: 'Lin Xiao', companyId: company.id } })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01', companyId: company.id } })
    const tax = await prisma.tax.findFirstOrThrow()
    const shelf = await prisma.stockLocation.findFirstOrThrow({ where: { companyId: company.id, type: 'internal', name: 'Main stock' } })
    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        lines: [{ productId: notebook.id, quantity: 1, unitPrice: 100, discount: 0, taxId: tax.id }],
      }),
    })
    expect(created.status).toBe(201)
    const orderId = (created.body as { id: number }).id
    expect((await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    expect((await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' })).status).toBe(200)
    const draft = await call(`/api/invoices/from/sales/${orderId}`, maya, { method: 'POST' })
    expect(draft.status).toBe(201)
    const invoiceId = (draft.body as { id: number; name: string }).id
    const charged = await call(`/api/invoices/${invoiceId}/charge`, maya, {
      method: 'POST',
      body: JSON.stringify({ template: 'Handling' }),
    })
    expect(charged.status).toBe(200)
    expect((charged.body as { chargeAmount: number; amountTotal: number }).chargeAmount).toBe(2)
    expect((charged.body as { amountTotal: number }).amountTotal).toBe(115)
    expect((await call(`/api/invoices/${invoiceId}/centre`, maya, { method: 'POST', body: JSON.stringify({ code: 'HQ' }) })).status).toBe(200)
    expect((await call(`/api/invoices/${invoiceId}/post`, maya, { method: 'POST' })).status).toBe(200)
    expect(await balanced(company.id)).toBe(true)
    const centres = await call('/api/reports/centres', maya)
    expect(centres.status).toBe(200)
    expect((centres.body as unknown as Array<{ code: string }>).some((row) => row.code === 'HQ')).toBe(true)

    const aging = await call('/api/reports/aging?asOf=2026-10-16', maya)
    expect(aging.status).toBe(200)
    const lines = (aging.body as { lines: Array<{ name: string; bucket: string }> }).lines
    const posted = await prisma.invoice.findFirstOrThrow({ where: { id: invoiceId } })
    expect(lines.find((row) => row.name === posted.name)?.bucket).toBe('current')
    const other = await call('/api/reports/aging?asOf=2026-10-16', amira)
    const otherNames = (other.body as { lines: Array<{ name: string }> }).lines.map((row) => row.name)
    expect(otherNames).not.toContain(posted.name)

    const years = await call('/api/fiscal-years', maya)
    expect((years.body as unknown as Array<{ name: string }>).some((row) => row.name === 'FY2026')).toBe(true)
    expect((await call('/api/fiscal-years', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'FY2024', startsOn: '2024-01-01', endsOn: '2024-12-31' }),
    })).status).toBe(201)
    expect((await call('/api/fiscal-years/FY2024/close', maya, { method: 'POST' })).status).toBe(200)
    const late = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        lines: [{ productId: notebook.id, quantity: 1, unitPrice: 10, discount: 0, taxId: null }],
      }),
    })
    const lateOrder = (late.body as { id: number }).id
    expect((await call(`/api/orders/${lateOrder}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    expect((await call(`/api/orders/${lateOrder}/deliver`, maya, { method: 'POST' })).status).toBe(200)
    const lateDraft = await call(`/api/invoices/from/sales/${lateOrder}`, maya, { method: 'POST' })
    const lateId = (lateDraft.body as { id: number }).id
    await prisma.invoice.update({ where: { id: lateId }, data: { invoiceDate: new Date('2024-06-01T00:00:00.000Z') } })
    const refused = await call(`/api/invoices/${lateId}/post`, maya, { method: 'POST' })
    expect(refused.status).toBe(409)

    const statement = await call('/api/bank/statements', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Round trip', csv: '2026-10-16,Customer receipt,20' }),
    })
    expect(statement.status).toBe(201)
    const lineId = (statement.body as { lines: Array<{ id: number }> }).lines[0]?.id
    const matched = await call(`/api/bank/lines/${lineId}/reconcile`, maya, {
      method: 'POST',
      body: JSON.stringify({ invoiceId, amount: 20 }),
    })
    expect(matched.status).toBe(200)
    const open = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    expect(open.residual).toBe(95)
    const released = await call(`/api/bank/lines/${lineId}/unreconcile`, maya, {
      method: 'POST',
      body: JSON.stringify({ invoiceId }),
    })
    expect(released.status).toBe(200)
    expect((released.body as { reconciled: number; matches: unknown[] }).reconciled).toBe(0)
    expect((released.body as { matches: unknown[] }).matches).toHaveLength(0)
    const restored = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    expect(restored.residual).toBe(115)
    expect(restored.state).toBe('posted')
    expect(await balanced(company.id)).toBe(true)
    expect(shelf.id).toBeGreaterThan(0)
  })

  it('values mixed receipts and issues, a count, and a landed cost', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { users: { some: { email: 'maya@northline.example' } } } })
    const shelf = await prisma.stockLocation.findFirstOrThrow({ where: { companyId: company.id, type: 'internal', name: 'Main stock' } })
    const fifo = await makeProduct('FIFO-BOX', 4)
    expect((await call('/api/stock/cost-method', maya, {
      method: 'PATCH',
      body: JSON.stringify({ productId: fifo.id, method: 'fifo' }),
    })).status).toBe(200)
    const receive = (productId: number, quantity: number, lotName?: string) => call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({ productId, locationId: shelf.id, quantityDelta: quantity, note: 'Receipt', lotName }),
    })
    expect((await receive(fifo.id, 10)).status).toBe(201)
    await prisma.product.update({ where: { id: fifo.id }, data: { costPrice: 6 } })
    expect((await receive(fifo.id, 10)).status).toBe(201)
    expect((await receive(fifo.id, -15)).status).toBe(201)
    const layers = await prisma.valuationLayer.findMany({ where: { companyId: company.id, productId: fifo.id }, orderBy: { id: 'asc' } })
    const issue = layers.find((layer) => layer.quantity < 0)
    expect(issue?.value).toBe(-70)
    expect(layers.filter((layer) => layer.remaining > 0).reduce((sum, layer) => sum + layer.remaining, 0)).toBe(5)
    const ledger = await call(`/api/stock/ledger?productId=${fifo.id}`, maya)
    expect(ledger.status).toBe(200)
    const rows = ledger.body as unknown as Array<{ balanceQty: number; balanceValue: number }>
    expect(rows[rows.length - 1]).toMatchObject({ balanceQty: 5, balanceValue: 30 })

    const average = await makeProduct('AVCO-BOX', 4)
    expect((await receive(average.id, 10)).status).toBe(201)
    const vendor = await prisma.contact.findFirstOrThrow({ where: { name: 'Suhang Weaving', companyId: company.id } })
    const tax = await prisma.tax.findFirstOrThrow()
    const bought = await call('/api/purchases', maya, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: vendor.id,
        lines: [{ productId: average.id, quantity: 10, unitCost: 6, taxId: tax.id }],
      }),
    })
    expect(bought.status).toBe(201)
    const purchaseId = (bought.body as { id: number }).id
    expect((await call(`/api/purchases/${purchaseId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    expect((await call(`/api/purchases/${purchaseId}/receive`, maya, { method: 'POST', body: JSON.stringify({}) })).status).toBe(200)
    const held = await prisma.stockQuant.findFirstOrThrow({ where: { productId: average.id, quantity: { gt: 0 } }, orderBy: { quantity: 'desc' } })
    expect((await call('/api/stock/adjust', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: average.id, locationId: held.locationId, quantityDelta: -4, note: 'Issue' }),
    })).status).toBe(201)
    const avcoLayers = await prisma.valuationLayer.findMany({ where: { productId: average.id }, orderBy: { id: 'asc' } })
    expect(avcoLayers.find((layer) => layer.quantity < 0)?.value).toBe(-20)
    const priced = await prisma.product.findUniqueOrThrow({ where: { id: average.id } })
    expect(priced.costPrice).toBe(5)

    const landed = await landedProduct(shelf.id)
    expect(landed.unitCost).toBe(5)
    expect(landed.value).toBe(50)

    const counted = await makeProduct('COUNT-BOX', 2)
    expect((await receive(counted.id, 10)).status).toBe(201)
    const count = await call('/api/stock/count', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: counted.id, locationId: shelf.id, counted: 7 }),
    })
    expect(count.status).toBe(200)
    expect((count.body as { onHand: number; delta: number }).onHand).toBe(7)
    expect((count.body as { delta: number }).delta).toBe(-3)

    const serial = await makeProduct('SER-BOX', 9, 'serial')
    expect((await receive(serial.id, 1, 'SN-1')).status).toBe(201)
    expect((await receive(serial.id, -1, 'SN-1')).status).toBe(201)
    const again = await receive(serial.id, -1, 'SN-1')
    expect(again.status).toBe(409)
    expect(await balanced(company.id)).toBe(true)
  })
})

async function landedProduct(locationId: number) {
  const product = await makeProduct('LAND-BOX', 4)
  const receipt = await call('/api/stock/adjust', maya, {
    method: 'POST',
    body: JSON.stringify({ productId: product.id, locationId, quantityDelta: 10, note: 'Receipt' }),
  })
  expect(receipt.status).toBe(201)
  const landed = await call('/api/stock/landed-cost', maya, {
    method: 'POST',
    body: JSON.stringify({ productId: product.id, amount: 10 }),
  })
  expect(landed.status).toBe(200)
  return landed.body as { unitCost: number; value: number }
}
