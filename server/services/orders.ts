import type { OrderInput } from '../../shared/schemas.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { namedUserId, readSetting } from './company-settings.ts'
import { clearTaxes, heldTotal, priceCommercial, rememberTaxes } from './document-tax.ts'
import { allocateKnown } from './number-series.ts'
import { assertQualityClear, ensureQualityChecks, prepareQualityChecks } from './quality.ts'
import { applyQuant, companyLocations, onHand, resolveWarehouseId, roundQty } from './stock.ts'
import { assertCreditLimit, recordDelivery } from './trade.ts'
import { valueDoneMove } from './valuation.ts'
import { guardWorkflow } from './workflow.ts'

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

async function buildLines(tx: Tx, companyId: number, partnerId: number, lines: OrderInput['lines']) {
  const products = await tx.product.findMany({
    where: { companyId, id: { in: lines.map((line) => line.productId) } },
  })
  const taxes = await tx.tax.findMany()
  const productById = new Map(products.map((product) => [product.id, product]))
  const taxById = new Map(taxes.map((tax) => [tax.id, tax]))
  const built = []
  for (const [index, line] of lines.entries()) {
    const product = productById.get(line.productId)
    if (!product) {
      throw new AppError(400, `Line ${index + 1} uses a product that is not in this company.`)
    }
    const tax = line.taxId ? taxById.get(line.taxId) : undefined
    if (line.taxId && !tax && !line.taxGroupId) {
      throw new AppError(400, `Line ${index + 1} uses an unknown tax.`)
    }
    const priced = await priceCommercial(
      tx,
      companyId,
      partnerId,
      line.quantity,
      line.unitPrice,
      line.discount,
      line.taxGroupId,
      line.taxGroupId ? 0 : tax?.rate ?? 0,
    )
    built.push({
      productId: product.id,
      description: product.name,
      quantity: roundQty(line.quantity),
      unitPrice: line.unitPrice,
      discount: line.discount,
      taxId: line.taxGroupId ? null : tax?.id ?? null,
      taxGroupId: line.taxGroupId ?? null,
      subtotal: priced.subtotal,
      taxAmount: priced.taxAmount,
      withheld: priced.withheld,
      slices: priced.slices,
    })
  }
  return built
}

function storedOrderLine(line: Awaited<ReturnType<typeof buildLines>>[number]) {
  return {
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discount: line.discount,
    taxId: line.taxId,
    taxGroupId: line.taxGroupId,
    subtotal: line.subtotal,
    taxAmount: line.taxAmount,
  }
}

async function stampOrderTaxes(tx: Tx, companyId: number, lines: Awaited<ReturnType<typeof buildLines>>, saved: Array<{ id: number }>) {
  const ordered = [...saved].sort((left, right) => left.id - right.id)
  for (let index = 0; index < lines.length; index += 1) {
    const source = lines[index]
    const row = ordered[index]
    if (source && row && source.slices.length > 0) await rememberTaxes(tx, companyId, 'sale.order.line', row.id, source.slices)
  }
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

async function resolveValidity(tx: Tx, companyId: number, value: string | null) {
  const explicit = parseValidity(value)
  if (explicit) return explicit
  const raw = Number(await readSetting(tx, companyId, 'sales', 'validity', '30'))
  const days = Number.isFinite(raw) ? Math.max(0, Math.round(raw)) : 30
  const today = new Date()
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days))
}

