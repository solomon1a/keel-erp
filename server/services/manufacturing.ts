import { roundMoney } from '../../src/domain/money.ts'
import type { BomInput, ManufacturingInput, ProduceInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { applyQuant, companyLocations, onHand, resolveWarehouseId, roundQty, warehouseStockLocation } from './stock.ts'
import { valueDoneMove } from './valuation.ts'
import { guardWorkflow } from './workflow.ts'

const orderInclude = {
  product: { select: { id: true, name: true, sku: true, kind: true, costPrice: true } },
  sourceWarehouse: { select: { id: true, name: true, code: true } },
  destWarehouse: { select: { id: true, name: true, code: true } },
  bom: { select: { id: true, yieldQty: true, notes: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, costPrice: true, purchasable: true, kind: true } },
    },
    orderBy: { id: 'asc' as const },
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

const bomInclude = {
  product: { select: { id: true, name: true, sku: true, kind: true, costPrice: true, type: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, costPrice: true, kind: true, type: true, purchasable: true } },
    },
    orderBy: { id: 'asc' as const },
  },
}

type BomCostSource = {
  yieldQty: number
  lines: Array<{ quantity: number; product: { costPrice: number } }>
}

export function bomUnitCost(bom: BomCostSource): number {
  const batch = bom.lines.reduce((sum, line) => sum + line.quantity * line.product.costPrice, 0)
  return roundMoney(batch / bom.yieldQty)
}

async function nextManufacturingName(tx: Tx): Promise<string> {
  const sequence = await tx.sequence.update({
    where: { name: 'manufacturing.order' },
    data: { next: { increment: 1 } },
  })
  return `MO${String(sequence.next).padStart(4, '0')}`
}

async function requireFinished(tx: Tx, companyId: number, productId: number) {
  const product = await tx.product.findFirst({ where: { id: productId, companyId } })
  if (!product) throw new AppError(400, 'Choose a product from this company.')
  if (product.type !== 'product' || product.kind !== 'finished') {
    throw new AppError(400, `${product.name} is not a finished good.`)
  }
  if (!product.active) throw new AppError(400, `${product.name} is archived.`)
  return product
}

async function buildBomLines(tx: Tx, companyId: number, productId: number, lines: BomInput['lines']) {
  const ids = lines.map((line) => line.productId)
  if (new Set(ids).size !== ids.length) {
    throw new AppError(400, 'Each component can appear only once.')
  }
  const products = await tx.product.findMany({ where: { companyId, id: { in: ids } } })
  const byId = new Map(products.map((product) => [product.id, product]))
  return lines.map((line, index) => {
    const component = byId.get(line.productId)
    if (!component) throw new AppError(400, `Line ${index + 1} uses a product that is not in this company.`)
    if (component.id === productId) throw new AppError(400, 'A product cannot be a component of itself.')
    if (component.type !== 'product') throw new AppError(400, `${component.name} is a service and cannot be consumed.`)
    if (!component.active) throw new AppError(400, `${component.name} is archived.`)
    return { productId: component.id, quantity: roundQty(line.quantity) }
  })
}

function presentBom<T extends BomCostSource>(bom: T) {
  return { ...bom, unitCost: bomUnitCost(bom) }
}

export async function listBoms(companyId: number) {
  const rows = await prisma.billOfMaterials.findMany({
    where: { companyId },
    include: bomInclude,
    orderBy: { product: { name: 'asc' } },
  })
  return rows.map(presentBom)
}

export async function getBom(companyId: number, bomId: number) {
  const bom = await prisma.billOfMaterials.findFirst({ where: { id: bomId, companyId }, include: bomInclude })
  if (!bom) throw new AppError(404, 'Bill of materials not found.')
  return presentBom(bom)
}

export async function createBom(companyId: number, input: BomInput) {
  return prisma.$transaction(async (tx) => {
    await requireFinished(tx, companyId, input.productId)
    const lines = await buildBomLines(tx, companyId, input.productId, input.lines)
    try {
      const bom = await tx.billOfMaterials.create({
        data: {
          productId: input.productId,
          companyId,
          yieldQty: roundQty(input.yieldQty),
          notes: input.notes,
          lines: { create: lines },
        },
        include: bomInclude,
      })
      return presentBom(bom)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') {
        throw new AppError(409, 'This product already has a bill of materials.')
      }
      throw error
    }
  })
}

