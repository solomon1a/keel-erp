import { roundMoney } from '../../src/domain/money.ts'
import type { LocationInput, ReorderRuleInput, TransferInput, WarehouseInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { readSetting } from './company-settings.ts'
import { allocateKnown } from './number-series.ts'
import { applyQuant, onHand, roundQty } from './stock.ts'
import { valueDoneMove } from './valuation.ts'
import { guardWorkflow } from './workflow.ts'

const transferInclude = {
  locationFrom: { select: { id: true, name: true, type: true, warehouse: { select: { id: true, name: true } } } },
  locationTo: { select: { id: true, name: true, type: true, warehouse: { select: { id: true, name: true } } } },
  lines: {
    include: { product: { select: { id: true, name: true, sku: true, tracking: true } } },
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
  route: { select: { id: true, name: true, kind: true, steps: true } },
}

async function nextTransferName(tx: Tx, companyId: number): Promise<string> {
  return allocateKnown(tx, companyId, 'stock.transfer')
}

function cleanCode(code: string) {
  return code.trim().toUpperCase()
}

export async function listWarehouses(companyId: number) {
  return prisma.warehouse.findMany({
    where: { companyId },
    include: { locations: { orderBy: { name: 'asc' } } },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  })
}

export async function createWarehouse(companyId: number, input: WarehouseInput) {
  const count = await prisma.warehouse.count({ where: { companyId } })
  const isDefault = input.isDefault ?? count === 0
  return prisma.$transaction(async (tx) => {
    if (isDefault) {
      await tx.warehouse.updateMany({ where: { companyId }, data: { isDefault: false } })
    }
    return tx.warehouse.create({
      data: { name: input.name, code: cleanCode(input.code), isDefault, companyId },
      include: { locations: true },
    })
  })
}

export async function updateWarehouse(companyId: number, warehouseId: number, input: WarehouseInput) {
  const existing = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } })
  if (!existing) throw new AppError(404, 'Warehouse not found.')
  return prisma.$transaction(async (tx) => {
    if (input.isDefault) {
      await tx.warehouse.updateMany({ where: { companyId }, data: { isDefault: false } })
    }
    if (existing.isDefault && input.isDefault === false) {
      throw new AppError(400, 'Choose another warehouse as the default first.')
    }
    return tx.warehouse.update({
      where: { id: warehouseId },
      data: {
        name: input.name,
        code: cleanCode(input.code),
        ...(input.isDefault ? { isDefault: true } : {}),
      },
      include: { locations: { orderBy: { name: 'asc' } } },
    })
  })
}

export async function addLocation(companyId: number, warehouseId: number, input: LocationInput) {
  const warehouse = await prisma.warehouse.findFirst({
    where: { id: warehouseId, companyId },
    include: { _count: { select: { locations: true } } },
  })
  if (!warehouse) throw new AppError(404, 'Warehouse not found.')
  const multi = await readSetting(prisma, companyId, 'inventory', 'multi', 'yes')
  if (multi === 'no') throw new AppError(409, 'Storage locations are turned off for this company.')
  return prisma.stockLocation.create({
    data: {
      name: input.name,
      type: 'internal',
      isDefault: warehouse._count.locations === 0,
      companyId,
      warehouseId,
    },
  })
}

export async function renameLocation(companyId: number, locationId: number, input: LocationInput) {
  const location = await prisma.stockLocation.findFirst({ where: { id: locationId, companyId, type: 'internal' } })
  if (!location) throw new AppError(404, 'Location not found.')
  return prisma.stockLocation.update({ where: { id: locationId }, data: { name: input.name } })
}

async function internalLocation(tx: Tx, companyId: number, locationId: number) {
  const location = await tx.stockLocation.findFirst({ where: { id: locationId, companyId, type: 'internal' } })
  if (!location) throw new AppError(400, 'Choose a stock location in this company.')
  return location
}

async function buildTransferLines(tx: Tx, companyId: number, lines: TransferInput['lines']) {
  const products = await tx.product.findMany({
    where: { companyId, id: { in: lines.map((line) => line.productId) } },
  })
  const byId = new Map(products.map((product) => [product.id, product]))
  return lines.map((line, index) => {
    const product = byId.get(line.productId)
    if (!product) throw new AppError(400, `Line ${index + 1} uses a product that is not in this company.`)
    if (product.type !== 'product') throw new AppError(400, `${product.name} is a service and is not stocked.`)
    if (!product.active) throw new AppError(400, `${product.name} is archived.`)
    if (product.tracking !== 'none' && !line.lotName) {
      throw new AppError(400, `${product.name} needs a lot or serial number.`)
    }
    return {
      productId: product.id,
      quantity: roundQty(line.quantity),
      lotName: line.lotName,
    }
  })
}

