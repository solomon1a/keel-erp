import { roundMoney } from '../../src/domain/money.ts'
import type { BomInput, ManufacturingInput, ProduceInput } from '../../shared/schemas.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { applyQuant, companyLocations, onHand, resolveWarehouseId, roundQty, warehouseStockLocation } from './stock.ts'
import { postValuationJournal, valueDoneMove } from './valuation.ts'
import { guardWorkflow } from './workflow.ts'

const orderInclude = {
  product: { select: { id: true, name: true, sku: true, kind: true, costPrice: true } },
  sourceWarehouse: { select: { id: true, name: true, code: true } },
  destWarehouse: { select: { id: true, name: true, code: true } },
  bom: { select: { id: true, yieldQty: true, version: true, notes: true } },
  wipWarehouse: { select: { id: true, name: true, code: true } },
  scrapWarehouse: { select: { id: true, name: true, code: true } },
  salesOrder: { select: { id: true, name: true, state: true } },
  materialRequest: { select: { id: true, name: true, state: true } },
  supplier: { select: { id: true, name: true } },
  jobCards: {
    include: {
      workstation: { select: { id: true, name: true, hourRate: true } },
      logs: { orderBy: { id: 'asc' as const } },
    },
    orderBy: { sequence: 'asc' as const },
  },
  wastage: { orderBy: { id: 'desc' as const }, take: 30 },
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
  operations: {
    include: { workstation: { select: { id: true, name: true, hourRate: true } } },
    orderBy: { sequence: 'asc' as const },
  },
  byproducts: {
    include: { product: { select: { id: true, name: true, sku: true, costPrice: true } } },
  },
  orders: { select: { id: true, name: true, state: true }, orderBy: { id: 'asc' as const } },
}

type BomCostSource = {
  id?: number
  productId?: number
  yieldQty: number
  active?: boolean
  lines: Array<{ quantity: number; lossPercent?: number; productId?: number; product: { costPrice: number } }>
  operations?: Array<{ hours: number; lossPercent?: number; workstation?: { hourRate: number } | null }>
  byproducts?: Array<{ quantity: number; product: { costPrice: number } }>
}

export type BomRollup = { material: number; operating: number; byproduct: number; unitCost: number }

export function bomUnitCost(bom: BomCostSource): number {
  return rollupBoms([bom]).get(bom.id ?? 0)?.unitCost ?? 0
}

export function rollupBoms(boms: BomCostSource[]): Map<number, BomRollup> {
  const activeByProduct = new Map<number, BomCostSource>()
  for (const bom of boms) {
    if (bom.active === false || bom.productId == null) continue
    const current = activeByProduct.get(bom.productId)
    if (!current || (bom.id ?? 0) > (current.id ?? 0)) activeByProduct.set(bom.productId, bom)
  }
  const memo = new Map<number, BomRollup>()
  const visiting = new Set<number>()
  function visit(bom: BomCostSource): BomRollup {
    const key = bom.id ?? 0
    const cached = memo.get(key)
    if (cached) return cached
    if (visiting.has(key)) return { material: 0, operating: 0, byproduct: 0, unitCost: 0 }
    visiting.add(key)
    const yieldQty = bom.yieldQty || 1
    let materialBatch = 0
    for (const line of bom.lines) {
      const child = line.productId != null ? activeByProduct.get(line.productId) : undefined
      const unit = child && child !== bom ? visit(child).unitCost : line.product.costPrice
      materialBatch += line.quantity * (1 + (line.lossPercent ?? 0) / 100) * unit
    }
    let operatingBatch = 0
    for (const operation of bom.operations ?? []) {
      operatingBatch += operation.hours * (operation.workstation?.hourRate ?? 0) * (1 + (operation.lossPercent ?? 0) / 100)
    }
    let byproductBatch = 0
    for (const byproduct of bom.byproducts ?? []) byproductBatch += byproduct.quantity * byproduct.product.costPrice
    const result = {
      material: roundMoney(materialBatch / yieldQty),
      operating: roundMoney(operatingBatch / yieldQty),
      byproduct: roundMoney(byproductBatch / yieldQty),
      unitCost: roundMoney(Math.max(0, (materialBatch + operatingBatch - byproductBatch) / yieldQty)),
    }
    memo.set(key, result)
    visiting.delete(key)
    return result
  }
  for (const bom of boms) visit(bom)
  return memo
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
    return { productId: component.id, quantity: roundQty(line.quantity), lossPercent: line.lossPercent ?? 0 }
  })
}