export async function updateBom(companyId: number, bomId: number, input: BomInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.billOfMaterials.findFirst({ where: { id: bomId, companyId } })
    if (!existing) throw new AppError(404, 'Bill of materials not found.')
    await requireFinished(tx, companyId, input.productId)
    if (input.productId !== existing.productId) {
      const taken = await tx.billOfMaterials.findFirst({ where: { productId: input.productId, companyId } })
      if (taken) throw new AppError(409, 'This product already has a bill of materials.')
    }
    const lines = await buildBomLines(tx, companyId, input.productId, input.lines)
    await tx.bomLine.deleteMany({ where: { bomId } })
    const bom = await tx.billOfMaterials.update({
      where: { id: bomId },
      data: {
        productId: input.productId,
        yieldQty: roundQty(input.yieldQty),
        notes: input.notes,
        lines: { create: lines },
      },
      include: bomInclude,
    })
    return presentBom(bom)
  })
}

export async function deleteBom(companyId: number, bomId: number) {
  const existing = await prisma.billOfMaterials.findFirst({
    where: { id: bomId, companyId },
    include: { _count: { select: { orders: true } } },
  })
  if (!existing) throw new AppError(404, 'Bill of materials not found.')
  if (existing._count.orders > 0) {
    throw new AppError(409, 'Manufacturing orders use this bill, so it stays.')
  }
  await prisma.billOfMaterials.delete({ where: { id: bomId } })
}

export async function applyBomCost(companyId: number, bomId: number) {
  const bom = await getBom(companyId, bomId)
  await prisma.product.update({ where: { id: bom.productId }, data: { costPrice: bom.unitCost } })
  return getBom(companyId, bomId)
}

async function componentLines(tx: Tx, companyId: number, productId: number, quantity: number) {
  const bom = await tx.billOfMaterials.findFirst({
    where: { productId, companyId },
    include: { lines: { include: { product: true } } },
  })
  if (!bom) throw new AppError(400, 'Add a bill of materials for this product first.')
  if (bom.lines.length === 0) throw new AppError(400, 'The bill of materials has no components.')
  const made = roundQty(quantity)
  return {
    bom,
    lines: bom.lines.map((line) => ({
      productId: line.productId,
      quantity: roundQty((line.quantity * made) / bom.yieldQty),
    })),
  }
}

async function attachOnHand<T extends { sourceWarehouseId?: number | null; lines: Array<{ productId: number }> }>(companyId: number, order: T) {
  const internal = order.sourceWarehouseId
    ? await prisma.stockLocation.findFirst({
        where: { companyId, warehouseId: order.sourceWarehouseId, type: 'internal' },
        orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
      })
    : await prisma.stockLocation.findFirst({
        where: { companyId, type: 'internal', isDefault: true, warehouse: { isDefault: true } },
      })
  const quants = internal
    ? await prisma.stockQuant.findMany({
        where: { locationId: internal.id, productId: { in: order.lines.map((line) => line.productId) } },
      })
    : []
  const onHandByProduct = new Map(quants.map((quant) => [quant.productId, quant.quantity]))
  return {
    ...order,
    lines: order.lines.map((line) => ({ ...line, onHand: onHandByProduct.get(line.productId) ?? 0 })),
  }
}

export async function getManufacturing(companyId: number, orderId: number) {
  const order = await prisma.manufacturingOrder.findFirst({
    where: { id: orderId, companyId },
    include: orderInclude,
  })
  if (!order) throw new AppError(404, 'Manufacturing order not found.')
  return attachOnHand(companyId, order)
}

