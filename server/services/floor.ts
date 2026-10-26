import { roundMoney } from '../../src/domain/money.ts'
import type { JobCompleteInput, JobLogInput, JobStartInput, WastageInput, WorkstationInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { readSetting } from './company-settings.ts'
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

const cardInclude = {
  logs: { orderBy: { id: 'asc' as const } },
  workstation: true,
  order: { select: { id: true, name: true, state: true, product: { select: { name: true } } } },
}

function elapsedMinutes(startedAt: Date, now: Date) {
  const raw = (now.getTime() - startedAt.getTime()) / 60000
  if (!Number.isFinite(raw) || raw < 0) return 0
  return Math.round(raw * 100) / 100
}

async function closeOpenLog(tx: Tx, jobCardId: number, now: Date) {
  const open = await tx.jobTimeLog.findFirst({
    where: { jobCardId, startedAt: { not: null }, endedAt: null },
    orderBy: { id: 'desc' },
  })
  if (!open?.startedAt) return null
  return tx.jobTimeLog.update({
    where: { id: open.id },
    data: { endedAt: now, minutes: elapsedMinutes(open.startedAt, now) },
  })
}

export async function logJobTime(companyId: number, jobCardId: number, input: JobLogInput) {
  const card = await prisma.jobCard.findFirst({ where: { id: jobCardId, companyId } })
  if (!card) throw new AppError(404, 'Job card not found.')
  if (card.status === 'done') throw new AppError(409, 'That job card is already complete.')
  await prisma.jobTimeLog.create({
    data: { jobCardId: card.id, operatorName: input.operatorName, minutes: input.minutes, note: input.note },
  })
  const status = card.status === 'running' || card.status === 'paused' ? card.status : 'open'
  return prisma.jobCard.update({
    where: { id: card.id },
    data: { status },
    include: cardInclude,
  })
}

export async function completeJobCard(companyId: number, jobCardId: number, input: JobCompleteInput) {
  return prisma.$transaction(async (tx) => {
    const card = await tx.jobCard.findFirst({ where: { id: jobCardId, companyId } })
    if (!card) throw new AppError(404, 'Job card not found.')
    if (card.status === 'done') throw new AppError(409, 'That job card is already complete.')
    await closeOpenLog(tx, card.id, new Date())
    return tx.jobCard.update({
      where: { id: card.id },
      data: {
        completedQty: roundQty(input.completedQty),
        processLoss: roundQty(input.processLoss ?? card.processLoss),
        rejectedQty: roundQty(input.rejectedQty ?? card.rejectedQty),
        status: 'done',
      },
      include: cardInclude,
    })
  })
}

export async function startJobCard(companyId: number, jobCardId: number, input: JobStartInput) {
  return prisma.$transaction(async (tx) => {
    const card = await tx.jobCard.findFirst({ where: { id: jobCardId, companyId } })
    if (!card) throw new AppError(404, 'Job card not found.')
    if (card.status === 'done') throw new AppError(409, 'That job card is already complete.')
    const open = await tx.jobTimeLog.findFirst({
      where: { jobCardId: card.id, startedAt: { not: null }, endedAt: null },
    })
    if (open || card.status === 'running') throw new AppError(409, 'That job card is already running.')
    await tx.jobTimeLog.create({
      data: { jobCardId: card.id, operatorName: input.operatorName, minutes: 0, startedAt: new Date() },
    })
    return tx.jobCard.update({
      where: { id: card.id },
      data: { status: 'running' },
      include: cardInclude,
    })
  })
}

export async function pauseJobCard(companyId: number, jobCardId: number) {
  return prisma.$transaction(async (tx) => {
    const card = await tx.jobCard.findFirst({ where: { id: jobCardId, companyId } })
    if (!card) throw new AppError(404, 'Job card not found.')
    if (card.status !== 'running') throw new AppError(409, 'Start the job card before pausing it.')
    const closed = await closeOpenLog(tx, card.id, new Date())
    if (!closed) throw new AppError(409, 'Start the job card before pausing it.')
    return tx.jobCard.update({
      where: { id: card.id },
      data: { status: 'paused' },
      include: cardInclude,
    })
  })
}

export async function finishJobCard(companyId: number, jobCardId: number, input: JobCompleteInput) {
  return completeJobCard(companyId, jobCardId, input)
}

export async function recordWastage(companyId: number, orderId: number, input: WastageInput, actorName?: string) {
  return prisma.$transaction(async (tx) => {
    const order = await requireOpenOrder(tx, companyId, orderId)
    const product = await tx.product.findFirst({ where: { id: input.productId, companyId } })
    if (!product) throw new AppError(400, 'Choose a product from this company.')
    const unit = input.unitCost != null ? input.unitCost : product.costPrice
    const cost = roundMoney(unit * input.quantity)
    if (actorName) {
      const approver = await readSetting(tx, companyId, 'wastage', 'approver', 'August')
      const limit = Number(await readSetting(tx, companyId, 'wastage', 'limit', '500'))
      if (Number.isFinite(limit) && cost > limit && actorName !== approver) {
        throw new AppError(403, 'This wastage is above the approval limit.')
      }
    }
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

type DemandSource = 'order' | 'forecast' | 'reorder'

type Demand = {
  productId: number
  quantity: number
  bomId: number | null
  purchase: boolean
  sources: Set<DemandSource>
}

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
    const current = out.get(productId) ?? { productId, quantity: 0, bomId: null, purchase: true, sources: new Set<DemandSource>() }
    current.quantity = roundQty(current.quantity + quantity)
    out.set(productId, current)
    return
  }
  const nextSeen = new Set(seen)
  nextSeen.add(productId)
  const current = out.get(productId) ?? { productId, quantity: 0, bomId: bom.id, purchase: false, sources: new Set<DemandSource>() }
  current.quantity = roundQty(current.quantity + quantity)
  current.bomId = bom.id
  current.purchase = false
  out.set(productId, current)
  for (const line of bom.lines) {
    const need = (line.quantity * (1 + line.lossPercent / 100) * quantity) / (bom.yieldQty || 1)
    explode(line.productId, need, boms, out, nextSeen)
  }
}

function absorbDemand(productId: number, quantity: number, source: DemandSource, boms: Map<number, { id: number; yieldQty: number; lines: Array<{ productId: number; quantity: number; lossPercent: number }> }>, demand: Map<number, Demand>) {
  const before = new Set(demand.keys())
  explode(productId, quantity, boms, demand, new Set())
  for (const [id, row] of demand) {
    if (!before.has(id)) row.sources.add(source)
  }
  demand.get(productId)?.sources.add(source)
}

function sourceLabel(sources: Set<DemandSource>) {
  const list = [...sources]
  if (list.length === 1) {
    const only = list[0]
    if (only === 'order' || only === 'forecast' || only === 'reorder') return only
  }
  if (list.length === 0) return 'order'
  return 'mixed'
}

function wholeSetting(value: string, fallback: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return fallback
  return Math.round(parsed)
}

function periodStartsAfter(period: string, cutoff: Date) {
  const match = /^(\d{4})-(\d{2})$/.exec(period)
  if (!match) return false
  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1))
  return start.getTime() > cutoff.getTime()
}