async function operationRows(tx: Tx, companyId: number, operations: NonNullable<BomInput['operations']>) {
  const ids = operations.map((row) => row.workstationId)
  const stations = await tx.workstation.findMany({ where: { companyId, id: { in: ids } } })
  const known = new Set(stations.map((row) => row.id))
  return operations.map((row, index) => {
    if (!known.has(row.workstationId)) throw new AppError(400, `Operation ${index + 1} uses an unknown workstation.`)
    return {
      sequence: row.sequence ?? index + 1,
      name: row.name,
      workstationId: row.workstationId,
      hours: row.hours,
      lossPercent: row.lossPercent ?? 0,
    }
  })
}

function presentBom<T extends BomCostSource>(bom: T, costs: Map<number, BomRollup>) {
  const cost = costs.get(bom.id ?? 0) ?? { material: 0, operating: 0, byproduct: 0, unitCost: 0 }
  return { ...bom, ...cost }
}

export async function listBoms(companyId: number) {
  const rows = await prisma.billOfMaterials.findMany({
    where: { companyId },
    include: bomInclude,
    orderBy: [{ product: { name: 'asc' } }, { version: 'desc' }],
  })
  const costs = rollupBoms(rows)
  return rows.map((row) => presentBom(row, costs))
}

export async function getBom(companyId: number, bomId: number) {
  const rows = await prisma.billOfMaterials.findMany({ where: { companyId }, include: bomInclude })
  const bom = rows.find((row) => row.id === bomId)
  if (!bom) throw new AppError(404, 'Bill of materials not found.')
  return presentBom(bom, rollupBoms(rows))
}

export async function createBom(companyId: number, input: BomInput) {
  return prisma.$transaction(async (tx) => {
    await requireFinished(tx, companyId, input.productId)
    const taken = await tx.billOfMaterials.findFirst({ where: { productId: input.productId, companyId, active: true } })
    if (taken) throw new AppError(409, 'This product already has a bill of materials.')
    const lines = await buildBomLines(tx, companyId, input.productId, input.lines)
    const operations = input.operations ? await operationRows(tx, companyId, input.operations) : []
    try {
      const bom = await tx.billOfMaterials.create({
        data: {
          productId: input.productId,
          companyId,
          yieldQty: roundQty(input.yieldQty),
          notes: input.notes,
          lines: { create: lines },
          operations: { create: operations },
          byproducts: { create: (input.byproducts ?? []).map((row) => ({ productId: row.productId, quantity: roundQty(row.quantity) })) },
        },
        include: bomInclude,
      })
      const rows = await tx.billOfMaterials.findMany({ where: { companyId }, include: bomInclude })
      return presentBom(bom, rollupBoms(rows))
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
      const taken = await tx.billOfMaterials.findFirst({ where: { productId: input.productId, companyId, active: true, NOT: { id: bomId } } })
      if (taken) throw new AppError(409, 'This product already has a bill of materials.')
    }
    const lines = await buildBomLines(tx, companyId, input.productId, input.lines)
    const operations = input.operations ? await operationRows(tx, companyId, input.operations) : null
    await tx.bomLine.deleteMany({ where: { bomId } })
    if (operations) await tx.bomOperation.deleteMany({ where: { bomId } })
    if (input.byproducts) await tx.bomByproduct.deleteMany({ where: { bomId } })
    const bom = await tx.billOfMaterials.update({
      where: { id: bomId },
      data: {
        productId: input.productId,
        yieldQty: roundQty(input.yieldQty),
        notes: input.notes,
        lines: { create: lines },
        ...(operations ? { operations: { create: operations } } : {}),
        ...(input.byproducts ? { byproducts: { create: input.byproducts.map((row) => ({ productId: row.productId, quantity: roundQty(row.quantity) })) } } : {}),
      },
      include: bomInclude,
    })
    const rows = await tx.billOfMaterials.findMany({ where: { companyId }, include: bomInclude })
    return presentBom(bom, rollupBoms(rows))
  })
}

