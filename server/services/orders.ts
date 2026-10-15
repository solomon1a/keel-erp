import { lineAmounts, sumLines } from '../../src/domain/money.ts'
import type { OrderInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { applyQuant, companyLocations, onHand, resolveWarehouseId, roundQty, warehouseStockLocation } from './stock.ts'

const editableStates = new Set(['draft', 'sent'])

const orderInclude = {
  customer: { select: { id: true, name: true, email: true, city: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, type: true } },
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

async function nextOrderName(tx: Tx): Promise<string> {
  const sequence = await tx.sequence.update({
    where: { name: 'sales.order' },
    data: { next: { increment: 1 } },
  })
  return `SO${String(sequence.next).padStart(4, '0')}`
}

async function buildLines(tx: Tx, companyId: number, lines: OrderInput['lines']) {
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
    const tax = line.taxId ? taxById.get(line.taxId) : undefined
    if (line.taxId && !tax) {
      throw new AppError(400, `Line ${index + 1} uses an unknown tax.`)
    }
    const amounts = lineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      taxRate: tax?.rate ?? 0,
    })
    return {
      productId: product.id,
      description: product.name,
      quantity: roundQty(line.quantity),
      unitPrice: line.unitPrice,
      discount: line.discount,
      taxId: tax?.id ?? null,
      subtotal: amounts.subtotal,
      taxAmount: amounts.taxAmount,
    }
  })
}

async function requireCustomer(tx: Tx, companyId: number, customerId: number) {
  const customer = await tx.contact.findFirst({ where: { id: customerId, companyId } })
  if (!customer) {
    throw new AppError(400, 'Choose a customer from your contacts.')
  }
  if (!customer.isCustomer) {
    throw new AppError(400, `${customer.name} is not marked as a customer.`)
  }
  return customer
}

function parseValidity(value: string | null): Date | null {
  if (!value) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) {
    throw new AppError(400, 'Validity date is not a real date.')
  }
  return date
}

export async function createOrder(companyId: number, userId: number, input: OrderInput) {
  return prisma.$transaction(async (tx) => {
    await requireCustomer(tx, companyId, input.customerId)
    const lines = await buildLines(tx, companyId, input.lines)
    const totals = sumLines(lines)
    const warehouseId = await resolveWarehouseId(tx, companyId, input.warehouseId)
    return tx.salesOrder.create({
      data: {
        name: await nextOrderName(tx),
        state: 'draft',
        customerId: input.customerId,
        warehouseId,
        companyId,
        dateOrder: new Date(),
        validityDate: parseValidity(input.validityDate),
        ...totals,
        createdById: userId,
        lines: { create: lines },
      },
      include: orderInclude,
    })
  })
}

export async function updateOrder(companyId: number, orderId: number, input: OrderInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id: orderId, companyId } })
    if (!order) throw new AppError(404, 'Order not found.')
    if (!editableStates.has(order.state)) {
      throw new AppError(409, 'Only a draft or sent quotation can be edited.')
    }
    await requireCustomer(tx, companyId, input.customerId)
    const lines = await buildLines(tx, companyId, input.lines)
    const totals = sumLines(lines)
    const warehouseId = await resolveWarehouseId(tx, companyId, input.warehouseId)
    await tx.salesOrderLine.deleteMany({ where: { orderId } })
    return tx.salesOrder.update({
      where: { id: orderId },
      data: {
        customerId: input.customerId,
        warehouseId,
        validityDate: parseValidity(input.validityDate),
        ...totals,
        lines: { create: lines },
      },
      include: orderInclude,
    })
  })
}

export async function markOrderSent(companyId: number, orderId: number) {
  const order = await prisma.salesOrder.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw new AppError(404, 'Order not found.')
  if (order.state !== 'draft') {
    throw new AppError(409, 'Only a draft quotation can be marked sent.')
  }
  return prisma.salesOrder.update({
    where: { id: orderId },
    data: { state: 'sent' },
    include: orderInclude,
  })
}

