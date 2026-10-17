import { lineAmounts, sumLines } from '../../src/domain/money.ts'
import type { PurchaseInput, ReceivePurchaseInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { applyQuant, companyLocations, resolveWarehouseId, roundQty, warehouseStockLocation } from './stock.ts'
import { noteChatter, recordReceipt } from './trade.ts'
import { valueDoneMove } from './valuation.ts'
import { guardWorkflow } from './workflow.ts'

const editableStates = new Set(['draft', 'sent'])

const purchaseInclude = {
  vendor: { select: { id: true, name: true, email: true, city: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, type: true, kind: true } },
      tax: { select: { id: true, name: true, rate: true } },
    },
  },
  moves: {
    include: {
      product: { select: { name: true, sku: true } },
      locationFrom: { select: { name: true, type: true } },
      locationTo: { select: { name: true, type: true } },
    },
    orderBy: { id: 'asc' as const },
  },
}

async function nextPurchaseName(tx: Tx): Promise<string> {
  const sequence = await tx.sequence.update({
    where: { name: 'purchase.order' },
    data: { next: { increment: 1 } },
  })
  return `PO${String(sequence.next).padStart(4, '0')}`
}

async function requireVendor(tx: Tx, companyId: number, vendorId: number) {
  const vendor = await tx.contact.findFirst({ where: { id: vendorId, companyId } })
  if (!vendor) throw new AppError(400, 'Choose a vendor from your contacts.')
  if (!vendor.isSupplier) throw new AppError(400, `${vendor.name} is not marked as a supplier.`)
  return vendor
}

async function buildLines(tx: Tx, companyId: number, lines: PurchaseInput['lines']) {
  const products = await tx.product.findMany({
    where: { companyId, id: { in: lines.map((line) => line.productId) } },
  })
  const taxes = await tx.tax.findMany()
  const productById = new Map(products.map((product) => [product.id, product]))
  const taxById = new Map(taxes.map((tax) => [tax.id, tax]))

  return lines.map((line, index) => {
    const product = productById.get(line.productId)
    if (!product) {
      throw new AppError(400, `Line ${index + 1} uses a product that is not in this company.`)
    }
    if (!product.active) {
      throw new AppError(400, `${product.name} is archived.`)
    }
    if (!product.purchasable) {
      throw new AppError(400, `${product.name} is not marked purchasable.`)
    }
    const tax = line.taxId ? taxById.get(line.taxId) : undefined
    if (line.taxId && !tax) {
      throw new AppError(400, `Line ${index + 1} uses an unknown tax.`)
    }
    const amounts = lineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitCost,
      discount: 0,
      taxRate: tax?.rate ?? 0,
    })
    return {
      productId: product.id,
      description: product.name,
      quantity: roundQty(line.quantity),
      unitCost: line.unitCost,
      taxId: tax?.id ?? null,
      subtotal: amounts.subtotal,
      taxAmount: amounts.taxAmount,
    }
  })
}

export async function createPurchase(companyId: number, userId: number, input: PurchaseInput) {
  return prisma.$transaction(async (tx) => {
    await requireVendor(tx, companyId, input.vendorId)
    const lines = await buildLines(tx, companyId, input.lines)
    const totals = sumLines(lines)
    const warehouseId = await resolveWarehouseId(tx, companyId, input.warehouseId)
    return tx.purchaseOrder.create({
      data: {
        name: await nextPurchaseName(tx),
        state: 'draft',
        vendorId: input.vendorId,
        warehouseId,
        companyId,
        dateOrder: new Date(),
        ...totals,
        createdById: userId,
        lines: { create: lines },
      },
      include: purchaseInclude,
    })
  })
}

export async function updatePurchase(companyId: number, orderId: number, input: PurchaseInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, companyId } })
    if (!order) throw new AppError(404, 'Purchase order not found.')
    if (!editableStates.has(order.state)) {
      throw new AppError(409, 'Only a draft or sent RFQ can be edited.')
    }
    await requireVendor(tx, companyId, input.vendorId)
    const lines = await buildLines(tx, companyId, input.lines)
    const totals = sumLines(lines)
    const warehouseId = await resolveWarehouseId(tx, companyId, input.warehouseId)
    await tx.purchaseOrderLine.deleteMany({ where: { orderId } })
    return tx.purchaseOrder.update({
      where: { id: orderId },
      data: {
        vendorId: input.vendorId,
        warehouseId,
        ...totals,
        lines: { create: lines },
      },
      include: purchaseInclude,
    })
  })
}