export async function createManufacturing(companyId: number, userId: number, input: ManufacturingInput) {
  return prisma.$transaction(async (tx) => {
    await requireFinished(tx, companyId, input.productId)
    const built = await componentLines(tx, companyId, input.productId, input.quantity)
    const sourceWarehouseId = await resolveWarehouseId(tx, companyId, input.sourceWarehouseId)
    const destWarehouseId = await resolveWarehouseId(tx, companyId, input.destWarehouseId)
    const order = await tx.manufacturingOrder.create({
      data: {
        name: await nextManufacturingName(tx),
        state: 'draft',
        productId: input.productId,
        bomId: built.bom.id,
        companyId,
        quantity: roundQty(input.quantity),
        sourceWarehouseId,
        destWarehouseId,
        createdById: userId,
        lines: { create: built.lines },
      },
      include: orderInclude,
    })
    return order
  }).then((order) => attachOnHand(companyId, order))
}

export async function updateManufacturing(companyId: number, orderId: number, input: ManufacturingInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, companyId } })
    if (!order) throw new AppError(404, 'Manufacturing order not found.')
    if (order.state !== 'draft') throw new AppError(409, 'Only a draft manufacturing order can be edited.')
    await requireFinished(tx, companyId, input.productId)
    const built = await componentLines(tx, companyId, input.productId, input.quantity)
    const sourceWarehouseId = await resolveWarehouseId(tx, companyId, input.sourceWarehouseId)
    const destWarehouseId = await resolveWarehouseId(tx, companyId, input.destWarehouseId)
    await tx.manufacturingComponent.deleteMany({ where: { orderId } })
    const updated = await tx.manufacturingOrder.update({
      where: { id: orderId },
      data: {
        productId: input.productId,
        bomId: built.bom.id,
        quantity: roundQty(input.quantity),
        sourceWarehouseId,
        destWarehouseId,
        lines: { create: built.lines },
      },
      include: orderInclude,
    })
    return updated
  }).then((order) => attachOnHand(companyId, order))
}

type Shortage = { productId: number; name: string; onHand: number; needed: number }

async function shortagesFor(
  tx: Tx,
  locationId: number,
  needs: Array<{ productId: number; name: string; quantity: number }>,
): Promise<Shortage[]> {
  const shortages: Shortage[] = []
  for (const need of needs) {
    const available = await onHand(tx, need.productId, locationId)
    if (available + 0.0001 < need.quantity) {
      shortages.push({ productId: need.productId, name: need.name, onHand: available, needed: need.quantity })
    }
  }
  return shortages
}

function refuseShortages(shortages: Shortage[]): never {
  const message = shortages
    .map((row) => `${row.name} has ${row.onHand} on hand and this order needs ${row.needed}.`)
    .join(' ')
  throw new AppError(409, message, { shortages })
}

export async function confirmManufacturing(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: { include: { product: true } } },
    })
    if (!order) throw new AppError(404, 'Manufacturing order not found.')
    if (order.state !== 'draft') throw new AppError(409, 'Only a draft manufacturing order can be confirmed.')
    const source = await warehouseStockLocation(tx, companyId, order.sourceWarehouseId)
    const shortages = await shortagesFor(
      tx,
      source.location.id,
      order.lines.map((line) => ({ productId: line.productId, name: line.product.name, quantity: line.quantity })),
    )
    if (shortages.length > 0) refuseShortages(shortages)
    await guardWorkflow(tx, {
      companyId,
      model: 'mrp.order',
      recordId: order.id,
      from: order.state,
      to: 'confirmed',
      label: order.name,
    })
    return tx.manufacturingOrder.update({
      where: { id: order.id },
      data: { state: 'confirmed' },
      include: orderInclude,
    })
  }).then((order) => attachOnHand(companyId, order))
}

export async function startManufacturing(companyId: number, orderId: number) {
  const order = await prisma.manufacturingOrder.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw new AppError(404, 'Manufacturing order not found.')
  if (order.state !== 'confirmed') throw new AppError(409, 'Confirm the order before starting it.')
  const updated = await prisma.$transaction(async (tx) => {
    await guardWorkflow(tx, {
      companyId,
      model: 'mrp.order',
      recordId: order.id,
      from: order.state,
      to: 'progress',
      label: order.name,
    })
    return tx.manufacturingOrder.update({
    where: { id: orderId },
    data: { state: 'progress' },
    include: orderInclude,
  })
  })
  return attachOnHand(companyId, updated)
}

