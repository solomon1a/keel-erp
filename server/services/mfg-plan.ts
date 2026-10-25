import { roundMoney } from '../../src/domain/money.ts'
import type { BomCompareInput, DowntimeInput, ForecastInput, LeadDaysInput, UnbuildInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { getProductionPlan } from './floor.ts'
import { rollupBoms, type BomCostSource } from './manufacturing.ts'
import { applyQuant, companyLocations, roundQty, warehouseStockLocation } from './stock.ts'
import { valueDoneMove } from './valuation.ts'

function uniqueName(error: unknown, message: string): never {
  if (error instanceof Error && 'code' in error && error.code === 'P2002') throw new AppError(409, message)
  throw error
}

const forecastInclude = { product: { select: { id: true, name: true, sku: true } } } as const

export async function listForecasts(companyId: number) {
  return prisma.demandForecast.findMany({
    where: { companyId },
    include: forecastInclude,
    orderBy: [{ period: 'asc' }, { id: 'asc' }],
    take: 200,
  })
}

export async function createForecast(companyId: number, input: ForecastInput) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, companyId } })
  if (!product) throw new AppError(400, 'Choose a product.')
  try {
    return await prisma.demandForecast.create({
      data: {
        companyId,
        name: input.name,
        productId: input.productId,
        period: input.period,
        quantity: roundQty(input.quantity),
        note: input.note ?? '',
      },
      include: forecastInclude,
    })
  } catch (error) {
    uniqueName(error, 'A forecast with this name already exists.')
  }
}

export async function deleteForecast(companyId: number, id: number) {
  const row = await prisma.demandForecast.findFirst({ where: { id, companyId } })
  if (!row) throw new AppError(404, 'Forecast not found.')
  await prisma.demandForecast.delete({ where: { id } })
}

const downtimeInclude = { workstation: { select: { id: true, name: true } } } as const

export async function listDowntime(companyId: number) {
  return prisma.downtimeEntry.findMany({
    where: { companyId },
    include: downtimeInclude,
    orderBy: { date: 'desc' },
    take: 200,
  })
}

export async function createDowntime(companyId: number, input: DowntimeInput) {
  const station = await prisma.workstation.findFirst({ where: { id: input.workstationId, companyId } })
  if (!station) throw new AppError(400, 'Choose a work center.')
  try {
    return await prisma.downtimeEntry.create({
      data: {
        companyId,
        name: input.name,
        workstationId: station.id,
        date: new Date(`${input.date}T00:00:00.000Z`),
        minutes: roundQty(input.minutes),
        reason: input.reason,
        state: input.state,
      },
      include: downtimeInclude,
    })
  } catch (error) {
    uniqueName(error, 'A downtime entry with this name already exists.')
  }
}

export async function confirmDowntime(companyId: number, id: number) {
  const row = await prisma.downtimeEntry.findFirst({ where: { id, companyId } })
  if (!row) throw new AppError(404, 'Downtime entry not found.')
  return prisma.downtimeEntry.update({
    where: { id },
    data: { state: 'confirmed' },
    include: downtimeInclude,
  })
}

const unbuildInclude = {
  product: { select: { id: true, name: true, sku: true } },
  bom: { select: { id: true, version: true } },
} as const

export async function listUnbuilds(companyId: number) {
  return prisma.unbuildOrder.findMany({
    where: { companyId },
    include: unbuildInclude,
    orderBy: { id: 'desc' },
    take: 100,
  })
}

export async function createUnbuild(companyId: number, input: UnbuildInput) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, companyId } })
  if (!product) throw new AppError(400, 'Choose a product.')
  const bom = await prisma.billOfMaterials.findFirst({
    where: { companyId, productId: product.id, active: true },
    orderBy: { version: 'desc' },
  })
  if (!bom) throw new AppError(409, 'This product has no active bill to unbuild.')
  try {
    return await prisma.unbuildOrder.create({
      data: {
        companyId,
        name: input.name,
        productId: product.id,
        bomId: bom.id,
        quantity: roundQty(input.quantity),
        note: input.note ?? '',
        state: 'draft',
      },
      include: unbuildInclude,
    })
  } catch (error) {
    uniqueName(error, 'An unbuild order with this name already exists.')
  }
}