export async function markPurchaseSent(companyId: number, orderId: number) {
  const order = await prisma.purchaseOrder.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw new AppError(404, 'Purchase order not found.')
  if (order.state !== 'draft') {
    throw new AppError(409, 'Only a draft RFQ can be marked sent.')
  }
  return prisma.$transaction(async (tx) => {
    await guardWorkflow(tx, {
      companyId,
      model: 'purchase.order',
      recordId: order.id,
      from: order.state,
      to: 'sent',
      label: order.name,
    })
    return tx.purchaseOrder.update({
      where: { id: orderId },
      data: { state: 'sent' },
      include: purchaseInclude,
    })
  })
}

export async function confirmPurchase(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: { include: { product: true } } },
    })
    if (!order) throw new AppError(404, 'Purchase order not found.')
    if (!editableStates.has(order.state)) {
      throw new AppError(409, 'This purchase is already confirmed or closed.')
    }
    if (order.lines.length === 0) {
      throw new AppError(400, 'Add a line before confirming.')
    }

    const locations = await companyLocations(tx, companyId)
    const destination = await warehouseStockLocation(tx, companyId, order.warehouseId)
    for (const line of order.lines) {
      if (line.product.type !== 'product') continue
      await tx.stockMove.create({
        data: {
          productId: line.productId,
          locationFromId: locations.supplier.id,
          locationToId: destination.location.id,
          quantity: line.quantity,
          state: 'draft',
          reference: order.name,
          purchaseOrderId: order.id,
          date: new Date(),
        },
      })
    }

    await guardWorkflow(tx, {
      companyId,
      model: 'purchase.order',
      recordId: order.id,
      from: order.state,
      to: 'purchase',
      label: order.name,
    })
    return tx.purchaseOrder.update({
      where: { id: order.id },
      data: { state: 'purchase' },
      include: purchaseInclude,
    })
  })
}

export async function receivePurchase(companyId: number, orderId: number, input: ReceivePurchaseInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: orderId, companyId },
      include: { moves: true },
    })
    if (!order) throw new AppError(404, 'Purchase order not found.')
    if (order.state !== 'purchase') {
      throw new AppError(409, 'Confirm the purchase before receiving it.')
    }

    const pending = order.moves.filter((move) => move.state === 'draft')
    if (pending.length === 0) {
      await guardWorkflow(tx, {
        companyId,
        model: 'purchase.order',
        recordId: order.id,
        from: order.state,
        to: 'done',
        label: order.name,
      })
      return tx.purchaseOrder.update({
        where: { id: order.id },
        data: { state: 'done' },
        include: purchaseInclude,
      })
    }

    const requested = input.lines ?? pending.map((move) => ({ moveId: move.id, quantity: move.quantity }))
    if (requested.length === 0) {
      throw new AppError(400, 'Enter a quantity to receive.')
    }

    const completed: Array<{ id: number; productId: number; quantity: number }> = []
    for (const row of requested) {
      const move = pending.find((item) => item.id === row.moveId)
      if (!move) throw new AppError(400, 'That receipt line is not open.')
      const quantity = roundQty(row.quantity)
      if (quantity <= 0) throw new AppError(400, 'Quantity must be greater than zero.')
      if (quantity - move.quantity > 0.0001) {
        throw new AppError(400, 'You cannot receive more than the open quantity.')
      }
      await applyQuant(tx, move.productId, move.locationFromId, -quantity)
      await applyQuant(tx, move.productId, move.locationToId, quantity)
      const done = await tx.stockMove.update({
        where: { id: move.id },
        data: { state: 'done', quantity, date: new Date() },
      })
      await valueDoneMove(tx, companyId, done.id)
      completed.push({ id: done.id, productId: done.productId, quantity: done.quantity })
      const remainder = roundQty(move.quantity - quantity)
      if (remainder > 0.0001) {
        await tx.stockMove.create({
          data: {
            productId: move.productId,
            locationFromId: move.locationFromId,
            locationToId: move.locationToId,
            quantity: remainder,
            state: 'draft',
            reference: order.name,
            purchaseOrderId: order.id,
            date: new Date(),
          },
        })
      }
    }

    await recordReceipt(tx, companyId, order.id, completed)
    const stillOpen = await tx.stockMove.count({
      where: { purchaseOrderId: order.id, state: 'draft' },
    })
    const next = stillOpen === 0 ? 'done' : 'purchase'
    await guardWorkflow(tx, {
      companyId,
      model: 'purchase.order',
      recordId: order.id,
      from: order.state,
      to: next,
      label: order.name,
    })
    return tx.purchaseOrder.update({
      where: { id: order.id },
      data: { state: next },
      include: purchaseInclude,
    })
  })
}