export async function reviseBom(companyId: number, bomId: number) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.billOfMaterials.findFirst({
      where: { id: bomId, companyId },
      include: { lines: true, operations: true, byproducts: true },
    })
    if (!existing) throw new AppError(404, 'Bill of materials not found.')
    await tx.billOfMaterials.updateMany({ where: { companyId, productId: existing.productId, active: true }, data: { active: false } })
    const bom = await tx.billOfMaterials.create({
      data: {
        productId: existing.productId,
        companyId,
        yieldQty: existing.yieldQty,
        version: existing.version + 1,
        active: true,
        notes: existing.notes,
        lines: { create: existing.lines.map((line) => ({ productId: line.productId, quantity: line.quantity, lossPercent: line.lossPercent })) },
        operations: { create: existing.operations.map((row) => ({ sequence: row.sequence, name: row.name, workstationId: row.workstationId, hours: row.hours, lossPercent: row.lossPercent })) },
        byproducts: { create: existing.byproducts.map((row) => ({ productId: row.productId, quantity: row.quantity })) },
      },
      include: bomInclude,
    })
    const rows = await tx.billOfMaterials.findMany({ where: { companyId }, include: bomInclude })
    return presentBom(bom, rollupBoms(rows))
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
    where: { productId, companyId, active: true },
    orderBy: { version: 'desc' },
    include: { lines: { include: { product: true } } },
  })
  if (!bom) throw new AppError(400, 'Add a bill of materials for this product first.')
  if (bom.lines.length === 0) throw new AppError(400, 'The bill of materials has no components.')
  const made = roundQty(quantity)
  return {
    bom,
    lines: bom.lines.map((line) => ({
      productId: line.productId,
      quantity: roundQty((line.quantity * (1 + line.lossPercent / 100) * made) / bom.yieldQty),
      lossPercent: line.lossPercent,
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
        purpose: input.purpose ?? 'stock',
        salesOrderId: input.salesOrderId,
        materialRequestId: input.materialRequestId,
        supplierId: input.supplierId,
        sourceWarehouseId,
        destWarehouseId,
        wipWarehouseId: input.wipWarehouseId,
        scrapWarehouseId: input.scrapWarehouseId,
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
        purpose: input.purpose ?? order.purpose,
        salesOrderId: input.salesOrderId ?? order.salesOrderId,
        materialRequestId: input.materialRequestId ?? order.materialRequestId,
        supplierId: input.supplierId ?? order.supplierId,
        sourceWarehouseId,
        destWarehouseId,
        wipWarehouseId: input.wipWarehouseId ?? order.wipWarehouseId,
        scrapWarehouseId: input.scrapWarehouseId ?? order.scrapWarehouseId,
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
    await openJobCards(tx, companyId, order.id, order.bomId, order.quantity)
    return tx.manufacturingOrder.update({
      where: { id: order.id },
      data: { state: 'confirmed' },
      include: orderInclude,
    })
  }).then((order) => attachOnHand(companyId, order))
}

async function openJobCards(tx: Tx, companyId: number, orderId: number, bomId: number, quantity: number) {
  const existing = await tx.jobCard.count({ where: { orderId } })
  if (existing > 0) return
  const operations = await tx.bomOperation.findMany({ where: { bomId }, orderBy: { sequence: 'asc' } })
  const name = `job.card.${companyId}`
  for (const operation of operations) {
    await tx.sequence.upsert({ where: { name }, update: {}, create: { name, next: 0 } })
    const sequence = await tx.sequence.update({ where: { name }, data: { next: { increment: 1 } } })
    await tx.jobCard.create({
      data: {
        companyId,
        orderId,
        name: `JC${String(sequence.next).padStart(4, '0')}`,
        sequence: operation.sequence,
        operationName: operation.name,
        workstationId: operation.workstationId,
        plannedQty: quantity,
        status: 'pending',
      },
    })
  }
}

export async function startManufacturing(companyId: number, orderId: number) {
  const order = await prisma.manufacturingOrder.findFirst({
    where: { id: orderId, companyId },
    include: { lines: true },
  })
  if (!order) throw new AppError(404, 'Manufacturing order not found.')
  if (order.state !== 'confirmed' && order.state !== 'stopped') {
    throw new AppError(409, 'Confirm the order before starting it.')
  }
  const updated = await prisma.$transaction(async (tx) => {
    if (order.wipWarehouseId && !order.transferred && order.state === 'confirmed') {
      const source = await warehouseStockLocation(tx, companyId, order.sourceWarehouseId)
      const wip = await warehouseStockLocation(tx, companyId, order.wipWarehouseId)
      const shortages = await shortagesFor(
        tx,
        source.location.id,
        order.lines.map((line) => ({ productId: line.productId, name: `Component ${line.productId}`, quantity: roundQty(line.quantity - line.consumed) })),
      )
      if (shortages.length > 0) {
        const named = await tx.product.findMany({ where: { id: { in: shortages.map((row) => row.productId) } }, select: { id: true, name: true } })
        const names = new Map(named.map((row) => [row.id, row.name]))
        refuseShortages(shortages.map((row) => ({ ...row, name: names.get(row.productId) ?? row.name })))
      }
      for (const line of order.lines) {
        const quantity = roundQty(line.quantity - line.consumed)
        if (quantity <= 0) continue
        await applyQuant(tx, line.productId, source.location.id, -quantity)
        await applyQuant(tx, line.productId, wip.location.id, quantity)
        await tx.stockMove.create({
          data: {
            productId: line.productId,
            locationFromId: source.location.id,
            locationToId: wip.location.id,
            quantity,
            state: 'done',
            reference: `${order.name} WIP`,
            manufacturingOrderId: order.id,
            date: new Date(),
          },
        })
      }
    }
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
      data: { state: 'progress', transferred: order.wipWarehouseId ? true : order.transferred },
      include: orderInclude,
    })
  })
  return attachOnHand(companyId, updated)
}

