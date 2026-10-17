import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { removeStrayCompanies } from '../prisma/company-cleanup.ts'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { seedTrade } from '../prisma/seed-trade.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function adjustQuant(productId: number, locationId: number, delta: number) {
  const existing = await prisma.stockQuant.findUnique({
    where: { productId_locationId: { productId, locationId } },
  })
  const next = Math.round(((existing?.quantity ?? 0) + delta) * 1000) / 1000
  if (existing) await prisma.stockQuant.update({ where: { id: existing.id }, data: { quantity: next } })
  else if (next !== 0) await prisma.stockQuant.create({ data: { productId, locationId, quantity: next } })
}

async function stripJiangbeiTrade(companyId: number) {
  const orders = await prisma.salesOrder.findMany({
    where: { companyId, name: { in: ['SO-TRADE', 'SO-RETURN'] } },
    select: { id: true },
  })
  const purchases = await prisma.purchaseOrder.findMany({
    where: { companyId, name: 'PO-TRADE' },
    select: { id: true },
  })
  const orderIds = orders.map((row) => row.id)
  const purchaseIds = purchases.map((row) => row.id)
  const moveWhere = [
    ...(orderIds.length > 0 ? [{ orderId: { in: orderIds } }] : []),
    ...(purchaseIds.length > 0 ? [{ purchaseOrderId: { in: purchaseIds } }] : []),
    { reference: 'CN-TRADE', product: { companyId } },
  ]
  const moves = await prisma.stockMove.findMany({ where: { OR: moveWhere } })
  for (const move of moves) {
    if (move.state !== 'done') continue
    await adjustQuant(move.productId, move.locationFromId, move.quantity)
    await adjustQuant(move.productId, move.locationToId, -move.quantity)
  }
  const moveIds = moves.map((row) => row.id)
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      OR: [
        { name: { in: ['INV-TRADE', 'INV-TRADE-B', 'CN-TRADE'] } },
        ...(orderIds.length > 0 ? [{ salesOrderId: { in: orderIds } }] : []),
        ...(purchaseIds.length > 0 ? [{ purchaseOrderId: { in: purchaseIds } }] : []),
      ],
    },
    select: { id: true },
  })
  const invoiceIds = invoices.map((row) => row.id)
  const landed = await prisma.journalItem.findMany({
    where: { label: 'Landed TO-11', entry: { companyId } },
    select: { entryId: true },
  })
  const layers = moveIds.length > 0
    ? await prisma.valuationLayer.findMany({ where: { moveId: { in: moveIds } }, select: { entryId: true } })
    : []
  const named = await prisma.journalEntry.findMany({
    where: { companyId, name: { in: ['JE-TRADE-S1', 'JE-TRADE-S2', 'JE-TRADE-CN'] } },
    select: { id: true },
  })
  const linked = invoiceIds.length > 0
    ? await prisma.journalEntry.findMany({ where: { invoiceId: { in: invoiceIds } }, select: { id: true } })
    : []
  const entryIds = [...new Set([
    ...layers.flatMap((row) => row.entryId == null ? [] : [row.entryId]),
    ...landed.map((row) => row.entryId),
    ...named.map((row) => row.id),
    ...linked.map((row) => row.id),
  ])]
  if (moveIds.length > 0 || entryIds.length > 0) {
    await prisma.valuationLayer.deleteMany({
      where: {
        OR: [
          ...(moveIds.length > 0 ? [{ moveId: { in: moveIds } }] : []),
          ...(entryIds.length > 0 ? [{ entryId: { in: entryIds } }] : []),
        ],
      },
    })
  }
  if (moveIds.length > 0) await prisma.stockLedger.deleteMany({ where: { moveId: { in: moveIds } } })
  if (entryIds.length > 0) await prisma.journalEntry.deleteMany({ where: { id: { in: entryIds } } })
  if (moveIds.length > 0) await prisma.stockMove.deleteMany({ where: { id: { in: moveIds } } })
  if (orderIds.length > 0) await prisma.deliveryNote.deleteMany({ where: { companyId, salesOrderId: { in: orderIds } } })
  if (purchaseIds.length > 0) await prisma.purchaseReceipt.deleteMany({ where: { companyId, purchaseOrderId: { in: purchaseIds } } })
  if (invoiceIds.length > 0) {
    await prisma.invoice.updateMany({ where: { id: { in: invoiceIds } }, data: { reversalOfId: null } })
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } })
  }
  await prisma.quotation.deleteMany({ where: { companyId, name: 'QT-TRADE' } })
  await prisma.supplierQuotation.deleteMany({ where: { companyId, name: { in: ['SQ-TRADE-A', 'SQ-TRADE-B'] } } })
  await prisma.materialRequest.deleteMany({ where: { companyId, name: 'MR-TRADE' } })
  if (orderIds.length > 0) await prisma.salesOrder.deleteMany({ where: { id: { in: orderIds } } })
  if (purchaseIds.length > 0) await prisma.purchaseOrder.deleteMany({ where: { id: { in: purchaseIds } } })
  await prisma.product.updateMany({ where: { companyId, sku: 'NB-01' }, data: { costPrice: 6 } })
  await prisma.product.updateMany({ where: { companyId, sku: 'TO-11' }, data: { costPrice: 9 } })
}