export async function produceManufacturing(companyId: number, orderId: number, input: ProduceInput) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: { include: { product: true } }, product: true },
    })
    if (!order) throw new AppError(404, 'Manufacturing order not found.')
    if (order.state !== 'progress') throw new AppError(409, 'Start the order before producing.')
    const remaining = roundQty(order.quantity - order.quantityDone)
    const producing = roundQty(input.quantity ?? remaining)
    if (producing <= 0) throw new AppError(400, 'Quantity must be greater than zero.')
    if (producing - remaining > 0.0001) {
      throw new AppError(400, `Only ${remaining} remains on this order.`)
    }
    const finishes = Math.abs(producing - remaining) < 0.0001
    const takes = order.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      name: line.product.name,
      quantity: finishes ? roundQty(line.quantity - line.consumed) : roundQty((line.quantity * producing) / order.quantity),
    }))
    const source = await warehouseStockLocation(tx, companyId, order.sourceWarehouseId)
    const destination = await warehouseStockLocation(tx, companyId, order.destWarehouseId)
    const shortages = await shortagesFor(tx, source.location.id, takes.filter((take) => take.quantity > 0))
    if (shortages.length > 0) refuseShortages(shortages)

    const locations = await companyLocations(tx, companyId)
    for (const take of takes) {
      if (take.quantity <= 0) continue
      await applyQuant(tx, take.productId, source.location.id, -take.quantity)
      await applyQuant(tx, take.productId, locations.production.id, take.quantity)
      const consumed = await tx.stockMove.create({
        data: {
          productId: take.productId,
          locationFromId: source.location.id,
          locationToId: locations.production.id,
          quantity: take.quantity,
          state: 'done',
          reference: order.name,
          manufacturingOrderId: order.id,
          date: new Date(),
        },
      })
      await valueDoneMove(tx, companyId, consumed.id)
      await tx.manufacturingComponent.update({
        where: { id: take.id },
        data: { consumed: { increment: take.quantity } },
      })
    }
    await applyQuant(tx, order.productId, locations.production.id, -producing)
    await applyQuant(tx, order.productId, destination.location.id, producing)
    const finished = await tx.stockMove.create({
      data: {
        productId: order.productId,
        locationFromId: locations.production.id,
        locationToId: destination.location.id,
        quantity: producing,
        state: 'done',
        reference: order.name,
        manufacturingOrderId: order.id,
        date: new Date(),
      },
    })
    await valueDoneMove(tx, companyId, finished.id)
    const next = finishes ? 'done' : 'progress'
    await guardWorkflow(tx, {
      companyId,
      model: 'mrp.order',
      recordId: order.id,
      from: order.state,
      to: next,
      label: order.name,
    })
    return tx.manufacturingOrder.update({
      where: { id: order.id },
      data: {
        quantityDone: roundQty(order.quantityDone + producing),
        state: next,
      },
      include: orderInclude,
    })
  }).then((order) => attachOnHand(companyId, order))
}

export async function cancelManufacturing(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, companyId } })
    if (!order) throw new AppError(404, 'Manufacturing order not found.')
    if (order.state === 'done') {
      throw new AppError(409, 'A finished manufacturing order stays on the books. It cannot be cancelled.')
    }
    if (order.quantityDone > 0.0001) {
      throw new AppError(409, 'Some goods are already produced, so this order cannot be cancelled.')
    }
    if (order.state === 'cancel') {
      return tx.manufacturingOrder.findFirstOrThrow({ where: { id: orderId }, include: orderInclude })
    }
    await guardWorkflow(tx, {
      companyId,
      model: 'mrp.order',
      recordId: order.id,
      from: order.state,
      to: 'cancel',
      label: order.name,
    })
    return tx.manufacturingOrder.update({
      where: { id: orderId },
      data: { state: 'cancel' },
      include: orderInclude,
    })
  }).then((order) => attachOnHand(companyId, order))
}