export async function createProductionPlan(companyId: number) {
  const [forecastOn, reorderOn, horizonRaw, pleadRaw] = await Promise.all([
    readSetting(prisma, companyId, 'manufacturing', 'forecast', 'yes'),
    readSetting(prisma, companyId, 'manufacturing', 'reorder', 'yes'),
    readSetting(prisma, companyId, 'manufacturing', 'horizon', '0'),
    readSetting(prisma, companyId, 'manufacturing', 'plead', '7'),
  ])
  const horizon = wholeSetting(horizonRaw, 0)
  const plead = wholeSetting(pleadRaw, 7)
  const cutoff = horizon > 0 ? new Date(Date.now() + horizon * 86_400_000) : null
  const [orders, bills, quants, forecasts, rules] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        companyId,
        state: { in: ['sale', 'draft', 'sent'] },
        ...(cutoff ? { dateOrder: { lte: cutoff } } : {}),
      },
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
    forecastOn === 'no' ? Promise.resolve([]) : prisma.demandForecast.findMany({ where: { companyId } }),
    reorderOn === 'no' ? Promise.resolve([]) : prisma.reorderRule.findMany({ where: { companyId } }),
  ])
  const boms = new Map(bills.map((bill) => [bill.productId, bill]))
  const demand = new Map<number, Demand>()
  for (const order of orders) {
    for (const line of order.lines) {
      if (boms.has(line.productId)) absorbDemand(line.productId, line.quantity, 'order', boms, demand)
    }
  }
  for (const row of forecasts) {
    if (cutoff && periodStartsAfter(row.period, cutoff)) continue
    absorbDemand(row.productId, row.quantity, 'forecast', boms, demand)
  }
  const onHand = new Map<number, number>()
  for (const quant of quants) onHand.set(quant.productId, roundQty((onHand.get(quant.productId) ?? 0) + quant.quantity))
  for (const rule of rules) {
    if (demand.has(rule.productId)) continue
    const have = onHand.get(rule.productId) ?? 0
    if (have + 0.0001 >= rule.minQty) continue
    const qty = roundQty(Math.max(0, rule.maxQty - have))
    if (qty <= 0) continue
    absorbDemand(rule.productId, qty, 'reorder', boms, demand)
  }
  const count = await prisma.productionPlan.count({ where: { companyId } })
  const productIds = [...demand.keys()]
  const products = productIds.length
    ? await prisma.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, sku: true, leadDays: true },
    })
    : []
  const names = new Map(products.map((row) => [row.id, row]))
  const plan = await prisma.productionPlan.create({
    data: {
      companyId,
      name: `PLAN${String(count + 1).padStart(4, '0')}`,
      state: 'draft',
      lines: {
        create: [...demand.values()].map((row) => {
          const have = onHand.get(row.productId) ?? 0
          const short = Math.max(0, roundQty(row.quantity - have))
          const product = names.get(row.productId)
          const ownLead = product?.leadDays ?? 0
          const leadDays = ownLead > 0 ? ownLead : row.purchase ? plead : 0
          return {
            productId: row.productId,
            demandQty: roundQty(row.quantity),
            onHand: have,
            toMake: row.purchase ? 0 : short,
            toBuy: row.purchase ? short : 0,
            bomId: row.bomId,
            source: sourceLabel(row.sources),
            leadDays,
          }
        }),
      },
    },
    include: { lines: true },
  })
  return {
    ...plan,
    lines: plan.lines.map((line) => ({
      ...line,
      product: names.get(line.productId) ?? null,
      purchaseOrder: null,
    })),
  }
}