describe('selling and buying', () => {
  it('posts the trade documents once and leaves a self-signup company alone', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Jiangbei Goods Co.' } })
    const journals = await prisma.journalEntry.count({ where: { companyId: company.id } })
    const invoices = await prisma.invoice.count({ where: { companyId: company.id } })
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.body).toMatchObject({ profit: jiangbeiBooks.profit })
    await seedTrade(prisma)
    expect(await prisma.journalEntry.count({ where: { companyId: company.id } })).toBe(journals)
    expect(await prisma.invoice.count({ where: { companyId: company.id } })).toBe(invoices)
    expect(await prisma.salesOrder.count({ where: { companyId: company.id, name: 'SO-TRADE' } })).toBe(1)
    const amira = await signIn('amira@harbourline.example', demoPasswords.amira)
    const jordan = await signIn('jordan@hudsonyard.example', demoPasswords.jordan)
    expect((await call('/api/desk', amira)).body).toMatchObject({ profit: -9188 })
    expect((await call('/api/desk', jordan)).body).toMatchObject({ profit: -15242 })

    const signup = await prisma.company.create({
      data: { name: 'Northwind Signup', city: 'Seattle', currency: 'USD', defaultTaxRate: 13 },
    })
    const owner = await prisma.user.create({
      data: { name: 'Northwind Owner', email: 'owner@northwind.example', passwordHash: 'not-used', role: 'admin', companyId: signup.id },
    })
    const warehouse = await prisma.warehouse.create({
      data: { name: 'Northwind stock', code: 'NW', isDefault: true, companyId: signup.id },
    })
    const shelf = await prisma.stockLocation.create({
      data: { name: 'Main stock', type: 'internal', isDefault: true, warehouseId: warehouse.id, companyId: signup.id },
    })
    await prisma.stockLocation.createMany({
      data: [
        { name: 'Customers', type: 'customer', companyId: signup.id },
        { name: 'Vendors', type: 'supplier', companyId: signup.id },
        { name: 'Adjustments', type: 'inventory', companyId: signup.id },
        { name: 'Production', type: 'production', companyId: signup.id },
      ],
    })
    const product = await prisma.product.create({
      data: { name: 'Signup notebook', sku: 'NW-01', type: 'product', kind: 'finished', listPrice: 18, costPrice: 6, companyId: signup.id },
    })
    await prisma.stockQuant.create({ data: { productId: product.id, locationId: shelf.id, quantity: 20 } })
    const buyer = await prisma.contact.create({
      data: { name: 'Signup Buyer', isCompany: true, isCustomer: true, companyId: signup.id },
    })
    await prisma.contact.create({ data: { name: 'Signup Mill', isCompany: true, isSupplier: true, companyId: signup.id } })
    await prisma.fiscalYear.create({
      data: { companyId: signup.id, name: 'FY2026', startsOn: new Date('2026-01-01T00:00:00.000Z'), endsOn: new Date('2026-12-31T00:00:00.000Z') },
    })
    const group = await prisma.customerGroup.create({ data: { companyId: signup.id, name: 'Wholesale' } })
    await prisma.priceList.create({ data: { companyId: signup.id, name: 'Trade' } })
    await prisma.pricingRule.create({ data: { companyId: signup.id, name: 'Dozen notebooks', side: 'sales', customerGroupId: group.id } })
    await prisma.quotation.create({
      data: {
        companyId: signup.id,
        name: 'QT-OWN',
        customerId: buyer.id,
        state: 'draft',
        lines: { create: [{ productId: product.id, description: product.name, quantity: 1, unitPrice: 18 }] },
      },
    })
    await prisma.chatterMessage.create({
      data: { companyId: signup.id, model: 'sale.order', recordId: 1, kind: 'note', summary: 'Left by the owner.' },
    })
    await seedTrade(prisma)
    expect(await prisma.salesOrder.count({ where: { companyId: signup.id, name: 'SO-TRADE' } })).toBe(0)
    expect(await prisma.salesOrder.count({ where: { companyId: company.id, name: 'SO-TRADE' } })).toBe(1)
    await prisma.session.deleteMany({ where: { userId: owner.id } })
    await prisma.user.delete({ where: { id: owner.id } })
    await removeStrayCompanies(prisma)
    expect(await prisma.company.findUnique({ where: { id: signup.id } })).toBeNull()
    expect(await prisma.company.count()).toBe(3)
  })

  it('applies the trade documents onto a populated company whose default shelf is empty', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Jiangbei Goods Co.' } })
    await stripJiangbeiTrade(company.id)
    expect(await prisma.salesOrder.count({ where: { companyId: company.id, name: 'SO-TRADE' } })).toBe(0)
    const stripped = await call('/api/reports/pnl', maya)
    expect(stripped.body).toMatchObject({ profit: jiangbeiBooks.profit - 42 })

    const notebook = await prisma.product.findFirstOrThrow({ where: { companyId: company.id, sku: 'NB-01' } })
    const tote = await prisma.product.findFirstOrThrow({ where: { companyId: company.id, sku: 'TO-11' } })
    const main = await prisma.stockLocation.findFirstOrThrow({ where: { companyId: company.id, name: 'Main stock' } })
    const finished = await prisma.stockLocation.findFirstOrThrow({ where: { companyId: company.id, name: 'Finished goods' } })
    const mainNotebook = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: notebook.id, locationId: main.id } },
    })
    const mainTote = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: tote.id, locationId: main.id } },
    })
    expect(mainNotebook.quantity).toBe(40)
    expect(mainTote.quantity).toBe(2)
    expect(tote.costPrice).toBe(9)
    await prisma.stockQuant.update({ where: { id: mainNotebook.id }, data: { quantity: 0 } })
    await prisma.stockQuant.upsert({
      where: { productId_locationId: { productId: notebook.id, locationId: finished.id } },
      create: { productId: notebook.id, locationId: finished.id, quantity: 40 },
      update: { quantity: { increment: 40 } },
    })

    await seedTrade(prisma)
    const order = await prisma.salesOrder.findFirstOrThrow({
      where: { companyId: company.id, name: 'SO-TRADE' },
      include: { lines: true },
    })
    expect(order.state).toBe('sale')
    expect(order.lines[0]).toMatchObject({ quantity: 10, qtyDelivered: 4, qtyInvoiced: 3 })
    expect(await prisma.salesOrder.count({ where: { companyId: company.id, name: 'SO-TRADE' } })).toBe(1)
    const restored = await call('/api/reports/pnl', maya)
    expect(restored.body).toMatchObject({ profit: jiangbeiBooks.profit })
    const afterMain = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: notebook.id, locationId: main.id } },
    })
    const afterTote = await prisma.stockQuant.findUniqueOrThrow({
      where: { productId_locationId: { productId: tote.id, locationId: main.id } },
    })
    expect(afterMain.quantity).toBe(5)
    expect(afterTote.quantity).toBe(6)
    expect((await prisma.product.findUniqueOrThrow({ where: { id: tote.id } })).costPrice).toBe(10)
    const journals = await prisma.journalEntry.count({ where: { companyId: company.id } })
    await seedTrade(prisma)
    expect(await prisma.journalEntry.count({ where: { companyId: company.id } })).toBe(journals)
    expect((await call('/api/reports/pnl', maya)).body).toMatchObject({ profit: jiangbeiBooks.profit })
    expect(await prisma.salesOrder.count({ where: { name: 'SO-TRADE' } })).toBe(3)
  })

  it('keeps a partial delivery and bill open, and blocks a second cover of a legacy invoice', async () => {
    const order = await prisma.salesOrder.findFirstOrThrow({
      where: { name: 'SO-TRADE', company: { name: 'Jiangbei Goods Co.' } },
      include: { lines: true },
    })
    expect(order.state).toBe('sale')
    expect(order.lines[0]).toMatchObject({ quantity: 10, qtyDelivered: 4, qtyInvoiced: 3 })
    const links = await call(`/api/orders/${order.id}/links`, maya)
    expect(links.status).toBe(200)
    expect(links.body).toMatchObject({ fulfillment: 'to_deliver_and_bill' })
    const body = links.body as {
      deliveries: Array<{ name: string }>
      invoices: Array<{ name: string }>
      quotations: Array<{ name: string }>
    }
    expect(body.deliveries.length).toBeGreaterThan(0)
    expect(body.invoices.some((row) => row.name === 'INV-TRADE')).toBe(true)
    expect(body.quotations.some((row) => row.name === 'QT-TRADE')).toBe(true)

    const shopOrder = await prisma.salesOrder.findFirstOrThrow({
      where: { name: 'SO0002', company: { name: 'Jiangbei Goods Co.' } },
    })
    const again = await call(`/api/invoices/from/sales/${shopOrder.id}`, maya, { method: 'POST' })
    expect(again.status).toBe(409)
  })

  it('bills and delivers the rest, then refuses another invoice', async () => {
    const customer = await prisma.contact.findFirstOrThrow({ where: { name: 'Cedar & Co', isCustomer: true } })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01' } })
    const tax = await prisma.tax.findFirstOrThrow({ where: { name: 'China VAT 13%' } })
    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: customer.id,
        lines: [{ productId: notebook.id, quantity: 4, unitPrice: 18, discount: 0, taxId: tax.id }],
      }),
    })
    expect(created.status).toBe(201)
    const orderId = (created.body as { id: number }).id
    expect((await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' })).status).toBe(200)
    const line = await prisma.salesOrderLine.findFirstOrThrow({ where: { orderId } })
    const delivered = await call(`/api/orders/${orderId}/deliver-partial`, maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ lineId: line.id, quantity: 1 }] }),
    })
    expect(delivered.status).toBe(200)
    const billed = await call(`/api/invoices/from/sales/${orderId}`, maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ lineId: line.id, quantity: 1 }] }),
    })
    expect(billed.status).toBe(201)
    const mid = await call(`/api/orders/${orderId}/links`, maya)
    expect((mid.body as { fulfillment: string }).fulfillment).toBe('to_deliver_and_bill')
    expect((await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' })).status).toBe(200)
    expect((await call(`/api/invoices/from/sales/${orderId}`, maya, { method: 'POST' })).status).toBe(201)
    const done = await call(`/api/invoices/from/sales/${orderId}`, maya, { method: 'POST' })
    expect(done.status).toBe(409)
    const links = await call(`/api/orders/${orderId}/links`, maya)
    expect((links.body as { fulfillment: string }).fulfillment).toBe('completed')
  })

  it('resolves the dozen rule and refuses a customer over the credit limit', async () => {
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01' } })
    const customer = await prisma.contact.findFirstOrThrow({ where: { name: 'Cedar & Co', isCustomer: true } })
    const price = await call('/api/pricing/resolve', maya, {
      method: 'POST',
      body: JSON.stringify({ side: 'sales', productId: notebook.id, quantity: 12, customerId: customer.id }),
    })
    expect(price.status).toBe(200)
    expect(price.body).toMatchObject({ unitPrice: 16, discount: 5, ruleName: 'Dozen notebooks' })

    const stall = await prisma.contact.findFirstOrThrow({ where: { name: 'Credit stall' } })
    const tax = await prisma.tax.findFirstOrThrow({ where: { name: 'China VAT 13%' } })
    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: stall.id,
        lines: [{ productId: notebook.id, quantity: 4, unitPrice: 18, discount: 0, taxId: tax.id }],
      }),
    })
    const orderId = (created.body as { id: number }).id
    const blocked = await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' })
    expect(blocked.status).toBe(409)
  })

  it('posts a return that puts stock back and reverses the invoice', async () => {
    const company = await prisma.company.findFirstOrThrow({ where: { name: 'Jiangbei Goods Co.' } })
    const before = await prisma.stockQuant.findFirstOrThrow({
      where: { product: { sku: 'NB-01' }, location: { name: 'Main stock', companyId: company.id } },
    })
    const invoice = await prisma.invoice.findFirstOrThrow({
      where: { name: 'INV-TRADE-B', companyId: company.id },
      include: { lines: true },
    })
    const note = await prisma.invoice.findFirstOrThrow({ where: { name: 'CN-TRADE', companyId: company.id } })
    expect(note).toMatchObject({ moveType: 'out_refund', state: 'posted', reversalOfId: invoice.id })
    const lineId = invoice.lines[0]?.id
    const tooMuch = await call(`/api/invoices/${invoice.id}/return`, maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ lineId, quantity: 2 }] }),
    })
    expect(tooMuch.status).toBe(400)
    const returned = await call(`/api/invoices/${invoice.id}/return`, maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ lineId, quantity: 1 }] }),
    })
    expect(returned.status).toBe(201)
    expect((returned.body as { moveType: string; state: string }).state).toBe('posted')
    const after = await prisma.stockQuant.findFirstOrThrow({
      where: { product: { sku: 'NB-01' }, location: { name: 'Main stock', companyId: company.id } },
    })
    expect(after.quantity).toBe(before.quantity + 1)
  })

  it('compares quotes, receives part of a purchase, and refuses a bill past the receipt', async () => {
    const tote = await prisma.product.findFirstOrThrow({ where: { sku: 'TO-11' } })
    const vendors = await prisma.contact.findMany({ where: { isSupplier: true, company: { name: 'Jiangbei Goods Co.' } }, take: 2 })
    const first = vendors[0]
    const second = vendors[1]
    expect(first && second).toBeTruthy()
    const request = await call('/api/material-requests', maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ productId: tote.id, quantity: 4 }] }),
    })
    expect(request.status).toBe(201)
    const requestId = (request.body as { id: number }).id
    const dear = await call('/api/supplier-quotes', maya, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: second!.id,
        materialRequestId: requestId,
        lines: [{ productId: tote.id, quantity: 4, unitCost: 12 }],
      }),
    })
    const cheap = await call('/api/supplier-quotes', maya, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: first!.id,
        materialRequestId: requestId,
        lines: [{ productId: tote.id, quantity: 4, unitCost: 9 }],
      }),
    })
    expect(cheap.status).toBe(201)
    const comparison = await call(`/api/material-requests/${requestId}/comparison`, maya)
    const offers = (comparison.body as { rows: Array<{ offers: Array<{ unitCost: number }> }> }).rows[0]?.offers ?? []
    expect(offers[0]?.unitCost).toBe(9)
    expect(offers[1]?.unitCost).toBe(12)
    const ordered = await call(`/api/supplier-quotes/${(cheap.body as { id: number }).id}/order`, maya, { method: 'POST' })
    expect(ordered.status).toBe(201)
    const purchase = ordered.body as { id: number; moves: Array<{ id: number }> }
    const received = await call(`/api/purchases/${purchase.id}/receive`, maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ moveId: purchase.moves[0]!.id, quantity: 2 }] }),
    })
    expect(received.status).toBe(200)
    const line = await prisma.purchaseOrderLine.findFirstOrThrow({ where: { orderId: purchase.id } })
    const over = await call(`/api/invoices/from/purchase/${purchase.id}`, maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ lineId: line.id, quantity: 4 }] }),
    })
    expect(over.status).toBe(409)
    const bill = await call(`/api/invoices/from/purchase/${purchase.id}`, maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ lineId: line.id, quantity: 2 }] }),
    })
    expect(bill.status).toBe(201)
    const posted = await call(`/api/invoices/${(bill.body as { id: number }).id}/post`, maya, { method: 'POST' })
    expect(posted.status).toBe(200)
    const debit = await call(`/api/invoices/${(bill.body as { id: number }).id}/return`, maya, {
      method: 'POST',
      body: JSON.stringify({
        lines: [{ lineId: (await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: (bill.body as { id: number }).id } })).id, quantity: 1 }],
      }),
    })
    expect(debit.status).toBe(201)
    expect((debit.body as { moveType: string; state: string }).moveType).toBe('in_refund')
    expect((debit.body as { state: string }).state).toBe('posted')
    expect(dear.status).toBe(201)
  })
})