export async function cancelPurchase(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({ where: { id: orderId, companyId } })
    if (!order) throw new AppError(404, 'Purchase order not found.')
    if (order.state === 'done') {
      throw new AppError(409, 'A received purchase stays on the books. It cannot be cancelled.')
    }
    const received = await tx.stockMove.count({
      where: { purchaseOrderId: orderId, state: 'done' },
    })
    if (received > 0) {
      throw new AppError(409, 'Goods from this purchase are already in stock, so it cannot be cancelled.')
    }
    if (order.state === 'cancel') {
      return tx.purchaseOrder.findFirstOrThrow({ where: { id: orderId }, include: purchaseInclude })
    }
    await guardWorkflow(tx, {
      companyId,
      model: 'purchase.order',
      recordId: order.id,
      from: order.state,
      to: 'cancel',
      label: order.name,
    })
    await tx.stockMove.updateMany({
      where: { purchaseOrderId: orderId, state: 'draft' },
      data: { state: 'cancel' },
    })
    return tx.purchaseOrder.update({
      where: { id: orderId },
      data: { state: 'cancel' },
      include: purchaseInclude,
    })
  })
}

export async function orderFromQuote(companyId: number, userId: number, quoteId: number) {
  const quote = await prisma.supplierQuotation.findFirst({
    where: { id: quoteId, companyId },
    include: { lines: true, materialRequest: { include: { lines: true } } },
  })
  if (!quote) throw new AppError(404, 'Supplier quotation not found.')
  if (quote.purchaseOrderId) throw new AppError(409, 'This quotation already has a purchase order.')
  if (quote.lines.length === 0) throw new AppError(400, 'The quotation has no lines.')
  const tax = await prisma.tax.findFirst({ where: { isDefault: true } })
  const created = await createPurchase(companyId, userId, {
    vendorId: quote.vendorId,
    lines: quote.lines.map((line) => ({
      productId: line.productId,
      quantity: line.quantity,
      unitCost: line.unitCost,
      taxId: tax?.id ?? null,
    })),
  })
  const confirmed = await confirmPurchase(companyId, created.id)
  await prisma.supplierQuotation.update({
    where: { id: quote.id },
    data: { purchaseOrderId: confirmed.id, state: 'received' },
  })
  if (quote.materialRequest) {
    for (const line of quote.lines) {
      const requestLine = quote.materialRequest.lines.find((row) => row.productId === line.productId)
      if (!requestLine) continue
      await prisma.materialRequestLine.update({
        where: { id: requestLine.id },
        data: { qtyOrdered: roundQty(requestLine.qtyOrdered + line.quantity) },
      })
    }
    const fresh = await prisma.materialRequest.findFirst({
      where: { id: quote.materialRequest.id },
      include: { lines: true },
    })
    if (fresh && fresh.lines.every((line) => line.qtyOrdered + 0.0001 >= line.quantity)) {
      await prisma.materialRequest.update({ where: { id: fresh.id }, data: { state: 'ordered' } })
    }
  }
  await prisma.$transaction((tx) => noteChatter(tx, companyId, 'purchase.order', confirmed.id, `Created from ${quote.name}.`))
  return confirmed
}