export async function stopManufacturing(companyId: number, orderId: number) {
  const order = await prisma.manufacturingOrder.findFirst({ where: { id: orderId, companyId } })
  if (!order) throw new AppError(404, 'Manufacturing order not found.')
  if (order.state !== 'progress') throw new AppError(409, 'Only an order in process can be stopped.')
  const updated = await prisma.$transaction(async (tx) => {
    await guardWorkflow(tx, { companyId, model: 'mrp.order', recordId: order.id, from: order.state, to: 'stopped', label: order.name })
    return tx.manufacturingOrder.update({ where: { id: order.id }, data: { state: 'stopped' }, include: orderInclude })
  })
  return attachOnHand(companyId, updated)
}

async function operatingToAbsorb(tx: Tx, orderId: number, absorbed: number) {
  const logs = await tx.jobTimeLog.findMany({
    where: { jobCard: { orderId } },
    include: { jobCard: { include: { workstation: true } } },
  })
  const total = roundMoney(logs.reduce((sum, log) => sum + (log.minutes / 60) * (log.jobCard.workstation?.hourRate ?? 0), 0))
  return roundMoney(Math.max(0, total - absorbed))
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
    const source = await warehouseStockLocation(tx, companyId, order.transferred ? order.wipWarehouseId : order.sourceWarehouseId)
    const destination = await warehouseStockLocation(tx, companyId, order.destWarehouseId)
    const shortages = await shortagesFor(tx, source.location.id, takes.filter((take) => take.quantity > 0))
    if (shortages.length > 0) refuseShortages(shortages)

    const locations = await companyLocations(tx, companyId)
    const consumedIds: number[] = []
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
      consumedIds.push(consumed.id)
      await tx.manufacturingComponent.update({
        where: { id: take.id },
        data: { consumed: { increment: take.quantity } },
      })
    }
    const ledgers = consumedIds.length === 0 ? [] : await tx.stockLedger.findMany({ where: { moveId: { in: consumedIds } } })
    const material = roundMoney(ledgers.reduce((sum, row) => sum + -row.value, 0))
    const operating = await operatingToAbsorb(tx, order.id, order.operatingAbsorbed)
    if (operating > 0.0001) {
      await postValuationJournal(tx, companyId, new Date(), `${order.name} labour`, '1407', '2211', operating)
    }
    const recipe = await tx.billOfMaterials.findFirst({ where: { id: order.bomId }, include: { byproducts: { include: { product: true } } } })
    let byproductValue = 0
    for (const byproduct of recipe?.byproducts ?? []) {
      const qty = roundQty((byproduct.quantity * producing) / (recipe?.yieldQty || 1))
      if (qty <= 0) continue
      const unit = roundMoney(byproduct.product.costPrice)
      byproductValue = roundMoney(byproductValue + unit * qty)
      await applyQuant(tx, byproduct.productId, locations.production.id, -qty)
      await applyQuant(tx, byproduct.productId, destination.location.id, qty)
      const side = await tx.stockMove.create({
        data: {
          productId: byproduct.productId,
          locationFromId: locations.production.id,
          locationToId: destination.location.id,
          quantity: qty,
          state: 'done',
          reference: `${order.name} by-product`,
          manufacturingOrderId: order.id,
          unitCost: unit,
          date: new Date(),
        },
      })
      await valueDoneMove(tx, companyId, side.id)
    }
    const fgValue = roundMoney(material + operating - order.relieved - byproductValue)
    if (fgValue < -0.001) throw new AppError(409, 'Wastage is more than the cost absorbed so far.')
    const unitCost = producing > 0 ? roundMoney(Math.max(0, fgValue) / producing) : 0
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
        unitCost,
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
        relieved: 0,
        operatingAbsorbed: roundMoney(order.operatingAbsorbed + operating),
      },
      include: orderInclude,
    })
  }, transactionOptions).then((order) => attachOnHand(companyId, order))
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