export async function completeUnbuild(companyId: number, id: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.unbuildOrder.findFirst({
      where: { id, companyId },
      include: { bom: { include: { lines: true } }, product: true },
    })
    if (!order) throw new AppError(404, 'Unbuild order not found.')
    if (order.state === 'done') {
      return tx.unbuildOrder.findFirstOrThrow({ where: { id }, include: unbuildInclude })
    }
    if (!order.bom) throw new AppError(409, 'This product has no active bill to unbuild.')
    const quantity = roundQty(order.quantity)
    const stock = await warehouseStockLocation(tx, companyId, order.warehouseId)
    const locations = await companyLocations(tx, companyId)
    const have = await tx.stockQuant.findUnique({
      where: { productId_locationId: { productId: order.productId, locationId: stock.location.id } },
    })
    if ((have?.quantity ?? 0) + 0.0001 < quantity) throw new AppError(409, 'Not enough finished goods to unbuild.')
    await moveStock(tx, companyId, {
      productId: order.productId,
      fromId: stock.location.id,
      toId: locations.production.id,
      quantity,
      reference: order.name,
      unitCost: null,
    })
    const yieldQty = order.bom.yieldQty || 1
    for (const line of order.bom.lines) {
      const componentQty = roundQty((line.quantity * quantity) / yieldQty)
      if (componentQty <= 0) continue
      const component = await tx.product.findFirst({ where: { id: line.productId, companyId }, select: { costPrice: true } })
      await moveStock(tx, companyId, {
        productId: line.productId,
        fromId: locations.production.id,
        toId: stock.location.id,
        quantity: componentQty,
        reference: order.name,
        unitCost: component?.costPrice ?? 0,
      })
    }
    return tx.unbuildOrder.update({
      where: { id: order.id },
      data: { state: 'done' },
      include: unbuildInclude,
    })
  })
}

async function moveStock(
  tx: Tx,
  companyId: number,
  input: { productId: number; fromId: number; toId: number; quantity: number; reference: string; unitCost: number | null },
) {
  await applyQuant(tx, input.productId, input.fromId, -input.quantity)
  await applyQuant(tx, input.productId, input.toId, input.quantity)
  const move = await tx.stockMove.create({
    data: {
      productId: input.productId,
      locationFromId: input.fromId,
      locationToId: input.toId,
      quantity: input.quantity,
      state: 'done',
      reference: input.reference,
      unitCost: input.unitCost,
      date: new Date(),
    },
  })
  await valueDoneMove(tx, companyId, move.id)
}

export async function draftPlanPurchases(companyId: number, userId: number, planId: number) {
  const plan = await prisma.productionPlan.findFirst({
    where: { id: planId, companyId },
    include: { lines: true },
  })
  if (!plan) throw new AppError(404, 'Production plan not found.')
  const buy = plan.lines.filter((line) => line.toBuy > 0.0001 && !line.purchaseOrderId)
  if (buy.length === 0) return getProductionPlan(companyId, planId)
  const vendor = await prisma.contact.findFirst({
    where: { companyId, isSupplier: true },
    orderBy: { id: 'asc' },
    select: { id: true },
  })
  if (!vendor) throw new AppError(400, 'Add a supplier before drafting purchase orders.')
  const products = await prisma.product.findMany({
    where: { id: { in: buy.map((line) => line.productId) }, companyId },
    select: { id: true, name: true, costPrice: true },
  })
  const costs = new Map(products.map((row) => [row.id, row]))
  await prisma.$transaction(async (tx) => {
    for (const line of buy) {
      const product = costs.get(line.productId)
      const unitCost = roundMoney(product?.costPrice ?? 0)
      const subtotal = roundMoney(unitCost * line.toBuy)
      const order = await tx.purchaseOrder.create({
        data: {
          companyId,
          name: `POV-${plan.name}-${line.id}`,
          state: 'draft',
          vendorId: vendor.id,
          dateOrder: new Date(),
          amountUntaxed: subtotal,
          amountTax: 0,
          amountTotal: subtotal,
          createdById: userId,
          lines: {
            create: [{
              productId: line.productId,
              description: product?.name ?? 'Planned purchase',
              quantity: line.toBuy,
              unitCost,
              subtotal,
              taxAmount: 0,
            }],
          },
        },
      })
      await tx.productionPlanLine.update({ where: { id: line.id }, data: { purchaseOrderId: order.id } })
    }
  }, { timeout: 20_000 })
  return getProductionPlan(companyId, planId)
}

export async function listLeadTimes(companyId: number) {
  return prisma.product.findMany({
    where: { companyId, type: 'product', active: true },
    select: { id: true, name: true, sku: true, kind: true, leadDays: true, purchasable: true },
    orderBy: { name: 'asc' },
    take: 300,
  })
}