export async function createOrder(companyId: number, userId: number, input: OrderInput) {
  return prisma.$transaction(async (tx) => {
    await requireCustomer(tx, companyId, input.customerId)
    const lines = await buildLines(tx, companyId, input.customerId, input.lines)
    const totals = heldTotal(lines)
    const warehouseId = await resolveWarehouseId(tx, companyId, input.warehouseId)
    const team = await readSetting(tx, companyId, 'sales', 'team', 'Direct')
    const owner = await namedUserId(tx, companyId, team)
    const online = await readSetting(tx, companyId, 'sales', 'online', 'off')
    const order = await tx.salesOrder.create({
      data: {
        name: await allocateKnown(tx, companyId, 'sales.order'),
        state: 'draft',
        customerId: input.customerId,
        warehouseId,
        companyId,
        dateOrder: new Date(),
        validityDate: await resolveValidity(tx, companyId, input.validityDate),
        onlinePay: online === 'on',
        ...totals,
        createdById: owner ?? userId,
        lines: { create: lines.map(storedOrderLine) },
      },
      include: orderInclude,
    })
    await stampOrderTaxes(tx, companyId, lines, order.lines)
    return order
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
    const lines = await buildLines(tx, companyId, input.customerId, input.lines)
    const totals = heldTotal(lines)
    const warehouseId = await resolveWarehouseId(tx, companyId, input.warehouseId)
    const online = await readSetting(tx, companyId, 'sales', 'online', 'off')
    const previous = await tx.salesOrderLine.findMany({ where: { orderId }, select: { id: true } })
    await clearTaxes(tx, companyId, 'sale.order.line', previous.map((row) => row.id))
    await tx.salesOrderLine.deleteMany({ where: { orderId } })
    const updated = await tx.salesOrder.update({
      where: { id: orderId },
      data: {
        customerId: input.customerId,
        warehouseId,
        validityDate: await resolveValidity(tx, companyId, input.validityDate),
        onlinePay: online === 'on',
        ...totals,
        lines: { create: lines.map(storedOrderLine) },
      },
      include: orderInclude,
    })
    await stampOrderTaxes(tx, companyId, lines, updated.lines)
    return updated
  })
}

export async function markOrderSent(companyId: number, orderId: number) {
  const order = await prisma.salesOrder.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw new AppError(404, 'Order not found.')
  if (order.state !== 'draft') {
    throw new AppError(409, 'Only a draft quotation can be marked sent.')
  }
  return prisma.$transaction(async (tx) => {
    await guardWorkflow(tx, {
      companyId,
      model: 'sale.order',
      recordId: order.id,
      from: order.state,
      to: 'sent',
      label: order.name,
    })
    return tx.salesOrder.update({
    where: { id: orderId },
    data: { state: 'sent' },
    include: orderInclude,
  })
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
    await assertCreditLimit(tx, companyId, order.customerId, order.amountTotal)

    const sourceWarehouseId = order.warehouseId ?? (await resolveWarehouseId(tx, companyId, null))
    const rows = await tx.stockLocation.findMany({
      where: {
        companyId,
        OR: [{ warehouseId: null }, { warehouseId: sourceWarehouseId, type: 'internal' }],
      },
      orderBy: { id: 'asc' },
    })
    const customer = rows.find((row) => row.warehouseId == null && row.type === 'customer')
    const supplier = rows.find((row) => row.warehouseId == null && row.type === 'supplier')
    const adjustment = rows.find((row) => row.warehouseId == null && row.type === 'inventory')
    const production = rows.find((row) => row.warehouseId == null && row.type === 'production')
    if (!customer || !supplier || !adjustment || !production) {
      throw new AppError(500, 'Stock locations are not set up for this company.')
    }
    const shelves = rows.filter((row) => row.warehouseId === sourceWarehouseId && row.type === 'internal')
    const shelf = shelves.find((row) => row.isDefault) ?? shelves[0]
    if (!shelf) {
      const warehouse = await tx.warehouse.findFirst({ where: { id: sourceWarehouseId } })
      throw new AppError(400, `${warehouse?.name ?? 'Warehouse'} has no stock location.`)
    }

    const needed = new Map<number, { name: string; quantity: number }>()
    for (const line of order.lines) {
      if (line.product.type !== 'product') continue
      const current = needed.get(line.productId)
      needed.set(line.productId, {
        name: line.product.name,
        quantity: roundQty((current?.quantity ?? 0) + line.quantity),
      })
    }

    if (needed.size > 0) {
      const quants = await tx.stockQuant.findMany({
        where: { locationId: shelf.id, productId: { in: [...needed.keys()] } },
      })
      const availableByProduct = new Map(quants.map((quant) => [quant.productId, quant.quantity]))
      for (const [productId, need] of needed) {
        const available = availableByProduct.get(productId) ?? 0
        if (available + 0.0001 < need.quantity) {
          throw new AppError(
            409,
            `${need.name} has ${available} on hand and this order needs ${need.quantity}. Adjust stock or lower the quantity.`,
          )
        }
      }
    }

    const stocked = order.lines.filter((line) => line.product.type === 'product')
    const services = order.lines.filter((line) => line.product.type !== 'product')
    if (stocked.length > 0) {
      const postedAt = new Date()
      await tx.stockMove.createMany({
        data: stocked.map((line) => ({
          productId: line.productId,
          locationFromId: shelf.id,
          locationToId: customer.id,
          quantity: line.quantity,
          state: 'draft',
          reference: order.name,
          orderId: order.id,
          date: postedAt,
        })),
      })
    }
    for (const line of services) {
      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { qtyDelivered: line.quantity },
      })
    }

    await ensureQualityChecks(tx, companyId, {
      trigger: 'delivery',
      productIds: stocked.map((line) => line.productId),
      salesOrderId: order.id,
      quantity: stocked.reduce((sum, line) => sum + line.quantity, 0),
    })
    await guardWorkflow(tx, {
      companyId,
      model: 'sale.order',
      recordId: order.id,
      from: order.state,
      to: 'sale',
      label: order.name,
    })
    return tx.salesOrder.update({
      where: { id: order.id },
      data: { state: 'sale' },
      include: orderInclude,
    })
  }, transactionOptions)
}

