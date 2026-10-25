import { lineAmounts, roundMoney, sumLines } from '../../src/domain/money.ts'
import { fulfillmentStatus, resolveUnitPrice, type FulfillmentStatus } from '../../src/domain/trade.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { allocateDocument, allocateKnown } from './number-series.ts'
import { assertQualityClear, prepareQualityChecks } from './quality.ts'
import { applyQuant, roundQty } from './stock.ts'
import { landedCost, valueDoneMove } from './valuation.ts'
import { guardWorkflow } from './workflow.ts'

async function nextDoc(tx: Tx, name: string, prefix: string) {
  const match = name.match(/^(delivery|receipt|material|supplier\.quote)\.(\d+)$/)
  if (!match?.[1] || !match[2]) throw new AppError(500, 'That document has no number series.')
  const document = match[1] === 'supplier.quote' ? 'supplier.quote' : match[1]
  return allocateDocument(tx, Number(match[2]), document, name, prefix)
}

export async function noteChatter(tx: Tx, companyId: number, model: string, recordId: number, summary: string) {
  await tx.chatterMessage.create({
    data: { companyId, model, recordId, kind: 'note', summary },
  })
}

export async function assertCreditLimit(tx: Tx, companyId: number, customerId: number, orderTotal: number) {
  const customer = await tx.contact.findFirst({ where: { id: customerId, companyId } })
  if (!customer || customer.creditLimit <= 0) return
  const open = await tx.invoice.aggregate({
    where: { companyId, partnerId: customerId, moveType: 'out_invoice', state: 'posted' },
    _sum: { residual: true },
  })
  const exposure = (open._sum.residual ?? 0) + orderTotal
  if (exposure - customer.creditLimit > 0.001) {
    throw new AppError(409, `${customer.name} is over the credit limit of ${customer.creditLimit}.`)
  }
}

type CompletedMove = { id: number; productId: number; quantity: number }

export async function recordDelivery(tx: Tx, companyId: number, orderId: number, completed: CompletedMove[]) {
  if (completed.length === 0) return null
  const name = await nextDoc(tx, `delivery.${companyId}`, 'DN')
  const note = await tx.deliveryNote.create({
    data: { companyId, name, salesOrderId: orderId, state: 'done', date: new Date() },
  })
  const lines = await tx.salesOrderLine.findMany({ where: { orderId }, orderBy: { id: 'asc' } })
  const open = lines.map((line) => ({ ...line, left: roundQty(line.quantity - line.qtyDelivered) }))
  for (const move of completed) {
    let left = move.quantity
    for (const line of open) {
      if (left <= 0.0001) break
      if (line.productId !== move.productId || line.left <= 0.0001) continue
      const take = roundQty(Math.min(line.left, left))
      await tx.deliveryNoteLine.create({
        data: { noteId: note.id, salesOrderLineId: line.id, productId: move.productId, quantity: take },
      })
      const delivered = roundQty(line.qtyDelivered + take)
      await tx.salesOrderLine.update({ where: { id: line.id }, data: { qtyDelivered: delivered } })
      line.qtyDelivered = delivered
      line.left = roundQty(line.left - take)
      left = roundQty(left - take)
    }
    await tx.stockMove.update({ where: { id: move.id }, data: { deliveryNoteId: note.id } })
  }
  await noteChatter(tx, companyId, 'sale.order', orderId, `Delivery ${name} recorded.`)
  return note
}

