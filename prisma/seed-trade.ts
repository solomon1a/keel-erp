import type { Prisma, PrismaClient } from '@prisma/client'
import { lineAmounts, roundMoney } from '../src/domain/money.ts'
import { postInvoice, invoiceFromPurchase } from '../server/services/accounting.ts'
import { confirmOrder, deliverOrder } from '../server/services/orders.ts'
import { confirmPurchase, receivePurchase } from '../server/services/purchases.ts'
import { transactionOptions } from '../server/db.ts'
import { applyQuant, roundQty } from '../server/services/stock.ts'
import { applyReceiptLanded, deliverPartial } from '../server/services/trade.ts'
import { valueDoneMove } from '../server/services/valuation.ts'
import { demoAdminEmails } from './demo-companies.ts'

const tradeDay = new Date('2026-10-16T00:00:00.000Z')
const saleQty = 10
const deliverQty = 4
const invoiceQty = 3
const returnQty = 2
const creditQty = 1
const buyQty = 4

type Db = PrismaClient | Prisma.TransactionClient

async function postEntry(
  client: Db,
  companyId: number,
  name: string,
  journalCode: string,
  invoiceId: number,
  lines: Array<{ accountId: number; partnerId: number; label: string; debit: number; credit: number }>,
) {
  const existing = await client.journalEntry.findUnique({ where: { companyId_name: { companyId, name } } })
  if (existing) return
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

async function stockShelf(client: PrismaClient, companyId: number, warehouseId: number) {
  const locations = await client.stockLocation.findMany({
    where: { companyId, warehouseId, type: 'internal' },
    orderBy: { id: 'asc' },
  })
  return locations.find((row) => row.isDefault) ?? locations[0] ?? null
}

async function ensureOnHand(
  client: PrismaClient,
  companyName: string,
  product: { id: number; sku: string },
  location: { id: number; name: string },
  minimum: number,
) {
  const quant = await client.stockQuant.findUnique({
    where: { productId_locationId: { productId: product.id, locationId: location.id } },
  })
  const have = quant?.quantity ?? 0
  if (have + 0.0001 >= minimum) return
  if (quant) {
    await client.stockQuant.update({ where: { id: quant.id }, data: { quantity: minimum } })
  } else {
    await client.stockQuant.create({ data: { productId: product.id, locationId: location.id, quantity: minimum } })
  }
  console.error(
    `seed-trade: ${companyName}: ${product.sku} on ${location.name} had ${have} on hand, short of ${minimum}. The shelf count was raised without a valuation entry so the demo can post at the existing cost.`,
  )
}

async function tradeApplied(client: PrismaClient, companyId: number) {
  const [order, back, credit, purchase] = await Promise.all([
    client.salesOrder.findFirst({ where: { companyId, name: 'SO-TRADE' }, include: { lines: true } }),
    client.salesOrder.findFirst({ where: { companyId, name: 'SO-RETURN' }, include: { lines: true } }),
    client.invoice.findFirst({ where: { companyId, name: 'CN-TRADE', state: 'posted' } }),
    client.purchaseOrder.findFirst({ where: { companyId, name: 'PO-TRADE' }, include: { lines: true } }),
  ])
  if (!order || !back || !credit || !purchase) return false
  const sold = order.lines[0]
  const returned = back.lines[0]
  const bought = purchase.lines[0]
  if (!sold || !returned || !bought) return false
  if (sold.qtyDelivered + 0.0001 < deliverQty || sold.qtyInvoiced + 0.0001 < invoiceQty) return false
  if (back.state !== 'done' || returned.qtyInvoiced + 0.0001 < returnQty) return false
  if (bought.qtyReceived + 0.0001 < buyQty || bought.qtyBilled + 0.0001 < buyQty) return false
  const [bill, receipt, returnedStock] = await Promise.all([
    client.invoice.findFirst({
      where: { companyId, purchaseOrderId: purchase.id, moveType: 'in_invoice', state: { in: ['posted', 'paid'] } },
    }),
    client.purchaseReceipt.findFirst({ where: { companyId, purchaseOrderId: purchase.id } }),
    client.stockMove.findFirst({ where: { reference: 'CN-TRADE', orderId: back.id, state: 'done' } }),
  ])
  return Boolean(bill && receipt && receipt.landedCost + 0.0001 >= 4 && returnedStock)
}

async function seedCompany(client: PrismaClient, companyId: number, companyName: string) {
  if (await tradeApplied(client, companyId)) {
    console.log(`seed-trade: ${companyName} already has the selling and buying documents.`)
    return
  }

  const [company, warehouse, goodsFirst, boughtFirst, customer, suppliersFirst] = await Promise.all([
    client.company.findUnique({ where: { id: companyId } }),
    client.warehouse.findFirst({ where: { companyId, isDefault: true }, orderBy: { id: 'asc' } }),
    client.product.findFirst({ where: { companyId, sku: 'NB-01', type: 'product' } }),
    client.product.findFirst({ where: { companyId, sku: 'TO-11', purchasable: true } }),
    client.contact.findFirst({ where: { companyId, isCustomer: true, isCompany: true }, orderBy: { id: 'asc' } }),
    client.contact.findMany({ where: { companyId, isSupplier: true }, orderBy: { id: 'asc' }, take: 2 }),
  ])
  const shelf = warehouse ? await stockShelf(client, companyId, warehouse.id) : null
  const goods = goodsFirst
    ?? await client.product.findFirst({ where: { companyId, type: 'product', kind: 'finished' }, orderBy: { id: 'asc' } })
  const bought = boughtFirst
    ?? await client.product.findFirst({
      where: { companyId, type: 'product', purchasable: true, ...(goods ? { id: { not: goods.id } } : {}) },
      orderBy: { id: 'asc' },
    })
  let suppliers = suppliersFirst
  const tax = company ? await client.tax.findFirst({ where: { rate: company.defaultTaxRate }, orderBy: { id: 'asc' } }) : null
  if (!company || !warehouse || !shelf || !goods || !bought || !customer || !tax || suppliers.length === 0) {
    const missing = [
      !company ? 'company' : null,
      !warehouse ? 'default warehouse' : null,
      !shelf ? 'default stock location' : null,
      !goods ? 'finished goods' : null,
      !bought ? 'purchasable goods' : null,
      !customer ? 'company customer' : null,
      !tax ? `tax at ${company?.defaultTaxRate ?? 'the company'}%` : null,
      suppliers.length === 0 ? 'supplier' : null,
    ].filter((item) => item !== null)
    throw new Error(`${companyName} is missing ${missing.join(', ')}. Trade documents were not posted.`)
  }

  const virtualTypes = ['customer', 'supplier', 'inventory', 'production'] as const
  const virtuals = await client.stockLocation.findMany({
    where: { companyId, type: { in: [...virtualTypes] } },
    select: { type: true },
  })
  const present = new Set(virtuals.map((row) => row.type))
  const missingVirtuals = virtualTypes.filter((type) => !present.has(type))
  if (missingVirtuals.length > 0) {
    await client.stockLocation.createMany({
      data: missingVirtuals.map((type) => ({ name: type, type, companyId })),
    })
    for (const type of missingVirtuals) {
      console.error(`seed-trade: ${companyName} had no ${type} stock location. One was created so the demo documents can post.`)
    }
  }

  if (suppliers.length < 2) {
    const named = await client.contact.findFirst({ where: { companyId, name: 'Compare Mill' } })
    const extra = named ?? await client.contact.create({
      data: { name: 'Compare Mill', isCompany: true, isSupplier: true, companyId, city: company.city },
    })
    if (!suppliers.some((row) => row.id === extra.id)) suppliers = [...suppliers, extra]
  }
  const vendor = suppliers[0]
  const other = suppliers[1]
  if (!vendor || !other) throw new Error(`${companyName} needs two suppliers for the quote comparison.`)

  const group = await client.customerGroup.upsert({
    where: { companyId_name: { companyId, name: 'Wholesale' } },
    update: {},
    create: { companyId, name: 'Wholesale' },
  })
  if (customer.customerGroupId == null) {
    await client.contact.update({ where: { id: customer.id }, data: { customerGroupId: group.id } })
  }
  const list = await client.priceList.upsert({
    where: { companyId_name: { companyId, name: 'Trade' } },
    update: {},
    create: { companyId, name: 'Trade' },
  })
  const breakPrice = goods.sku === 'NB-01' ? 16 : roundMoney(goods.listPrice * (16 / 18))
  await client.priceListItem.upsert({
    where: { priceListId_productId_minQty: { priceListId: list.id, productId: goods.id, minQty: 12 } },
    update: {},
    create: { priceListId: list.id, productId: goods.id, minQty: 12, price: breakPrice },
  })
  const ruleName = goods.sku === 'NB-01' ? 'Dozen notebooks' : `Dozen ${goods.sku}`
  await client.pricingRule.upsert({
    where: { companyId_name: { companyId, name: ruleName } },
    update: {},
    create: {
      companyId,
      name: ruleName,
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
  const full = sale(saleQty)
  const billed = sale(invoiceQty)
  const returnedOrder = sale(returnQty)
  const credit = sale(creditQty)

  const accounts = await client.account.findMany({ where: { companyId } })
  const accountId = new Map(accounts.map((row) => [row.code, row.id]))
  const need = (code: string) => {
    const id = accountId.get(code)
    if (!id) throw new Error(`Account ${code} is missing on ${companyName}.`)
    return id
  }

  let quote = await client.quotation.findFirst({ where: { companyId, name: 'QT-TRADE' } })
  if (!quote) {
    quote = await client.quotation.create({
      data: {
        companyId,
        name: 'QT-TRADE',
        customerId: customer.id,
        state: 'draft',
        lines: {
          create: [{
            productId: goods.id,
            description: goods.name,
            quantity: saleQty,
            unitPrice: price,
            discount: 0,
            taxId: tax.id,
          }],
        },
      },
    })
  }

  let order = await client.salesOrder.findFirst({
    where: { companyId, name: 'SO-TRADE' },
    include: { lines: true },
  })
  if (!order) {
    order = await client.salesOrder.create({
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
            quantity: saleQty,
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
  }
  if (quote.salesOrderId !== order.id || quote.state !== 'ordered') {
    await client.quotation.update({ where: { id: quote.id }, data: { state: 'ordered', salesOrderId: order.id } })
  }
  if (order.state === 'cancel') throw new Error(`${companyName} has SO-TRADE cancelled, so the demo cannot post under that name.`)
  if (order.state === 'draft' || order.state === 'sent') {
    await ensureOnHand(client, companyName, goods, shelf, saleQty)
    await confirmOrder(companyId, order.id)
    order = await client.salesOrder.findFirstOrThrow({ where: { id: order.id }, include: { lines: true } })
  }
  const tradeLine = order.lines[0]
  if (!tradeLine) throw new Error(`${companyName} SO-TRADE has no line.`)
  if (order.state === 'sale' && tradeLine.qtyDelivered + 0.0001 < deliverQty) {
    const quantity = roundQty(deliverQty - tradeLine.qtyDelivered)
    await ensureOnHand(client, companyName, goods, shelf, quantity)
    await deliverPartial(companyId, order.id, [{ lineId: tradeLine.id, quantity }])
    order = await client.salesOrder.findFirstOrThrow({ where: { id: order.id }, include: { lines: true } })
  }

  const saleInvoice = await client.invoice.findFirst({ where: { companyId, name: 'INV-TRADE' } })
  if (!saleInvoice) {
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
            quantity: invoiceQty,
            unitPrice: price,
            taxRate: rate,
            subtotal: billed.subtotal,
            taxAmount: billed.taxAmount,
            salesOrderLineId: tradeLine.id,
          }],
        },
      },
    })
    await client.chatterMessage.create({
      data: { companyId, model: 'sale.order', recordId: order.id, kind: 'note', summary: `Invoice ${invoice.name} created.` },
    })
    await postEntry(client, companyId, 'JE-TRADE-S1', 'SAL', invoice.id, [
      { accountId: need('1122'), partnerId: customer.id, label: invoice.name, debit: billed.total, credit: 0 },
      { accountId: need('6001'), partnerId: customer.id, label: invoice.name, debit: 0, credit: billed.subtotal },
      { accountId: need('222101'), partnerId: customer.id, label: invoice.name, debit: 0, credit: billed.taxAmount },
    ])
  } else {
    await postEntry(client, companyId, 'JE-TRADE-S1', 'SAL', saleInvoice.id, [
      { accountId: need('1122'), partnerId: customer.id, label: saleInvoice.name, debit: billed.total, credit: 0 },
      { accountId: need('6001'), partnerId: customer.id, label: saleInvoice.name, debit: 0, credit: billed.subtotal },
      { accountId: need('222101'), partnerId: customer.id, label: saleInvoice.name, debit: 0, credit: billed.taxAmount },
    ])
  }
  if (tradeLine.qtyInvoiced + 0.0001 < invoiceQty) {
    await client.salesOrderLine.update({ where: { id: tradeLine.id }, data: { qtyInvoiced: invoiceQty } })
  }

  let back = await client.salesOrder.findFirst({
    where: { companyId, name: 'SO-RETURN' },
    include: { lines: true },
  })
  if (!back) {
    back = await client.salesOrder.create({
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
            quantity: returnQty,
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
  }
  if (back.state === 'cancel') throw new Error(`${companyName} has SO-RETURN cancelled.`)
  if (back.state === 'draft' || back.state === 'sent') {
    await ensureOnHand(client, companyName, goods, shelf, returnQty)
    await confirmOrder(companyId, back.id)
    back = await client.salesOrder.findFirstOrThrow({ where: { id: back.id }, include: { lines: true } })
  }
  const backLine = back.lines[0]
  if (!backLine) throw new Error(`${companyName} SO-RETURN has no line.`)
  if (back.state === 'sale' && backLine.qtyDelivered + 0.0001 < backLine.quantity) {
    await ensureOnHand(client, companyName, goods, shelf, roundQty(backLine.quantity - backLine.qtyDelivered))
    await deliverOrder(companyId, back.id)
    back = await client.salesOrder.findFirstOrThrow({ where: { id: back.id }, include: { lines: true } })
  }
  const freshBackLine = back.lines[0]
  if (!freshBackLine) throw new Error(`${companyName} SO-RETURN has no line.`)

  const backInvoiceExisting = await client.invoice.findFirst({ where: { companyId, name: 'INV-TRADE-B' } })
  const backInvoice = backInvoiceExisting ?? await client.invoice.create({
    data: {
      name: 'INV-TRADE-B',
      moveType: 'out_invoice',
      state: 'posted',
      partnerId: customer.id,
      companyId,
      invoiceDate: tradeDay,
      salesOrderId: back.id,
      amountUntaxed: returnedOrder.subtotal,
      amountTax: returnedOrder.taxAmount,
      amountTotal: returnedOrder.total,
      residual: returnedOrder.total,
      buyerName: customer.name,
      fapiaoType: 'electronic',
      fapiaoStatus: 'none',
      lines: {
        create: [{
          description: goods.name,
          quantity: returnQty,
          unitPrice: price,
          taxRate: rate,
          subtotal: returnedOrder.subtotal,
          taxAmount: returnedOrder.taxAmount,
          salesOrderLineId: freshBackLine.id,
        }],
      },
    },
  })
  await postEntry(client, companyId, 'JE-TRADE-S2', 'SAL', backInvoice.id, [
    { accountId: need('1122'), partnerId: customer.id, label: backInvoice.name, debit: returnedOrder.total, credit: 0 },
    { accountId: need('6001'), partnerId: customer.id, label: backInvoice.name, debit: 0, credit: returnedOrder.subtotal },
    { accountId: need('222101'), partnerId: customer.id, label: backInvoice.name, debit: 0, credit: returnedOrder.taxAmount },
  ])
  if (freshBackLine.qtyInvoiced + 0.0001 < returnQty) {
    await client.salesOrderLine.update({ where: { id: freshBackLine.id }, data: { qtyInvoiced: returnQty } })
  }

  const customerLocation = await client.stockLocation.findFirst({ where: { companyId, type: 'customer' } })
  if (!customerLocation) throw new Error(`${companyName} has no customer stock location.`)
  const alreadyReturned = await client.stockMove.findFirst({
    where: { reference: 'CN-TRADE', orderId: back.id, state: 'done' },
  })
  if (!alreadyReturned) {
    await client.$transaction(async (tx) => {
      await applyQuant(tx, goods.id, customerLocation.id, -creditQty)
      await applyQuant(tx, goods.id, shelf.id, creditQty)
      const move = await tx.stockMove.create({
        data: {
          productId: goods.id,
          locationFromId: customerLocation.id,
          locationToId: shelf.id,
          quantity: creditQty,
          state: 'done',
          reference: 'CN-TRADE',
          orderId: back.id,
          date: tradeDay,
        },
      })
      await valueDoneMove(tx, companyId, move.id)
    }, transactionOptions)
  }
  const creditExisting = await client.invoice.findFirst({ where: { companyId, name: 'CN-TRADE' } })
  const creditNote = creditExisting ?? await client.invoice.create({
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
          quantity: creditQty,
          unitPrice: price,
          taxRate: rate,
          subtotal: credit.subtotal,
          taxAmount: credit.taxAmount,
          salesOrderLineId: freshBackLine.id,
        }],
      },
    },
  })
  await postEntry(client, companyId, 'JE-TRADE-CN', 'SAL', creditNote.id, [
    { accountId: need('6001'), partnerId: customer.id, label: creditNote.name, debit: credit.subtotal, credit: 0 },
    { accountId: need('222101'), partnerId: customer.id, label: creditNote.name, debit: credit.taxAmount, credit: 0 },
    { accountId: need('1122'), partnerId: customer.id, label: creditNote.name, debit: 0, credit: credit.total },
  ])
  const returnNote = await client.chatterMessage.findFirst({
    where: { companyId, model: 'sale.order', recordId: back.id, summary: { contains: creditNote.name } },
  })
  if (!returnNote) {
    await client.chatterMessage.create({
      data: {
        companyId,
        model: 'sale.order',
        recordId: back.id,
        kind: 'note',
        summary: `Return ${creditNote.name} posted against ${backInvoice.name}.`,
      },
    })
  }

  const request = await client.materialRequest.findFirst({ where: { companyId, name: 'MR-TRADE' } })
  const material = request ?? await client.materialRequest.create({
    data: {
      companyId,
      name: 'MR-TRADE',
      state: 'ordered',
      lines: { create: [{ productId: bought.id, quantity: buyQty, qtyOrdered: buyQty }] },
    },
  })
  const cost = bought.costPrice
  const dear = roundMoney(cost + 1)
  const otherQuote = await client.supplierQuotation.findFirst({ where: { companyId, name: 'SQ-TRADE-B' } })
  if (!otherQuote) {
    await client.supplierQuotation.create({
      data: {
        companyId,
        name: 'SQ-TRADE-B',
        vendorId: other.id,
        materialRequestId: material.id,
        state: 'received',
        lines: { create: [{ productId: bought.id, quantity: buyQty, unitCost: dear }] },
      },
    })
  }
  const buy = lineAmounts({ quantity: buyQty, unitPrice: cost, discount: 0, taxRate: rate })
  let purchase = await client.purchaseOrder.findFirst({
    where: { companyId, name: 'PO-TRADE' },
    include: { lines: true },
  })
  if (!purchase) {
    purchase = await client.purchaseOrder.create({
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
            quantity: buyQty,
            unitCost: cost,
            taxId: tax.id,
            subtotal: buy.subtotal,
            taxAmount: buy.taxAmount,
          }],
        },
      },
      include: { lines: true },
    })
  }
  const chosen = await client.supplierQuotation.findFirst({ where: { companyId, name: 'SQ-TRADE-A' } })
  if (!chosen) {
    await client.supplierQuotation.create({
      data: {
        companyId,
        name: 'SQ-TRADE-A',
        vendorId: vendor.id,
        materialRequestId: material.id,
        purchaseOrderId: purchase.id,
        state: 'received',
        lines: { create: [{ productId: bought.id, quantity: buyQty, unitCost: cost }] },
      },
    })
  }
  if (purchase.state === 'cancel') throw new Error(`${companyName} has PO-TRADE cancelled.`)
  if (purchase.state === 'draft' || purchase.state === 'sent') {
    await confirmPurchase(companyId, purchase.id)
    purchase = await client.purchaseOrder.findFirstOrThrow({ where: { id: purchase.id }, include: { lines: true } })
  }
  const boughtLine = purchase.lines[0]
  if (!boughtLine) throw new Error(`${companyName} PO-TRADE has no line.`)
  if (purchase.state === 'purchase') {
    const drafts = await client.stockMove.findMany({ where: { purchaseOrderId: purchase.id, state: 'draft' } })
    if (drafts.length > 0) {
      await receivePurchase(companyId, purchase.id, {
        lines: drafts.map((move) => ({ moveId: move.id, quantity: move.quantity })),
      })
    } else if (boughtLine.qtyReceived + 0.0001 < boughtLine.quantity) {
      throw new Error(`${companyName} PO-TRADE is short received and has no open receipt.`)
    } else {
      await receivePurchase(companyId, purchase.id, { lines: [] })
    }
  }
  const bill = await client.invoice.findFirst({
    where: { companyId, purchaseOrderId: purchase.id, moveType: 'in_invoice', state: { not: 'cancel' } },
  })
  if (!bill) {
    const created = await invoiceFromPurchase(companyId, purchase.id)
    await postInvoice(companyId, created.id)
  } else if (bill.state === 'draft') {
    await postInvoice(companyId, bill.id)
  }
  const receipt = await client.purchaseReceipt.findFirst({ where: { companyId, purchaseOrderId: purchase.id } })
  if (!receipt) throw new Error(`${companyName} PO-TRADE has no receipt to take the landed cost.`)
  if (receipt.landedCost < 0.001) await applyReceiptLanded(companyId, receipt.id, 4)
  console.log(`seed-trade: ${companyName} selling and buying documents are posted.`)
}

export async function seedTrade(client: PrismaClient) {
  const failures: string[] = []
  for (const email of demoAdminEmails) {
    const admin = await client.user.findUnique({
      where: { email },
      select: { companyId: true, company: { select: { name: true } } },
    })
    if (!admin) {
      const message = `demo admin ${email} is missing`
      console.error(`seed-trade: ${message}`)
      failures.push(message)
      continue
    }
    try {
      await seedCompany(client, admin.companyId, admin.company.name)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`seed-trade: ${admin.company.name} failed: ${message}`)
      if (error instanceof Error && error.stack) console.error(error.stack)
      failures.push(`${admin.company.name}: ${message}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`seed-trade did not finish: ${failures.join('; ')}`)
  }
}