export async function listProductionPlans(companyId: number) {
  const plans = await prisma.productionPlan.findMany({
    where: { companyId },
    include: { lines: { include: { purchaseOrder: { select: { id: true, name: true, state: true } } } } },
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
    include: { lines: { include: { purchaseOrder: { select: { id: true, name: true, state: true } } } } },
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

function asPercent(ratio: number | null) {
  if (ratio == null || !Number.isFinite(ratio)) return null
  return Math.round(Math.min(1, Math.max(0, ratio)) * 1000) / 10
}

/** OEE from stored cards. Availability is logged time against one day, times the share of the day not lost to downtime. Empty stations stay null. */
export function measureOee(
  station: {
    capacityHours: number
    jobCards: Array<{ plannedQty: number; completedQty: number; rejectedQty: number; logs: Array<{ minutes: number }> }>
  },
  downtimeMinutes = 0,
) {
  let logged = 0
  let planned = 0
  let completed = 0
  let rejected = 0
  for (const card of station.jobCards) {
    planned += card.plannedQty
    completed += card.completedQty
    rejected += card.rejectedQty
    for (const log of card.logs) logged += log.minutes
  }
  logged = Math.round(logged * 100) / 100
  const lost = Math.max(0, Math.round(downtimeMinutes * 100) / 100)
  if (logged === 0 && completed === 0 && rejected === 0) {
    return { availability: null, performance: null, quality: null, oee: null, loggedMinutes: 0, downtimeMinutes: lost }
  }
  const capacity = station.capacityHours * 60
  const open = capacity > 0 ? Math.max(0, (capacity - Math.min(lost, capacity)) / capacity) : null
  const availability = capacity > 0 && open != null ? Math.min(1, logged / capacity) * open : null
  const performance = planned > 0 ? Math.min(1, completed / planned) : null
  const touched = completed + rejected
  const quality = touched > 0 ? completed / touched : null
  const oee = availability != null && performance != null && quality != null ? availability * performance * quality : null
  return {
    availability: asPercent(availability),
    performance: asPercent(performance),
    quality: asPercent(quality),
    oee: asPercent(oee),
    loggedMinutes: logged,
    downtimeMinutes: lost,
  }
}

function normalizeDays(value: string) {
  const days = [...new Set(value.split(',').map((part) => Number(part.trim())))]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b)
  return days.join(',')
}

function loggedCost(minutes: number, hourRate: number) {
  return roundMoney((minutes / 60) * hourRate)
}

export async function listWorkstations(companyId: number) {
  const feedDowntime = (await readSetting(prisma, companyId, 'manufacturing', 'downtime', 'yes')) !== 'no'
  const [stations, downtime] = await Promise.all([
    prisma.workstation.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      include: {
        jobCards: {
          select: {
            plannedQty: true,
            completedQty: true,
            rejectedQty: true,
            logs: { select: { minutes: true } },
          },
        },
      },
    }),
    feedDowntime
      ? prisma.downtimeEntry.groupBy({
        by: ['workstationId'],
        where: { companyId, state: 'confirmed' },
        _sum: { minutes: true },
      })
      : Promise.resolve([]),
  ])
  const lost = new Map(downtime.map((row) => [row.workstationId, row._sum.minutes ?? 0]))
  return stations.map((station) => {
    const measured = measureOee(station, lost.get(station.id) ?? 0)
    return {
      id: station.id,
      name: station.name,
      hourRate: station.hourRate,
      capacityHours: station.capacityHours,
      startMinutes: station.startMinutes,
      endMinutes: station.endMinutes,
      workingDays: station.workingDays,
      efficiency: station.efficiency,
      jobCardCount: station.jobCards.length,
      ...measured,
    }
  })
}