export async function deliverPartial(
  companyId: number,
  orderId: number,
  requested: Array<{ lineId: number; quantity: number }>,
) {
  if (requested.length === 0) throw new AppError(400, 'Enter a quantity to deliver.')
  await prepareQualityChecks(companyId, { trigger: 'delivery', productIds: [], salesOrderId: orderId })
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: { include: { product: true } }, moves: true },
    })
    if (!order) throw new AppError(404, 'Order not found.')
    if (order.state !== 'sale') throw new AppError(409, 'Confirm the quotation before delivering it.')
    await assertQualityClear(tx, companyId, { trigger: 'delivery', productIds: [], salesOrderId: order.id })
    const draft = order.moves.filter((move) => move.state === 'draft')
    const completed: CompletedMove[] = []
    for (const row of requested) {
      const line = order.lines.find((item) => item.id === row.lineId)
      if (!line) throw new AppError(400, 'That line is not on the order.')
      if (line.product.type !== 'product') throw new AppError(400, 'Services are not delivered from the shelf.')
      const quantity = roundQty(row.quantity)
      const left = roundQty(line.quantity - line.qtyDelivered)
      if (quantity <= 0) throw new AppError(400, 'Quantity must be greater than zero.')
      if (quantity - left > 0.0001) throw new AppError(400, 'You cannot deliver more than the open quantity.')
      let need = quantity
      for (const move of draft) {
        if (need <= 0.0001) break
        if (move.productId !== line.productId || move.state !== 'draft') continue
        const original = move.quantity
        const take = roundQty(Math.min(original, need))
        await applyQuant(tx, move.productId, move.locationFromId, -take)
        await applyQuant(tx, move.productId, move.locationToId, take)
        const done = await tx.stockMove.update({
          where: { id: move.id },
          data: { state: 'done', quantity: take, date: new Date() },
        })
        await valueDoneMove(tx, companyId, done.id)
        completed.push({ id: done.id, productId: done.productId, quantity: take })
        move.state = 'done'
        const remainder = roundQty(original - take)
        if (remainder > 0.0001) {
          const split = await tx.stockMove.create({
            data: {
              productId: move.productId,
              locationFromId: move.locationFromId,
              locationToId: move.locationToId,
              quantity: remainder,
              state: 'draft',
              reference: order.name,
              orderId: order.id,
              date: new Date(),
            },
          })
          draft.push(split)
        }
        need = roundQty(need - take)
      }
      if (need > 0.0001) throw new AppError(409, 'There is no open delivery for that quantity.')
    }
    await recordDelivery(tx, companyId, order.id, completed)
    const lines = await tx.salesOrderLine.findMany({
      where: { orderId: order.id },
      include: { product: true },
    })
    const stockLeft = lines.some((line) => line.product.type === 'product' && line.qtyDelivered + 0.0001 < line.quantity)
    if (!stockLeft) {
      await guardWorkflow(tx, {
        companyId,
        model: 'sale.order',
        recordId: order.id,
        from: order.state,
        to: 'done',
        label: order.name,
      })
      await tx.salesOrder.update({ where: { id: order.id }, data: { state: 'done' } })
    }
    return tx.salesOrder.findFirstOrThrow({
      where: { id: order.id },
      include: {
        lines: { include: { product: { select: { id: true, name: true, sku: true, type: true } }, tax: true } },
        deliveries: { select: { id: true, name: true, state: true } },
      },
    })
  }, transactionOptions)
}

export async function recordReceipt(tx: Tx, companyId: number, orderId: number, completed: CompletedMove[]) {
  if (completed.length === 0) return null
  const name = await nextDoc(tx, `receipt.${companyId}`, 'GR')
  const receipt = await tx.purchaseReceipt.create({
    data: { companyId, name, purchaseOrderId: orderId, state: 'done', date: new Date(), landedCost: 0 },
  })
  const lines = await tx.purchaseOrderLine.findMany({ where: { orderId }, orderBy: { id: 'asc' } })
  const open = lines.map((line) => ({ ...line, left: roundQty(line.quantity - line.qtyReceived) }))
  for (const move of completed) {
    let left = move.quantity
    for (const line of open) {
      if (left <= 0.0001) break
      if (line.productId !== move.productId || line.left <= 0.0001) continue
      const take = roundQty(Math.min(line.left, left))
      await tx.purchaseReceiptLine.create({
        data: {
          receiptId: receipt.id,
          purchaseOrderLineId: line.id,
          productId: move.productId,
          quantity: take,
          unitCost: line.unitCost,
        },
      })
      const received = roundQty(line.qtyReceived + take)
      await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { qtyReceived: received } })
      line.qtyReceived = received
      line.left = roundQty(line.left - take)
      left = roundQty(left - take)
    }
    await tx.stockMove.update({ where: { id: move.id }, data: { purchaseReceiptId: receipt.id } })
  }
  await noteChatter(tx, companyId, 'purchase.order', orderId, `Receipt ${name} recorded.`)
  return receipt
}

export async function applyReceiptLanded(companyId: number, receiptId: number, amount: number) {
  const receipt = await prisma.purchaseReceipt.findFirst({
    where: { id: receiptId, companyId },
    include: { lines: true },
  })
  if (!receipt) throw new AppError(404, 'Receipt not found.')
  const line = receipt.lines[0]
  if (!line) throw new AppError(400, 'The receipt has no goods to absorb a landed cost.')
  await landedCost(companyId, line.productId, amount)
  const updated = await prisma.purchaseReceipt.update({
    where: { id: receipt.id },
    data: { landedCost: roundMoney(receipt.landedCost + amount) },
  })
  await prisma.chatterMessage.create({
    data: {
      companyId,
      model: 'purchase.order',
      recordId: receipt.purchaseOrderId,
      kind: 'note',
      summary: `Landed cost ${amount} added on ${receipt.name}.`,
    },
  })
  return updated
}