export async function createTransfer(companyId: number, userId: number, input: TransferInput) {
  return prisma.$transaction(async (tx) => {
    if (input.locationFromId === input.locationToId) {
      throw new AppError(400, 'Choose two different locations.')
    }
    await internalLocation(tx, companyId, input.locationFromId)
    await internalLocation(tx, companyId, input.locationToId)
    const lines = await buildTransferLines(tx, companyId, input.lines)
    if (input.routeId) {
      const route = await tx.stockRoute.findFirst({ where: { id: input.routeId, companyId } })
      if (!route) throw new AppError(400, 'Choose a route in this company.')
    }
    return tx.stockTransfer.create({
      data: {
        name: await nextTransferName(tx, companyId),
        state: 'draft',
        companyId,
        locationFromId: input.locationFromId,
        locationToId: input.locationToId,
        createdById: userId,
        routeId: input.routeId,
        lines: { create: lines },
      },
      include: transferInclude,
    })
  })
}

export async function updateTransfer(companyId: number, transferId: number, input: TransferInput) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({ where: { id: transferId, companyId } })
    if (!transfer) throw new AppError(404, 'Transfer not found.')
    if (transfer.state !== 'draft') throw new AppError(409, 'Only a draft transfer can be edited.')
    if (input.locationFromId === input.locationToId) throw new AppError(400, 'Choose two different locations.')
    await internalLocation(tx, companyId, input.locationFromId)
    await internalLocation(tx, companyId, input.locationToId)
    const lines = await buildTransferLines(tx, companyId, input.lines)
    await tx.stockTransferLine.deleteMany({ where: { transferId } })
    return tx.stockTransfer.update({
      where: { id: transferId },
      data: {
        locationFromId: input.locationFromId,
        locationToId: input.locationToId,
        lines: { create: lines },
      },
      include: transferInclude,
    })
  })
}

export async function readyTransfer(companyId: number, transferId: number) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: { id: transferId, companyId },
      include: { lines: { include: { product: true } } },
    })
    if (!transfer) throw new AppError(404, 'Transfer not found.')
    if (transfer.state !== 'draft') throw new AppError(409, 'Only a draft transfer can be marked ready.')
    await guardWorkflow(tx, {
      companyId,
      model: 'stock.transfer',
      recordId: transfer.id,
      from: transfer.state,
      to: 'ready',
      label: transfer.name,
    })
    let step: string | null = null
    if (transfer.routeId) {
      const route = await tx.stockRoute.findFirst({ where: { id: transfer.routeId, companyId } })
      step = route?.steps.split(',')[0] ?? null
    }
    const needed = new Map<number, { name: string; quantity: number }>()
    for (const line of transfer.lines) {
      const current = needed.get(line.productId)
      needed.set(line.productId, {
        name: line.product.name,
        quantity: roundQty((current?.quantity ?? 0) + line.quantity),
      })
    }
    for (const [productId, need] of needed) {
      const available = await onHand(tx, productId, transfer.locationFromId)
      if (available + 0.0001 < need.quantity) {
        throw new AppError(409, `${need.name} has ${available} on hand and this transfer needs ${need.quantity}.`)
      }
    }
    for (const line of transfer.lines) {
      await tx.stockMove.create({
        data: {
          productId: line.productId,
          locationFromId: transfer.locationFromId,
          locationToId: transfer.locationToId,
          quantity: line.quantity,
          state: 'draft',
          reference: transfer.name,
          lotName: line.lotName,
          transferId: transfer.id,
          date: new Date(),
        },
      })
    }
    return tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { state: 'ready', step },
      include: transferInclude,
    })
  })
}

export async function completeTransfer(companyId: number, transferId: number) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({
      where: { id: transferId, companyId },
      include: { moves: true },
    })
    if (!transfer) throw new AppError(404, 'Transfer not found.')
    if (transfer.state !== 'ready') throw new AppError(409, 'Mark the transfer ready before completing it.')
    if (transfer.routeId && transfer.step) {
      const route = await tx.stockRoute.findFirst({ where: { id: transfer.routeId, companyId } })
      const steps = route?.steps.split(',').filter((step) => step.length > 0) ?? []
      const index = steps.indexOf(transfer.step)
      if (index >= 0 && index < steps.length - 1) {
        const next = steps[index + 1] ?? transfer.step
        await tx.chatterMessage.create({
          data: {
            companyId,
            model: 'stock.transfer',
            recordId: transfer.id,
            kind: 'transition',
            summary: `${transfer.name}: ${transfer.step} → ${next}`,
          },
        })
        return tx.stockTransfer.update({
          where: { id: transfer.id },
          data: { step: next },
          include: transferInclude,
        })
      }
    }
    await guardWorkflow(tx, {
      companyId,
      model: 'stock.transfer',
      recordId: transfer.id,
      from: transfer.state,
      to: 'done',
      label: transfer.name,
    })
    for (const move of transfer.moves.filter((row) => row.state === 'draft')) {
      await applyQuant(tx, move.productId, move.locationFromId, -move.quantity)
      await applyQuant(tx, move.productId, move.locationToId, move.quantity)
      const done = await tx.stockMove.update({ where: { id: move.id }, data: { state: 'done', date: new Date() } })
      await valueDoneMove(tx, companyId, done.id)
    }
    return tx.stockTransfer.update({
      where: { id: transfer.id },
      data: { state: 'done' },
      include: transferInclude,
    })
  })
}

