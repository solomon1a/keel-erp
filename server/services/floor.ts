import { roundMoney } from '../../src/domain/money.ts'
import type { JobCompleteInput, JobLogInput, WastageInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { createManufacturing } from './manufacturing.ts'
import { guardWorkflow } from './workflow.ts'
import { applyQuant, roundQty, warehouseStockLocation } from './stock.ts'
import { postValuationJournal, valueDoneMove } from './valuation.ts'

async function subcontractLocation(tx: Tx, companyId: number) {
  const existing = await tx.stockLocation.findFirst({ where: { companyId, type: 'subcontract' } })
  if (existing) return existing
  return tx.stockLocation.create({ data: { companyId, name: 'Subcontract', type: 'subcontract' } })
}

async function requireOpenOrder(tx: Tx, companyId: number, orderId: number) {
  const order = await tx.manufacturingOrder.findFirst({
    where: { id: orderId, companyId },
    include: { lines: { include: { product: true } }, product: true },
  })
  if (!order) throw new AppError(404, 'Manufacturing order not found.')
  if (order.state !== 'progress' && order.state !== 'stopped') {
    throw new AppError(409, 'Record wastage while the order is in process or stopped.')
  }
  return order
}

export async function logJobTime(companyId: number, jobCardId: number, input: JobLogInput) {
  const card = await prisma.jobCard.findFirst({ where: { id: jobCardId, companyId } })
  if (!card) throw new AppError(404, 'Job card not found.')
  if (card.status === 'done') throw new AppError(409, 'That job card is already complete.')
  await prisma.jobTimeLog.create({
    data: { jobCardId: card.id, operatorName: input.operatorName, minutes: input.minutes, note: input.note },
  })
  return prisma.jobCard.update({
    where: { id: card.id },
    data: { status: 'open' },
    include: { logs: true, workstation: true, order: { select: { id: true, name: true } } },
  })
}

export async function completeJobCard(companyId: number, jobCardId: number, input: JobCompleteInput) {
  const card = await prisma.jobCard.findFirst({ where: { id: jobCardId, companyId } })
  if (!card) throw new AppError(404, 'Job card not found.')
  return prisma.jobCard.update({
    where: { id: card.id },
    data: {
      completedQty: roundQty(input.completedQty),
      processLoss: roundQty(input.processLoss ?? card.processLoss),
      rejectedQty: roundQty(input.rejectedQty ?? card.rejectedQty),
      status: 'done',
    },
    include: { logs: true, workstation: true },
  })
}

export async function recordWastage(companyId: number, orderId: number, input: WastageInput) {
  return prisma.$transaction(async (tx) => {
    const order = await requireOpenOrder(tx, companyId, orderId)
    const product = await tx.product.findFirst({ where: { id: input.productId, companyId } })
    if (!product) throw new AppError(400, 'Choose a product from this company.')
    const unit = input.unitCost != null ? input.unitCost : product.costPrice
    const cost = roundMoney(unit * input.quantity)
    const card = input.jobCardId
      ? await tx.jobCard.findFirst({ where: { id: input.jobCardId, orderId: order.id } })
      : null
    if (input.kind === 'process_loss') {
      await postValuationJournal(tx, companyId, new Date(), `${order.name} process loss`, '6603', '1407', cost)
    } else {
      const scrapId = order.scrapWarehouseId
      const destination = scrapId
        ? await warehouseStockLocation(tx, companyId, scrapId)
        : await warehouseStockLocation(tx, companyId, order.destWarehouseId)
      const production = await tx.stockLocation.findFirst({ where: { companyId, type: 'production' } })
      if (!production) throw new AppError(500, 'Stock locations are not set up for this company.')
      await applyQuant(tx, product.id, production.id, -input.quantity)
      await applyQuant(tx, product.id, destination.location.id, input.quantity)
      const move = await tx.stockMove.create({
        data: {
          productId: product.id,
          locationFromId: production.id,
          locationToId: destination.location.id,
          quantity: roundQty(input.quantity),
          state: 'done',
          reference: `${order.name} scrap`,
          manufacturingOrderId: order.id,
          unitCost: roundMoney(unit),
          date: new Date(),
        },
      })
      await valueDoneMove(tx, companyId, move.id)
    }
    const expected = order.lines
      .filter((line) => line.productId === product.id)
      .reduce((sum, line) => sum + line.quantity * (line.lossPercent / 100), 0)
    await tx.wastageEntry.create({
      data: {
        companyId,
        orderId: order.id,
        jobCardId: card?.id,
        productId: product.id,
        workstationId: card?.workstationId,
        operationName: card?.operationName,
        quantity: roundQty(input.quantity),
        reason: input.reason,
        kind: input.kind,
        cost,
        expectedQty: roundQty(expected),
      },
    })
    await tx.manufacturingOrder.update({
      where: { id: order.id },
      data: {
        relieved: { increment: cost },
        ...(input.kind === 'rejected' ? { quantityRejected: { increment: input.quantity } } : {}),
      },
    })
    return tx.manufacturingOrder.findFirstOrThrow({
      where: { id: order.id },
      include: { wastage: true, jobCards: true },
    })
  })
}

export async function wastageReport(companyId: number) {
  const rows = await prisma.wastageEntry.findMany({
    where: { companyId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      workstation: { select: { id: true, name: true } },
      order: { select: { id: true, name: true, bomId: true } },
    },
    orderBy: { id: 'desc' },
    take: 300,
  })
  const byItem = new Map<number, { productId: number; name: string; sku: string; quantity: number; cost: number }>()
  const byStation = new Map<string, { name: string; quantity: number; cost: number }>()
  const byReason = new Map<string, { reason: string; quantity: number; cost: number }>()
  let expected = 0
  let actual = 0
  let expense = 0
  let scrap = 0
  for (const row of rows) {
    const item = byItem.get(row.productId) ?? { productId: row.productId, name: row.product.name, sku: row.product.sku, quantity: 0, cost: 0 }
    item.quantity = roundQty(item.quantity + row.quantity)
    item.cost = roundMoney(item.cost + row.cost)
    byItem.set(row.productId, item)
    const stationName = row.workstation?.name ?? row.operationName ?? 'Unassigned'
    const station = byStation.get(stationName) ?? { name: stationName, quantity: 0, cost: 0 }
    station.quantity = roundQty(station.quantity + row.quantity)
    station.cost = roundMoney(station.cost + row.cost)
    byStation.set(stationName, station)
    const reason = byReason.get(row.reason) ?? { reason: row.reason, quantity: 0, cost: 0 }
    reason.quantity = roundQty(reason.quantity + row.quantity)
    reason.cost = roundMoney(reason.cost + row.cost)
    byReason.set(row.reason, reason)
    expected = roundQty(expected + row.expectedQty)
    actual = roundQty(actual + row.quantity)
    if (row.kind === 'process_loss') expense = roundMoney(expense + row.cost)
    else scrap = roundMoney(scrap + row.cost)
  }
  const variancePct = expected > 0.0001 ? roundMoney(((actual - expected) / expected) * 100) : 0
  return {
    rows,
    byItem: [...byItem.values()],
    byStation: [...byStation.values()],
    byReason: [...byReason.values()],
    expected,
    actual,
    variancePct,
    expense,
    scrap,
    cost: roundMoney(expense + scrap),
  }
}

type Demand = { productId: number; quantity: number; bomId: number | null; purchase: boolean }

function explode(
  productId: number,
  quantity: number,
  boms: Map<number, { id: number; yieldQty: number; lines: Array<{ productId: number; quantity: number; lossPercent: number }> }>,
  out: Map<number, Demand>,
  seen: Set<number>,
) {
  if (seen.has(productId)) return
  const bom = boms.get(productId)
  if (!bom) {
    const current = out.get(productId) ?? { productId, quantity: 0, bomId: null, purchase: true }
    current.quantity = roundQty(current.quantity + quantity)
    out.set(productId, current)
    return
  }
  const nextSeen = new Set(seen)
  nextSeen.add(productId)
  const current = out.get(productId) ?? { productId, quantity: 0, bomId: bom.id, purchase: false }
  current.quantity = roundQty(current.quantity + quantity)
  current.bomId = bom.id
  current.purchase = false
  out.set(productId, current)
  for (const line of bom.lines) {
    const need = (line.quantity * (1 + line.lossPercent / 100) * quantity) / (bom.yieldQty || 1)
    explode(line.productId, need, boms, out, nextSeen)
  }
}

export async function createProductionPlan(companyId: number) {
  const [orders, bills, quants] = await Promise.all([
    prisma.salesOrder.findMany({
      where: { companyId, state: { in: ['sale', 'draft', 'sent'] } },
      include: { lines: { select: { productId: true, quantity: true } } },
      take: 100,
    }),
    prisma.billOfMaterials.findMany({
      where: { companyId, active: true },
      include: { lines: true },
    }),
    prisma.stockQuant.findMany({
      where: { location: { companyId, type: 'internal' } },
      select: { productId: true, quantity: true },
    }),
  ])
  const boms = new Map(bills.map((bill) => [bill.productId, bill]))
  const demand = new Map<number, Demand>()
  for (const order of orders) {
    for (const line of order.lines) {
      if (boms.has(line.productId)) explode(line.productId, line.quantity, boms, demand, new Set())
    }
  }
  const onHand = new Map<number, number>()
  for (const quant of quants) onHand.set(quant.productId, roundQty((onHand.get(quant.productId) ?? 0) + quant.quantity))
  const count = await prisma.productionPlan.count({ where: { companyId } })
  const plan = await prisma.productionPlan.create({
    data: {
      companyId,
      name: `PLAN${String(count + 1).padStart(4, '0')}`,
      state: 'draft',
      lines: {
        create: [...demand.values()].map((row) => {
          const have = onHand.get(row.productId) ?? 0
          const short = Math.max(0, roundQty(row.quantity - have))
          return {
            productId: row.productId,
            demandQty: roundQty(row.quantity),
            onHand: have,
            toMake: row.purchase ? 0 : short,
            toBuy: row.purchase ? short : 0,
            bomId: row.bomId,
          }
        }),
      },
    },
    include: { lines: true },
  })
  const products = await prisma.product.findMany({
    where: { id: { in: plan.lines.map((line) => line.productId) } },
    select: { id: true, name: true, sku: true },
  })
  const names = new Map(products.map((row) => [row.id, row]))
  return { ...plan, lines: plan.lines.map((line) => ({ ...line, product: names.get(line.productId) ?? null })) }
}

export async function listProductionPlans(companyId: number) {
  const plans = await prisma.productionPlan.findMany({
    where: { companyId },
    include: { lines: true },
    orderBy: { id: 'desc' },
    take: 30,
  })
  const ids = [...new Set(plans.flatMap((plan) => plan.lines.map((line) => line.productId)))]
  const products = ids.length
    ? await prisma.product.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, sku: true } })
    : []
  const names = new Map(products.map((row) => [row.id, row]))
  return plans.map((plan) => ({
    ...plan,
    lines: plan.lines.map((line) => ({ ...line, product: names.get(line.productId) ?? null })),
  }))
}