export async function confirmOrder(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: { include: { product: true } } },
    })
    if (!order) throw new AppError(404, 'Order not found.')
    if (!editableStates.has(order.state)) {
      throw new AppError(409, 'This quotation is already confirmed or closed.')
    }
    if (order.lines.length === 0) {
      throw new AppError(400, 'Add a line before confirming.')
    }

    const locations = await companyLocations(tx, companyId)
    const source = await warehouseStockLocation(tx, companyId, order.warehouseId)
    const needed = new Map<number, { name: string; quantity: number }>()
    for (const line of order.lines) {
      if (line.product.type !== 'product') continue
      const current = needed.get(line.productId)
      needed.set(line.productId, {
        name: line.product.name,
        quantity: roundQty((current?.quantity ?? 0) + line.quantity),
      })
    }

    for (const [productId, need] of needed) {
      const available = await onHand(tx, productId, source.location.id)
      if (available + 0.0001 < need.quantity) {
        throw new AppError(
          409,
          `${need.name} has ${available} on hand and this order needs ${need.quantity}. Adjust stock or lower the quantity.`,
        )
      }
    }

    for (const line of order.lines) {
      if (line.product.type !== 'product') continue
      await tx.stockMove.create({
        data: {
          productId: line.productId,
          locationFromId: source.location.id,
          locationToId: locations.customer.id,
          quantity: line.quantity,
          state: 'draft',
          reference: order.name,
          orderId: order.id,
          date: new Date(),
        },
      })
    }

    return tx.salesOrder.update({
      where: { id: order.id },
      data: { state: 'sale' },
      include: orderInclude,
    })
  })
}

export async function deliverOrder(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, companyId },
      include: { moves: true },
    })
    if (!order) throw new AppError(404, 'Order not found.')
    if (order.state !== 'sale') {
      throw new AppError(409, 'Confirm the quotation before delivering it.')
    }

    const pending = order.moves.filter((move) => move.state === 'draft')
    for (const move of pending) {
      await applyQuant(tx, move.productId, move.locationFromId, -move.quantity)
      await applyQuant(tx, move.productId, move.locationToId, move.quantity)
      await tx.stockMove.update({ where: { id: move.id }, data: { state: 'done', date: new Date() } })
    }

    return tx.salesOrder.update({
      where: { id: order.id },
      data: { state: 'done' },
      include: orderInclude,
    })
  })
}

export async function cancelOrder(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id: orderId, companyId } })
    if (!order) throw new AppError(404, 'Order not found.')
    if (order.state === 'done') {
      throw new AppError(409, 'A delivered order stays on the books. It cannot be cancelled.')
    }
    if (order.state === 'cancel') return tx.salesOrder.findFirstOrThrow({ where: { id: orderId }, include: orderInclude })
    await tx.stockMove.updateMany({
      where: { orderId, state: 'draft' },
      data: { state: 'cancel' },
    })
    return tx.salesOrder.update({
      where: { id: orderId },
      data: { state: 'cancel' },
      include: orderInclude,
    })
  })
}

export async function adjustStock(
  companyId: number,
  productId: number,
  quantityDelta: number,
  note: string,
  locationId?: number | null,
  lotName?: string | null,
) {
  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findFirst({ where: { id: productId, companyId } })
    if (!product) throw new AppError(404, 'Product not found.')
    if (product.type !== 'product') {
      throw new AppError(400, 'Services are not stocked.')
    }
    if (product.tracking !== 'none' && !lotName) {
      throw new AppError(400, `${product.name} needs a lot or serial number.`)
    }
    const locations = await companyLocations(tx, companyId)
    const shelf = locationId
      ? await tx.stockLocation.findFirst({ where: { id: locationId, companyId, type: 'internal' } })
      : locations.internal
    if (!shelf) throw new AppError(400, 'Choose a stock location.')
    const delta = roundQty(quantityDelta)
    const from = delta > 0 ? locations.supplier : shelf
    const to = delta > 0 ? shelf : locations.adjustment
    const quantity = Math.abs(delta)
    await applyQuant(tx, product.id, from.id, -quantity)
    await applyQuant(tx, product.id, to.id, quantity)
    return tx.stockMove.create({
      data: {
        productId: product.id,
        locationFromId: from.id,
        locationToId: to.id,
        quantity,
        state: 'done',
        reference: note,
        lotName: lotName || null,
        date: new Date(),
      },
      include: {
        product: { select: { name: true, sku: true } },
        locationFrom: { select: { name: true, type: true } },
        locationTo: { select: { name: true, type: true } },
      },
    })
  })
}