export async function cancelTransfer(companyId: number, transferId: number) {
  return prisma.$transaction(async (tx) => {
    const transfer = await tx.stockTransfer.findFirst({ where: { id: transferId, companyId } })
    if (!transfer) throw new AppError(404, 'Transfer not found.')
    if (transfer.state === 'done') throw new AppError(409, 'A completed transfer stays on the books.')
    if (transfer.state === 'cancel') {
      return tx.stockTransfer.findFirstOrThrow({ where: { id: transferId }, include: transferInclude })
    }
    await guardWorkflow(tx, {
      companyId,
      model: 'stock.transfer',
      recordId: transfer.id,
      from: transfer.state,
      to: 'cancel',
      label: transfer.name,
    })
    await tx.stockMove.updateMany({
      where: { transferId, state: 'draft' },
      data: { state: 'cancel' },
    })
    return tx.stockTransfer.update({
      where: { id: transferId },
      data: { state: 'cancel' },
      include: transferInclude,
    })
  })
}

export async function listReorderRules(companyId: number) {
  const rules = await prisma.reorderRule.findMany({
    where: { companyId },
    include: {
      product: { select: { id: true, name: true, sku: true, purchasable: true, costPrice: true, boms: { select: { id: true } } } },
      warehouse: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
  })
  const rows = []
  for (const rule of rules) {
    const quants = await prisma.stockQuant.findMany({
      where: { productId: rule.productId, location: { warehouseId: rule.warehouseId, type: 'internal' } },
    })
    const onHand = roundQty(quants.reduce((sum, quant) => sum + quant.quantity, 0))
    const short = onHand + 0.0001 < rule.minQty
    rows.push({
      id: rule.id,
      productId: rule.productId,
      warehouseId: rule.warehouseId,
      minQty: rule.minQty,
      maxQty: rule.maxQty,
      onHand,
      short,
      suggestQty: short ? roundQty(Math.max(rule.maxQty - onHand, 0)) : 0,
      product: {
        id: rule.product.id,
        name: rule.product.name,
        sku: rule.product.sku,
        purchasable: rule.product.purchasable,
        hasBom: rule.product.boms.length > 0,
      },
      warehouse: rule.warehouse,
    })
  }
  return rows
}

export async function saveReorderRule(companyId: number, input: ReorderRuleInput, ruleId?: number) {
  if (input.maxQty + 0.0001 < input.minQty) {
    throw new AppError(400, 'Maximum must be at least the minimum.')
  }
  const product = await prisma.product.findFirst({ where: { id: input.productId, companyId, type: 'product' } })
  if (!product) throw new AppError(400, 'Choose a stocked product.')
  const warehouse = await prisma.warehouse.findFirst({ where: { id: input.warehouseId, companyId } })
  if (!warehouse) throw new AppError(400, 'Choose a warehouse.')
  const data = {
    productId: input.productId,
    warehouseId: input.warehouseId,
    minQty: input.minQty,
    maxQty: input.maxQty,
    companyId,
  }
  if (ruleId) {
    const existing = await prisma.reorderRule.findFirst({ where: { id: ruleId, companyId } })
    if (!existing) throw new AppError(404, 'Reorder rule not found.')
    return prisma.reorderRule.update({ where: { id: ruleId }, data })
  }
  return prisma.reorderRule.create({ data })
}

export async function stockLevels(companyId: number) {
  const [products, locations] = await Promise.all([
    prisma.product.findMany({
      where: { companyId, type: 'product' },
      include: { quants: { include: { location: { include: { warehouse: true } } } } },
      orderBy: { name: 'asc' },
    }),
    prisma.stockLocation.findMany({
      where: { companyId, type: 'internal' },
      include: { warehouse: true },
      orderBy: { name: 'asc' },
    }),
  ])
  const levels = []
  let valuation = 0
  for (const product of products) {
    for (const location of locations) {
      const quant = product.quants.find((row) => row.locationId === location.id)
      const onHand = quant?.quantity ?? 0
      if (onHand === 0 && !product.active) continue
      const value = roundMoney(onHand * product.costPrice)
      if (onHand !== 0) valuation = roundMoney(valuation + value)
      if (onHand === 0) continue
      levels.push({
        productId: product.id,
        name: product.name,
        sku: product.sku,
        costPrice: product.costPrice,
        tracking: product.tracking,
        locationId: location.id,
        locationName: location.name,
        warehouseId: location.warehouseId,
        warehouseName: location.warehouse?.name ?? '',
        onHand,
        value,
      })
    }
  }
  return { levels, valuation }
}

export async function listMoves(
  companyId: number,
  filters: { productId?: number; locationId?: number },
) {
  return prisma.stockMove.findMany({
    where: {
      product: { companyId },
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.locationId
        ? { OR: [{ locationFromId: filters.locationId }, { locationToId: filters.locationId }] }
        : {}),
    },
    include: {
      product: { select: { name: true, sku: true } },
      locationFrom: { select: { name: true, type: true } },
      locationTo: { select: { name: true, type: true } },
    },
    orderBy: { id: 'desc' },
    take: 300,
  })
}