export async function saveLeadDays(companyId: number, productId: number, input: LeadDaysInput) {
  const product = await prisma.product.findFirst({ where: { id: productId, companyId } })
  if (!product) throw new AppError(404, 'Product not found.')
  return prisma.product.update({
    where: { id: productId },
    data: { leadDays: input.leadDays },
    select: { id: true, name: true, sku: true, kind: true, leadDays: true, purchasable: true },
  })
}

type ExplodeNode = {
  productId: number
  name: string
  sku: string
  quantity: number
  level: number
  bomId: number | null
  children: ExplodeNode[]
}

export async function explodeBom(companyId: number, bomId: number) {
  const bills = await prisma.billOfMaterials.findMany({
    where: { companyId, active: true },
    include: {
      lines: true,
      product: { select: { id: true, name: true, sku: true } },
    },
  })
  const root = bills.find((row) => row.id === bomId) ?? await prisma.billOfMaterials.findFirst({
    where: { id: bomId, companyId },
    include: { lines: true, product: { select: { id: true, name: true, sku: true } } },
  })
  if (!root) throw new AppError(404, 'Bill of materials not found.')
  const bomRoot = root
  const byProduct = new Map(bills.map((row) => [row.productId, row]))
  const productIds = new Set<number>([root.productId, ...bills.flatMap((row) => row.lines.map((line) => line.productId))])
  const products = await prisma.product.findMany({
    where: { id: { in: [...productIds] } },
    select: { id: true, name: true, sku: true },
  })
  const names = new Map(products.map((row) => [row.id, row]))
  function walk(productId: number, quantity: number, level: number, seen: Set<number>): ExplodeNode {
    const product = names.get(productId)
    const bom = byProduct.get(productId)
    const node: ExplodeNode = {
      productId,
      name: product?.name ?? bomRoot.product.name,
      sku: product?.sku ?? bomRoot.product.sku,
      quantity: roundQty(quantity),
      level,
      bomId: bom?.id ?? null,
      children: [],
    }
    if (!bom || seen.has(productId)) return node
    const next = new Set(seen)
    next.add(productId)
    const yieldQty = bom.yieldQty || 1
    for (const line of bom.lines) {
      const need = (line.quantity * (1 + line.lossPercent / 100) * quantity) / yieldQty
      node.children.push(walk(line.productId, need, level + 1, next))
    }
    return node
  }
  const tree = walk(bomRoot.productId, bomRoot.yieldQty || 1, 0, new Set())
  const flat: Array<Omit<ExplodeNode, 'children'>> = []
  function collect(node: ExplodeNode) {
    const { children, ...rest } = node
    flat.push(rest)
    for (const child of children) collect(child)
  }
  collect(tree)
  return { tree, flat, levels: flat.reduce((max, row) => Math.max(max, row.level), 0) }
}

export async function compareBoms(companyId: number, input: BomCompareInput) {
  const rows = await prisma.billOfMaterials.findMany({
    where: { companyId },
    include: {
      lines: { include: { product: { select: { id: true, name: true, sku: true, costPrice: true } } } },
      operations: { include: { workstation: true } },
      byproducts: { include: { product: { select: { id: true, name: true, sku: true, costPrice: true } } } },
      product: { select: { id: true, name: true, sku: true, costPrice: true, type: true } },
    },
  })
  const left = rows.find((row) => row.id === input.leftId)
  const right = rows.find((row) => row.id === input.rightId)
  if (!left || !right) throw new AppError(404, 'Bill of materials not found.')
  const costs = rollupBoms(rows as BomCostSource[])
  const ids = new Set<number>([...left.lines.map((line) => line.productId), ...right.lines.map((line) => line.productId)])
  const lines = [...ids].map((productId) => {
    const a = left.lines.find((line) => line.productId === productId)
    const b = right.lines.find((line) => line.productId === productId)
    const product = a?.product ?? b?.product
    return {
      productId,
      name: product?.name ?? '',
      sku: product?.sku ?? '',
      leftQty: a?.quantity ?? 0,
      rightQty: b?.quantity ?? 0,
    }
  })
  return {
    left: side(left, costs.get(left.id)?.unitCost ?? 0),
    right: side(right, costs.get(right.id)?.unitCost ?? 0),
    lines,
  }
}

function side(bom: { id: number; version: number; product: { name: string; sku: string } }, unitCost: number) {
  return { id: bom.id, version: bom.version, name: bom.product.name, sku: bom.product.sku, unitCost }
}