export async function deliverOrder(companyId: number, orderId: number) {
  await prepareQualityChecks(companyId, { trigger: 'delivery', productIds: [], salesOrderId: orderId })
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, companyId },
      include: { moves: true },
    })
    if (!order) throw new AppError(404, 'Order not found.')
    if (order.state !== 'sale') {
      throw new AppError(409, 'Confirm the quotation before delivering it.')
    }
    await assertQualityClear(tx, companyId, { trigger: 'delivery', productIds: [], salesOrderId: order.id })
    await guardWorkflow(tx, {
      companyId,
      model: 'sale.order',
      recordId: order.id,
      from: order.state,
      to: 'done',
      label: order.name,
    })

    const pending = order.moves.filter((move) => move.state === 'draft')
    const completed: Array<{ id: number; productId: number; quantity: number }> = []
    for (const move of pending) {
      await applyQuant(tx, move.productId, move.locationFromId, -move.quantity)
      await applyQuant(tx, move.productId, move.locationToId, move.quantity)
      const done = await tx.stockMove.update({ where: { id: move.id }, data: { state: 'done', date: new Date() } })
      await valueDoneMove(tx, companyId, done.id)
      completed.push({ id: done.id, productId: done.productId, quantity: done.quantity })
    }
    await recordDelivery(tx, companyId, order.id, completed)

    return tx.salesOrder.update({
      where: { id: order.id },
      data: { state: 'done' },
      include: orderInclude,
    })
  }, transactionOptions)
}

export async function cancelOrder(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({ where: { id: orderId, companyId } })
    if (!order) throw new AppError(404, 'Order not found.')
    if (order.state === 'done') {
      throw new AppError(409, 'A delivered order stays on the books. It cannot be cancelled.')
    }
    if (order.state === 'cancel') return tx.salesOrder.findFirstOrThrow({ where: { id: orderId }, include: orderInclude })
    await guardWorkflow(tx, {
      companyId,
      model: 'sale.order',
      recordId: order.id,
      from: order.state,
      to: 'cancel',
      label: order.name,
    })
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

export async function countStock(companyId: number, productId: number, locationId: number, counted: number) {
  const current = await prisma.$transaction((tx) => onHand(tx, productId, locationId))
  const delta = roundQty(counted - current)
  if (Math.abs(delta) <= 0.0001) return { delta: 0, onHand: current }
  const move = await adjustStock(companyId, productId, delta, 'Stock count', locationId, null)
  return { delta, onHand: counted, moveId: move.id }
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
    const move = await tx.stockMove.create({
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
    await valueDoneMove(tx, companyId, move.id)
    return move
  })
}