export async function saveWorkstation(companyId: number, input: WorkstationInput, id?: number) {
  if (input.endMinutes <= input.startMinutes) throw new AppError(400, 'The shift must end after it starts.')
  const workingDays = normalizeDays(input.workingDays)
  if (!workingDays) throw new AppError(400, 'Choose at least one working day.')
  const data = {
    name: input.name,
    hourRate: input.hourRate,
    capacityHours: input.capacityHours,
    startMinutes: input.startMinutes,
    endMinutes: input.endMinutes,
    workingDays,
    efficiency: input.efficiency,
  }
  if (!id) return prisma.workstation.create({ data: { companyId, ...data } })
  const existing = await prisma.workstation.findFirst({ where: { id, companyId } })
  if (!existing) throw new AppError(404, 'Workstation not found.')
  return prisma.workstation.update({ where: { id }, data })
}

export async function listRoutings(companyId: number) {
  const rows = await prisma.bomOperation.findMany({
    where: { bom: { companyId, active: true } },
    include: {
      workstation: { select: { id: true, name: true, hourRate: true, efficiency: true } },
      bom: { select: { id: true, version: true, product: { select: { id: true, name: true, sku: true } } } },
    },
    orderBy: [{ bomId: 'asc' }, { sequence: 'asc' }],
  })
  return rows.map((row) => ({
    id: row.id,
    sequence: row.sequence,
    name: row.name,
    hours: row.hours,
    lossPercent: row.lossPercent,
    cost: roundMoney(row.hours * row.workstation.hourRate * (1 + row.lossPercent / 100)),
    workstation: row.workstation,
    bom: row.bom,
  }))
}

export async function listJobCards(companyId: number) {
  const cards = await prisma.jobCard.findMany({
    where: { companyId },
    include: cardInclude,
    orderBy: { id: 'desc' },
    take: 200,
  })
  return cards.map((card) => {
    const minutes = Math.round(card.logs.reduce((sum, log) => sum + log.minutes, 0) * 100) / 100
    const open = card.logs.find((log) => log.startedAt && !log.endedAt) ?? null
    return {
      ...card,
      loggedMinutes: minutes,
      loggedCost: loggedCost(minutes, card.workstation?.hourRate ?? 0),
      runningSince: open?.startedAt ?? null,
    }
  })
}
