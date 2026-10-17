import type { Prisma, PrismaClient } from '@prisma/client'
import { lineAmounts, roundMoney } from '../src/domain/money.ts'
import { postInvoice, invoiceFromPurchase } from '../server/services/accounting.ts'
import { confirmOrder, deliverOrder } from '../server/services/orders.ts'
import { confirmPurchase, receivePurchase } from '../server/services/purchases.ts'
import { applyQuant } from '../server/services/stock.ts'
import { applyReceiptLanded, deliverPartial } from '../server/services/trade.ts'
import { valueDoneMove } from '../server/services/valuation.ts'

const tradeDay = new Date('2026-10-16T00:00:00.000Z')

type Db = PrismaClient | Prisma.TransactionClient

async function postEntry(
  client: Db,
  companyId: number,
  name: string,
  journalCode: string,
  invoiceId: number,
  lines: Array<{ accountId: number; partnerId: number; label: string; debit: number; credit: number }>,
) {
  const debit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0))
  const credit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0))
  if (debit !== credit) throw new Error(`${name} does not balance (${debit} vs ${credit}).`)
  const journal = await client.journal.findFirst({ where: { companyId, code: journalCode } })
  if (!journal) throw new Error(`Journal ${journalCode} is missing.`)
  await client.journalEntry.create({
    data: {
      name,
      journalId: journal.id,
      invoiceId,
      date: tradeDay,
      companyId,
      lines: { create: lines },
    },
  })
}