export async function manufacturingReports(companyId: number) {
  const [orders, stations, downtime, wastage] = await Promise.all([
    prisma.manufacturingOrder.findMany({
      where: { companyId },
      include: {
        product: { select: { id: true, name: true, sku: true, costPrice: true } },
        lines: { include: { product: { select: { costPrice: true } } } },
      },
      orderBy: { id: 'desc' },
      take: 400,
    }),
    prisma.workstation.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: { jobCards: { select: { logs: { select: { minutes: true } } } } },
    }),
    prisma.downtimeEntry.groupBy({
      by: ['workstationId'],
      where: { companyId, state: 'confirmed' },
      _sum: { minutes: true },
    }),
    prisma.wastageEntry.findMany({
      where: { companyId },
      select: { reason: true, quantity: true, cost: true, kind: true, expectedQty: true },
      take: 300,
    }),
  ])
  const bills = await prisma.billOfMaterials.findMany({
    where: { companyId },
    include: {
      lines: { include: { product: { select: { costPrice: true } } } },
      operations: { include: { workstation: true } },
      byproducts: { include: { product: { select: { costPrice: true } } } },
      product: { select: { costPrice: true, type: true } },
    },
  })
  const costs = rollupBoms(bills as BomCostSource[])
  const production = new Map<string, { month: string; quantity: number; orders: number }>()
  const wipOrders: Array<{ id: number; name: string; product: string; remaining: number; value: number }> = []
  const variance: Array<{ id: number; name: string; product: string; quantityDone: number; standard: number; actual: number; variance: number }> = []
  for (const order of orders) {
    if (order.quantityDone > 0) {
      const month = order.updatedAt.toISOString().slice(0, 7)
      const bucket = production.get(month) ?? { month, quantity: 0, orders: 0 }
      bucket.quantity = roundQty(bucket.quantity + order.quantityDone)
      bucket.orders += 1
      production.set(month, bucket)
      const standardUnit = order.bomId ? costs.get(order.bomId)?.unitCost ?? order.product.costPrice : order.product.costPrice
      const standard = roundMoney(standardUnit * order.quantityDone)
      const material = roundMoney(order.lines.reduce((sum, line) => sum + line.consumed * line.product.costPrice, 0))
      const actual = roundMoney(material + order.operatingAbsorbed)
      variance.push({
        id: order.id,
        name: order.name,
        product: order.product.name,
        quantityDone: order.quantityDone,
        standard,
        actual,
        variance: roundMoney(actual - standard),
      })
    }
    if (order.state === 'progress' || order.state === 'stopped') {
      const remaining = roundQty(Math.max(0, order.quantity - order.quantityDone))
      wipOrders.push({
        id: order.id,
        name: order.name,
        product: order.product.name,
        remaining,
        value: roundMoney(remaining * order.product.costPrice),
      })
    }
  }
  const lost = new Map(downtime.map((row) => [row.workstationId, row._sum.minutes ?? 0]))
  const utilisation = stations.map((station) => {
    const logged = station.jobCards.reduce((sum, card) => sum + card.logs.reduce((inner, log) => inner + log.minutes, 0), 0)
    const scheduled = station.capacityHours * 60
    const down = roundQty(lost.get(station.id) ?? 0)
    return {
      id: station.id,
      name: station.name,
      scheduledMinutes: roundQty(scheduled),
      loggedMinutes: roundQty(logged),
      downtimeMinutes: down,
      utilisation: scheduled > 0 ? Math.round((logged / scheduled) * 1000) / 10 : 0,
    }
  })
  const byReason = new Map<string, { reason: string; quantity: number; cost: number }>()
  let expense = 0
  let scrap = 0
  let expected = 0
  let actual = 0
  for (const row of wastage) {
    const bucket = byReason.get(row.reason) ?? { reason: row.reason, quantity: 0, cost: 0 }
    bucket.quantity = roundQty(bucket.quantity + row.quantity)
    bucket.cost = roundMoney(bucket.cost + row.cost)
    byReason.set(row.reason, bucket)
    expected = roundQty(expected + row.expectedQty)
    actual = roundQty(actual + row.quantity)
    if (row.kind === 'process_loss') expense = roundMoney(expense + row.cost)
    else scrap = roundMoney(scrap + row.cost)
  }
  return {
    production: [...production.values()].sort((a, b) => a.month.localeCompare(b.month)),
    wip: { orders: wipOrders, value: roundMoney(wipOrders.reduce((sum, row) => sum + row.value, 0)) },
    variance: variance.slice(0, 80),
    utilisation,
    scrap: {
      cost: roundMoney(expense + scrap),
      expense,
      scrap,
      expected,
      actual,
      variancePct: expected > 0.0001 ? roundMoney(((actual - expected) / expected) * 100) : 0,
      byReason: [...byReason.values()],
    },
  }
}