export async function getProductionPlan(companyId: number, planId: number) {
  const plan = await prisma.productionPlan.findFirst({
    where: { id: planId, companyId },
    include: { lines: true },
  })
  if (!plan) throw new AppError(404, 'Production plan not found.')
  const products = await prisma.product.findMany({
    where: { id: { in: plan.lines.map((line) => line.productId) } },
    select: { id: true, name: true, sku: true },
  })
  const names = new Map(products.map((row) => [row.id, row]))
  return { ...plan, lines: plan.lines.map((line) => ({ ...line, product: names.get(line.productId) ?? null })) }
}

export async function raiseProductionPlan(companyId: number, userId: number, planId: number) {
  const plan = await prisma.productionPlan.findFirst({ where: { id: planId, companyId }, include: { lines: true } })
  if (!plan) throw new AppError(404, 'Production plan not found.')
  if (plan.state === 'raised') return getProductionPlan(companyId, planId)
  const make = plan.lines.filter((line) => line.toMake > 0.0001 && line.bomId && !line.workOrderId)
  const buy = plan.lines.filter((line) => line.toBuy > 0.0001 && !line.materialRequestId)
  for (const line of make) {
    const order = await createManufacturing(companyId, userId, { productId: line.productId, quantity: line.toMake })
    await prisma.productionPlanLine.update({ where: { id: line.id }, data: { workOrderId: order.id } })
  }
  if (buy.length > 0) {
    const count = await prisma.materialRequest.count({ where: { companyId } })
    const request = await prisma.materialRequest.create({
      data: {
        companyId,
        name: `MR${String(count + 1).padStart(4, '0')}`,
        state: 'draft',
        lines: { create: buy.map((line) => ({ productId: line.productId, quantity: line.toBuy })) },
      },
    })
    await prisma.productionPlanLine.updateMany({
      where: { id: { in: buy.map((line) => line.id) } },
      data: { materialRequestId: request.id },
    })
  }
  await prisma.productionPlan.update({ where: { id: plan.id }, data: { state: 'raised' } })
  return getProductionPlan(companyId, planId)
}