async function seedCompany(client: PrismaClient, companyId: number) {
  const already = await client.salesOrder.findFirst({ where: { companyId, name: 'SO-TRADE' } })
  if (already) return

  const company = await client.company.findUnique({ where: { id: companyId } })
  const warehouse = await client.warehouse.findFirst({ where: { companyId, isDefault: true } })
  const shelf = warehouse
    ? await client.stockLocation.findFirst({ where: { companyId, warehouseId: warehouse.id, type: 'internal' } })
    : null
  const goods = await client.product.findFirst({ where: { companyId, sku: 'NB-01', type: 'product' } })
    ?? await client.product.findFirst({ where: { companyId, type: 'product', kind: 'finished' }, orderBy: { id: 'asc' } })
  const bought = await client.product.findFirst({ where: { companyId, sku: 'TO-11', purchasable: true } })
    ?? await client.product.findFirst({
      where: { companyId, type: 'product', purchasable: true, ...(goods ? { id: { not: goods.id } } : {}) },
      orderBy: { id: 'asc' },
    })
  const customer = await client.contact.findFirst({
    where: { companyId, isCustomer: true, isCompany: true },
    orderBy: { id: 'asc' },
  })
  let suppliers = await client.contact.findMany({
    where: { companyId, isSupplier: true },
    orderBy: { id: 'asc' },
    take: 2,
  })
  const tax = company ? await client.tax.findFirst({ where: { rate: company.defaultTaxRate } }) : null
  if (!company || !warehouse || !shelf || !goods || !bought || !customer || !tax || suppliers.length === 0) return

  for (const type of ['customer', 'supplier', 'inventory', 'production'] as const) {
    const existing = await client.stockLocation.findFirst({ where: { companyId, type } })
    if (!existing) await client.stockLocation.create({ data: { name: type, type, companyId } })
  }

  const quant = await client.stockQuant.findUnique({
    where: { productId_locationId: { productId: goods.id, locationId: shelf.id } },
  })
  if ((quant?.quantity ?? 0) < 6) return

  if (suppliers.length < 2) {
    const extra = await client.contact.create({
      data: { name: 'Compare Mill', isCompany: true, isSupplier: true, companyId, city: company.city },
    })
    suppliers = [...suppliers, extra]
  }
  const vendor = suppliers[0]
  const other = suppliers[1]
  if (!vendor || !other) return

  const group = await client.customerGroup.create({ data: { companyId, name: 'Wholesale' } })
  await client.contact.update({ where: { id: customer.id }, data: { customerGroupId: group.id } })
  const list = await client.priceList.create({ data: { companyId, name: 'Trade' } })
  const breakPrice = goods.sku === 'NB-01' ? 16 : roundMoney(goods.listPrice * (16 / 18))
  await client.priceListItem.create({
    data: { priceListId: list.id, productId: goods.id, minQty: 12, price: breakPrice },
  })
  await client.pricingRule.create({
    data: {
      companyId,
      name: goods.sku === 'NB-01' ? 'Dozen notebooks' : `Dozen ${goods.sku}`,
      side: 'sales',
      productId: goods.id,
      minQty: 12,
      discountPercent: 5,
      customerGroupId: group.id,
      active: true,
    },
  })
  const capped = await client.contact.findFirst({ where: { companyId, name: 'Credit stall' } })
  if (!capped) {
    await client.contact.create({
      data: { name: 'Credit stall', isCompany: true, isCustomer: true, companyId, creditLimit: 50, city: company.city },
    })
  }

  const rate = tax.rate
  const price = goods.listPrice
  const sale = (quantity: number) => lineAmounts({ quantity, unitPrice: price, discount: 0, taxRate: rate })
  const full = sale(10)
  const billed = sale(3)
  const returnedOrder = sale(2)
  const returnedInvoice = sale(2)
  const credit = sale(1)

  const quote = await client.quotation.create({
    data: {
      companyId,
      name: 'QT-TRADE',
      customerId: customer.id,
      state: 'draft',
      lines: {
        create: [{
          productId: goods.id,
          description: goods.name,
          quantity: 10,
          unitPrice: price,
          discount: 0,
          taxId: tax.id,
        }],
      },
    },
  })
  const order = await client.salesOrder.create({
    data: {
      name: 'SO-TRADE',
      state: 'draft',
      customerId: customer.id,
      warehouseId: warehouse.id,
      companyId,
      dateOrder: tradeDay,
      amountUntaxed: full.subtotal,
      amountTax: full.taxAmount,
      amountTotal: full.total,
      lines: {
        create: [{
          productId: goods.id,
          description: goods.name,
          quantity: 10,
          unitPrice: price,
          discount: 0,
          taxId: tax.id,
          subtotal: full.subtotal,
          taxAmount: full.taxAmount,
        }],
      },
    },
    include: { lines: true },
  })
  const tradeLine = order.lines[0]
  if (!tradeLine) return
  await client.quotation.update({ where: { id: quote.id }, data: { state: 'ordered', salesOrderId: order.id } })
  await confirmOrder(companyId, order.id)
  await deliverPartial(companyId, order.id, [{ lineId: tradeLine.id, quantity: 4 }])

  const accounts = await client.account.findMany({ where: { companyId } })
  const accountId = new Map(accounts.map((row) => [row.code, row.id]))
  const need = (code: string) => {
    const id = accountId.get(code)
    if (!id) throw new Error(`Account ${code} is missing.`)
    return id
  }
  const invoice = await client.invoice.create({
    data: {
      name: 'INV-TRADE',
      moveType: 'out_invoice',
      state: 'posted',
      partnerId: customer.id,
      companyId,
      invoiceDate: tradeDay,
      salesOrderId: order.id,
      amountUntaxed: billed.subtotal,
      amountTax: billed.taxAmount,
      amountTotal: billed.total,
      residual: billed.total,
      buyerName: customer.name,
      fapiaoType: 'electronic',
      fapiaoStatus: 'none',
      lines: {
        create: [{
          description: goods.name,
          quantity: 3,
          unitPrice: price,
          taxRate: rate,
          subtotal: billed.subtotal,
          taxAmount: billed.taxAmount,
          salesOrderLineId: tradeLine.id,
        }],
      },
    },
  })
  await client.salesOrderLine.update({ where: { id: tradeLine.id }, data: { qtyInvoiced: 3 } })
  await postEntry(client, companyId, 'JE-TRADE-S1', 'SAL', invoice.id, [
    { accountId: need('1122'), partnerId: customer.id, label: invoice.name, debit: billed.total, credit: 0 },
    { accountId: need('6001'), partnerId: customer.id, label: invoice.name, debit: 0, credit: billed.subtotal },
    { accountId: need('222101'), partnerId: customer.id, label: invoice.name, debit: 0, credit: billed.taxAmount },
  ])
  await client.chatterMessage.create({
    data: { companyId, model: 'sale.order', recordId: order.id, kind: 'note', summary: `Invoice ${invoice.name} created.` },
  })

  const back = await client.salesOrder.create({
    data: {
      name: 'SO-RETURN',
      state: 'draft',
      customerId: customer.id,
      warehouseId: warehouse.id,
      companyId,
      dateOrder: tradeDay,
      amountUntaxed: returnedOrder.subtotal,
      amountTax: returnedOrder.taxAmount,
      amountTotal: returnedOrder.total,
      lines: {
        create: [{
          productId: goods.id,
          description: goods.name,
          quantity: 2,
          unitPrice: price,
          discount: 0,
          taxId: tax.id,
          subtotal: returnedOrder.subtotal,
          taxAmount: returnedOrder.taxAmount,
        }],
      },
    },
    include: { lines: true },
  })
  const backLine = back.lines[0]
  if (!backLine) return
  await confirmOrder(companyId, back.id)
  await deliverOrder(companyId, back.id)
  const backInvoice = await client.invoice.create({
    data: {
      name: 'INV-TRADE-B',
      moveType: 'out_invoice',
      state: 'posted',
      partnerId: customer.id,
      companyId,
      invoiceDate: tradeDay,
      salesOrderId: back.id,
      amountUntaxed: returnedInvoice.subtotal,
      amountTax: returnedInvoice.taxAmount,
      amountTotal: returnedInvoice.total,
      residual: returnedInvoice.total,
      buyerName: customer.name,
      fapiaoType: 'electronic',
      fapiaoStatus: 'none',
      lines: {
        create: [{
          description: goods.name,
          quantity: 2,
          unitPrice: price,
          taxRate: rate,
          subtotal: returnedInvoice.subtotal,
          taxAmount: returnedInvoice.taxAmount,
          salesOrderLineId: backLine.id,
        }],
      },
    },
  })
  await client.salesOrderLine.update({ where: { id: backLine.id }, data: { qtyInvoiced: 2 } })
  await postEntry(client, companyId, 'JE-TRADE-S2', 'SAL', backInvoice.id, [
    { accountId: need('1122'), partnerId: customer.id, label: backInvoice.name, debit: returnedInvoice.total, credit: 0 },
    { accountId: need('6001'), partnerId: customer.id, label: backInvoice.name, debit: 0, credit: returnedInvoice.subtotal },
    { accountId: need('222101'), partnerId: customer.id, label: backInvoice.name, debit: 0, credit: returnedInvoice.taxAmount },
  ])

  const customerLocation = await client.stockLocation.findFirst({ where: { companyId, type: 'customer' } })
  if (!customerLocation) return
  await client.$transaction(async (tx) => {
    await applyQuant(tx, goods.id, customerLocation.id, -1)
    await applyQuant(tx, goods.id, shelf.id, 1)
    const move = await tx.stockMove.create({
      data: {
        productId: goods.id,
        locationFromId: customerLocation.id,
        locationToId: shelf.id,
        quantity: 1,
        state: 'done',
        reference: 'CN-TRADE',
        orderId: back.id,
        date: tradeDay,
      },
    })
    await valueDoneMove(tx, companyId, move.id)
  })
  const creditNote = await client.invoice.create({
    data: {
      name: 'CN-TRADE',
      moveType: 'out_refund',
      state: 'posted',
      partnerId: customer.id,
      companyId,
      invoiceDate: tradeDay,
      salesOrderId: back.id,
      reversalOfId: backInvoice.id,
      amountUntaxed: credit.subtotal,
      amountTax: credit.taxAmount,
      amountTotal: credit.total,
      residual: credit.total,
      buyerName: customer.name,
      fapiaoType: 'electronic',
      fapiaoStatus: 'none',
      lines: {
        create: [{
          description: goods.name,
          quantity: 1,
          unitPrice: price,
          taxRate: rate,
          subtotal: credit.subtotal,
          taxAmount: credit.taxAmount,
          salesOrderLineId: backLine.id,
        }],
      },
    },
  })
  await postEntry(client, companyId, 'JE-TRADE-CN', 'SAL', creditNote.id, [
    { accountId: need('6001'), partnerId: customer.id, label: creditNote.name, debit: credit.subtotal, credit: 0 },
    { accountId: need('222101'), partnerId: customer.id, label: creditNote.name, debit: credit.taxAmount, credit: 0 },
    { accountId: need('1122'), partnerId: customer.id, label: creditNote.name, debit: 0, credit: credit.total },
  ])
  await client.chatterMessage.create({
    data: {
      companyId,
      model: 'sale.order',
      recordId: back.id,
      kind: 'note',
      summary: `Return ${creditNote.name} posted against ${backInvoice.name}.`,
    },
  })

  const request = await client.materialRequest.create({
    data: {
      companyId,
      name: 'MR-TRADE',
      state: 'ordered',
      lines: { create: [{ productId: bought.id, quantity: 4, qtyOrdered: 4 }] },
    },
  })
  const cost = bought.costPrice
  const dear = roundMoney(cost + 1)
  await client.supplierQuotation.create({
    data: {
      companyId,
      name: 'SQ-TRADE-B',
      vendorId: other.id,
      materialRequestId: request.id,
      state: 'received',
      lines: { create: [{ productId: bought.id, quantity: 4, unitCost: dear }] },
    },
  })
  const buy = lineAmounts({ quantity: 4, unitPrice: cost, discount: 0, taxRate: rate })
  const purchase = await client.purchaseOrder.create({
    data: {
      name: 'PO-TRADE',
      state: 'draft',
      vendorId: vendor.id,
      warehouseId: warehouse.id,
      companyId,
      dateOrder: tradeDay,
      amountUntaxed: buy.subtotal,
      amountTax: buy.taxAmount,
      amountTotal: buy.total,
      lines: {
        create: [{
          productId: bought.id,
          description: bought.name,
          quantity: 4,
          unitCost: cost,
          taxId: tax.id,
          subtotal: buy.subtotal,
          taxAmount: buy.taxAmount,
        }],
      },
    },
  })
  await client.supplierQuotation.create({
    data: {
      companyId,
      name: 'SQ-TRADE-A',
      vendorId: vendor.id,
      materialRequestId: request.id,
      purchaseOrderId: purchase.id,
      state: 'received',
      lines: { create: [{ productId: bought.id, quantity: 4, unitCost: cost }] },
    },
  })
  await confirmPurchase(companyId, purchase.id)
  const moves = await client.stockMove.findMany({ where: { purchaseOrderId: purchase.id, state: 'draft' } })
  await receivePurchase(companyId, purchase.id, {
    lines: moves.map((move) => ({ moveId: move.id, quantity: move.quantity })),
  })
  const bill = await invoiceFromPurchase(companyId, purchase.id)
  await postInvoice(companyId, bill.id)
  const receipt = await client.purchaseReceipt.findFirst({ where: { companyId, purchaseOrderId: purchase.id } })
  if (receipt) await applyReceiptLanded(companyId, receipt.id, 4)
}

export async function seedTrade(client: PrismaClient) {
  const companies = await client.company.findMany({ select: { id: true } })
  for (const company of companies) {
    await seedCompany(client, company.id)
  }
}