export async function orderLinks(companyId: number, orderId: number) {
  const order = await prisma.salesOrder.findFirst({
    where: { id: orderId, companyId },
    include: {
      lines: true,
      quotations: { select: { id: true, name: true, state: true } },
      deliveries: { select: { id: true, name: true, state: true, date: true } },
      invoices: {
        where: { state: { not: 'cancel' } },
        select: {
          id: true,
          name: true,
          moveType: true,
          state: true,
          amountTotal: true,
          residual: true,
          payments: { select: { id: true, amount: true, method: true, paidAt: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  })
  if (!order) throw new AppError(404, 'Order not found.')
  const fulfillment: FulfillmentStatus = fulfillmentStatus(order.lines)
  const payments = order.invoices.flatMap((invoice) =>
    invoice.payments.map((payment) => ({ ...payment, invoiceId: invoice.id, invoiceName: invoice.name })),
  )
  return {
    fulfillment,
    quotations: order.quotations,
    deliveries: order.deliveries,
    invoices: order.invoices.filter((invoice) => invoice.moveType === 'out_invoice'),
    creditNotes: order.invoices.filter((invoice) => invoice.moveType === 'out_refund'),
    payments,
  }
}

export async function purchaseLinks(companyId: number, orderId: number) {
  const order = await prisma.purchaseOrder.findFirst({
    where: { id: orderId, companyId },
    include: {
      lines: true,
      quotes: { select: { id: true, name: true, state: true } },
      receipts: { select: { id: true, name: true, state: true, date: true, landedCost: true } },
      invoices: {
        where: { state: { not: 'cancel' } },
        select: { id: true, name: true, moveType: true, state: true, amountTotal: true, residual: true },
        orderBy: { id: 'asc' },
      },
    },
  })
  if (!order) throw new AppError(404, 'Purchase order not found.')
  const fulfillment = fulfillmentStatus(
    order.lines.map((line) => ({ quantity: line.quantity, qtyDelivered: line.qtyReceived, qtyInvoiced: line.qtyBilled })),
  )
  return {
    fulfillment,
    quotes: order.quotes,
    receipts: order.receipts,
    bills: order.invoices.filter((invoice) => invoice.moveType === 'in_invoice'),
    debitNotes: order.invoices.filter((invoice) => invoice.moveType === 'in_refund'),
  }
}

export async function resolvePrice(
  companyId: number,
  input: {
    side: 'sales' | 'purchase'
    productId: number
    quantity: number
    customerId?: number | null
    vendorId?: number | null
  },
) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, companyId } })
  if (!product) throw new AppError(404, 'Product not found.')
  const customer = input.customerId
    ? await prisma.contact.findFirst({ where: { id: input.customerId, companyId } })
    : null
  const vendor = input.vendorId
    ? await prisma.contact.findFirst({ where: { id: input.vendorId, companyId } })
    : null
  const assigned = input.side === 'purchase' ? vendor?.purchasePriceListId : customer?.salePriceListId
  const breaks = await prisma.priceListItem.findMany({
    where: { productId: product.id, priceList: { companyId, ...(assigned ? { id: assigned } : {}) } },
  })
  const rules = await prisma.pricingRule.findMany({
    where: { companyId, side: input.side, active: true },
  })
  return resolveUnitPrice({
    side: input.side,
    productId: product.id,
    quantity: input.quantity,
    listPrice: input.side === 'purchase' ? product.costPrice : product.listPrice,
    customerId: customer?.id ?? null,
    customerGroupId: customer?.customerGroupId ?? null,
    vendorId: input.vendorId ?? null,
    breaks,
    rules,
  })
}

export async function listPricingRules(companyId: number) {
  return prisma.pricingRule.findMany({
    where: { companyId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      customer: { select: { id: true, name: true } },
      customerGroup: { select: { id: true, name: true } },
      vendor: { select: { id: true, name: true } },
    },
    orderBy: { name: 'asc' },
  })
}

export async function createMaterialRequest(companyId: number, lines: Array<{ productId: number; quantity: number }>) {
  if (lines.length === 0) throw new AppError(400, 'Add a product to the request.')
  return prisma.$transaction(async (tx) => {
    const products = await tx.product.findMany({
      where: { companyId, id: { in: lines.map((line) => line.productId) } },
    })
    if (products.length !== new Set(lines.map((line) => line.productId)).size) {
      throw new AppError(400, 'Choose products from this company.')
    }
    const name = await nextDoc(tx, `material.${companyId}`, 'MR')
    const request = await tx.materialRequest.create({
      data: {
        companyId,
        name,
        state: 'confirmed',
        lines: { create: lines.map((line) => ({ productId: line.productId, quantity: roundQty(line.quantity) })) },
      },
      include: { lines: true },
    })
    await noteChatter(tx, companyId, 'material.request', request.id, `${name} confirmed.`)
    return request
  })
}

export async function createSupplierQuote(
  companyId: number,
  input: {
    vendorId: number
    materialRequestId?: number | null
    lines: Array<{ productId: number; quantity: number; unitCost: number }>
  },
) {
  const vendor = await prisma.contact.findFirst({ where: { id: input.vendorId, companyId, isSupplier: true } })
  if (!vendor) throw new AppError(400, 'Choose a supplier from your contacts.')
  if (input.lines.length === 0) throw new AppError(400, 'Add a quoted line.')
  return prisma.$transaction(async (tx) => {
    if (input.materialRequestId) {
      const request = await tx.materialRequest.findFirst({ where: { id: input.materialRequestId, companyId } })
      if (!request) throw new AppError(404, 'Material request not found.')
    }
    const name = await nextDoc(tx, `supplier.quote.${companyId}`, 'SQ')
    const quote = await tx.supplierQuotation.create({
      data: {
        companyId,
        name,
        vendorId: vendor.id,
        materialRequestId: input.materialRequestId ?? null,
        state: 'received',
        lines: {
          create: input.lines.map((line) => ({
            productId: line.productId,
            quantity: roundQty(line.quantity),
            unitCost: line.unitCost,
          })),
        },
      },
      include: { lines: true, vendor: { select: { id: true, name: true } } },
    })
    await noteChatter(tx, companyId, 'supplier.quotation', quote.id, `${name} received from ${vendor.name}.`)
    return quote
  })
}

export async function compareQuotes(companyId: number, requestId: number) {
  const request = await prisma.materialRequest.findFirst({
    where: { id: requestId, companyId },
    include: { lines: true },
  })
  if (!request) throw new AppError(404, 'Material request not found.')
  const quotes = await prisma.supplierQuotation.findMany({
    where: { companyId, materialRequestId: requestId },
    include: { lines: true, vendor: { select: { id: true, name: true } } },
  })
  const products = [...new Set(request.lines.map((line) => line.productId))]
  const rows = products.map((productId) => {
    const offers = quotes
      .flatMap((quote) =>
        quote.lines
          .filter((line) => line.productId === productId)
          .map((line) => ({
            quoteId: quote.id,
            quoteName: quote.name,
            vendorId: quote.vendorId,
            vendorName: quote.vendor.name,
            quantity: line.quantity,
            unitCost: line.unitCost,
          })),
      )
      .sort((a, b) => a.unitCost - b.unitCost)
    return { productId, offers }
  })
  return { requestId, rows }
}

export async function orderFromQuotation(companyId: number, userId: number, quotationId: number) {
  return prisma.$transaction(async (tx) => {
    const quote = await tx.quotation.findFirst({
      where: { id: quotationId, companyId },
      include: { lines: true },
    })
    if (!quote) throw new AppError(404, 'Quotation not found.')
    if (quote.state === 'cancel') throw new AppError(409, 'A cancelled quotation cannot be ordered.')
    if (quote.salesOrderId) throw new AppError(409, 'This quotation already has a sales order.')
    if (quote.lines.length === 0) throw new AppError(400, 'Add a line before ordering.')
    const taxes = await tx.tax.findMany()
    const taxById = new Map(taxes.map((tax) => [tax.id, tax]))
    const products = await tx.product.findMany({
      where: { companyId, id: { in: quote.lines.map((line) => line.productId) } },
    })
    const productById = new Map(products.map((product) => [product.id, product]))
    const built = quote.lines.map((line) => {
      const product = productById.get(line.productId)
      if (!product) throw new AppError(400, 'A quoted product is not in this company.')
      const tax = line.taxId ? taxById.get(line.taxId) : undefined
      const amounts = lineAmounts({
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: tax?.rate ?? 0,
      })
      return {
        productId: product.id,
        description: line.description || product.name,
        quantity: roundQty(line.quantity),
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxId: tax?.id ?? null,
        subtotal: amounts.subtotal,
        taxAmount: amounts.taxAmount,
      }
    })
    const totals = sumLines(built)
    const order = await tx.salesOrder.create({
      data: {
        name: await allocateKnown(tx, companyId, 'sales.order'),
        state: 'draft',
        customerId: quote.customerId,
        companyId,
        dateOrder: new Date(),
        createdById: userId,
        ...totals,
        lines: { create: built },
      },
    })
    await tx.quotation.update({
      where: { id: quote.id },
      data: { state: 'ordered', salesOrderId: order.id },
    })
    await noteChatter(tx, companyId, 'sale.order', order.id, `Created from ${quote.name}.`)
    await noteChatter(tx, companyId, 'quotation', quote.id, `Ordered as ${order.name}.`)
    return order
  })
}