export async function sendSubcontract(companyId: number, orderId: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.manufacturingOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: true },
    })
    if (!order) throw new AppError(404, 'Manufacturing order not found.')
    if (order.purpose !== 'subcontract') throw new AppError(409, 'This order is not a subcontract.')
    if (order.subcontractState === 'sent' || order.subcontractState === 'received') {
      throw new AppError(409, 'Materials were already sent.')
    }
    const source = await warehouseStockLocation(tx, companyId, order.sourceWarehouseId)
    const away = await subcontractLocation(tx, companyId)
    for (const line of order.lines) {
      const quantity = roundQty(line.quantity - line.consumed)
      if (quantity <= 0) continue
      const have = await tx.stockQuant.findUnique({ where: { productId_locationId: { productId: line.productId, locationId: source.location.id } } })
      if ((have?.quantity ?? 0) + 0.0001 < quantity) throw new AppError(409, 'Not enough material to send to the supplier.')
      await applyQuant(tx, line.productId, source.location.id, -quantity)
      await applyQuant(tx, line.productId, away.id, quantity)
      const move = await tx.stockMove.create({
        data: {
          productId: line.productId,
          locationFromId: source.location.id,
          locationToId: away.id,
          quantity,
          state: 'done',
          reference: `${order.name} subcontract`,
          manufacturingOrderId: order.id,
          date: new Date(),
        },
      })
      await valueDoneMove(tx, companyId, move.id)
      await tx.manufacturingComponent.update({ where: { id: line.id }, data: { consumed: { increment: quantity } } })
    }
    if (order.state === 'confirmed') {
      await guardWorkflow(tx, { companyId, model: 'mrp.order', recordId: order.id, from: 'confirmed', to: 'progress', label: order.name })
    }
    return tx.manufacturingOrder.update({
      where: { id: order.id },
      data: { subcontractState: 'sent', state: order.state === 'confirmed' ? 'progress' : order.state },
    })
  })
}

