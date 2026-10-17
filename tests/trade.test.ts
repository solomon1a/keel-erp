import { afterAll, beforeAll, describe, expect, it } from 'vitest'
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

describe('selling and buying', () => {
  it('keeps a partial delivery and bill open, and blocks a second cover of a legacy invoice', async () => {
    const order = await prisma.salesOrder.findFirstOrThrow({
      where: { name: 'SO-TRADE' },
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

    const shopOrder = await prisma.salesOrder.findFirstOrThrow({ where: { name: 'SO0002' } })
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