export async function receiveSubcontract(companyId: number, orderId: number, quantity?: number) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.manufacturingOrder.findFirst({ where: { id: orderId, companyId }, include: { moves: true } })
    if (!order) throw new AppError(404, 'Manufacturing order not found.')
    if (order.subcontractState !== 'sent') throw new AppError(409, 'Send the materials before receiving finished goods.')
    const remaining = roundQty(order.quantity - order.quantityDone)
    const receiving = roundQty(quantity ?? remaining)
    if (receiving <= 0 || receiving - remaining > 0.0001) throw new AppError(400, `Only ${remaining} remains on this order.`)
    const away = await subcontractLocation(tx, companyId)
    const destination = await warehouseStockLocation(tx, companyId, order.destWarehouseId)
    const sentMoves = await tx.stockMove.findMany({
      where: { manufacturingOrderId: order.id, locationTo: { type: 'subcontract' } },
      select: { id: true },
    })
    const sent = sentMoves.length === 0 ? [] : await tx.stockLedger.findMany({ where: { moveId: { in: sentMoves.map((row) => row.id) } } })
    const sentValue = roundMoney(sent.reduce((sum, row) => sum + -row.value, 0))
    const unitCost = order.quantity > 0 ? roundMoney(sentValue / order.quantity) : 0
    await applyQuant(tx, order.productId, away.id, -receiving)
    await applyQuant(tx, order.productId, destination.location.id, receiving)
    const move = await tx.stockMove.create({
      data: {
        productId: order.productId,
        locationFromId: away.id,
        locationToId: destination.location.id,
        quantity: receiving,
        state: 'done',
        reference: `${order.name} subcontract receipt`,
        manufacturingOrderId: order.id,
        unitCost,
        date: new Date(),
      },
    })
    await valueDoneMove(tx, companyId, move.id)
    const done = Math.abs(receiving - remaining) < 0.0001
    return tx.manufacturingOrder.update({
      where: { id: order.id },
      data: {
        quantityDone: roundQty(order.quantityDone + receiving),
        state: done ? 'done' : 'progress',
        subcontractState: done ? 'received' : 'sent',
      },
    })
  })
}

export async function workspacePulse(companyId: number, moduleId: string) {
  if (moduleId === 'manufacturing') {
    const [orders, produced] = await Promise.all([
      prisma.manufacturingOrder.groupBy({ by: ['state'], where: { companyId }, _count: { _all: true } }),
      prisma.manufacturingOrder.findMany({
        where: { companyId, quantityDone: { gt: 0 } },
        select: { quantityDone: true, updatedAt: true, product: { select: { costPrice: true } } },
        take: 200,
      }),
    ])
    const count = (state: string) => orders.find((row) => row.state === state)?._count._all ?? 0
    const open = count('draft') + count('confirmed')
    const wip = count('progress') + count('stopped')
    const value = roundMoney(produced.reduce((sum, row) => sum + row.quantityDone * row.product.costPrice, 0))
    const chart = Array.from({ length: 12 }, () => 0)
    for (const row of produced) {
      const month = (row.updatedAt.getUTCMonth() + 8) % 12
      chart[month] = roundQty(chart[month] + row.quantityDone)
    }
    return { kpis: [open, wip, value], chart }
  }
  if (moduleId === 'wastage') {
    const rows = await prisma.wastageEntry.findMany({
      where: { companyId },
      select: { cost: true, createdAt: true, kind: true },
      take: 300,
    })
    const open = rows.length
    const waiting = rows.filter((row) => row.kind === 'rejected').length
    const cost = roundMoney(rows.reduce((sum, row) => sum + row.cost, 0))
    const chart = Array.from({ length: 12 }, () => 0)
    for (const row of rows) {
      const month = (row.createdAt.getUTCMonth() + 8) % 12
      chart[month] = roundMoney(chart[month] + row.cost)
    }
    return { kpis: [open, waiting, cost], chart }
  }
  return null
}
