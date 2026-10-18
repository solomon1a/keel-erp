import { roundMoney } from '../../src/domain/money.ts'
import type { Tx } from '../db.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'
import { applyQuant, companyLocations, onHand, roundQty } from './stock.ts'
import { postValuationJournal, valueDoneMove } from './valuation.ts'

export type QualityTrigger = 'receipt' | 'operation' | 'delivery'
export type CheckType = 'pass_fail' | 'measure' | 'checklist'
export type AlertAction = 'rework' | 'scrap' | 'return_vendor'

type CheckSpec = {
  trigger: QualityTrigger
  productIds: number[]
  purchaseOrderId?: number
  salesOrderId?: number
  manufacturingOrderId?: number
  operationNames?: string[]
  vendorId?: number | null
  quantity?: number
}

const checkInclude = {
  product: { select: { id: true, name: true, sku: true } },
  point: { select: { id: true, name: true, checkType: true, minValue: true, maxValue: true, checklist: true, operationName: true } },
  vendor: { select: { id: true, name: true } },
  alert: { select: { id: true, status: true, action: true, quantity: true, heldFrom: true } },
} as const

function asTrigger(value: string): QualityTrigger {
  switch (value) {
    case 'receipt':
    case 'operation':
    case 'delivery':
      return value
    default:
      throw new AppError(400, 'Choose receipt, operation, or delivery.')
  }
}

function asCheckType(value: string): CheckType {
  switch (value) {
    case 'pass_fail':
    case 'measure':
    case 'checklist':
      return value
    default:
      throw new AppError(400, 'Choose pass/fail, a measurement, or a checklist.')
  }
}

function asAction(value: string): AlertAction {
  switch (value) {
    case 'rework':
    case 'scrap':
    case 'return_vendor':
      return value
    default:
      throw new AppError(400, 'Choose rework, scrap, or return to vendor.')
  }
}

function documentWhere(spec: CheckSpec) {
  return {
    purchaseOrderId: spec.purchaseOrderId ?? null,
    salesOrderId: spec.salesOrderId ?? null,
    manufacturingOrderId: spec.manufacturingOrderId ?? null,
  }
}

export async function listPoints(companyId: number) {
  return prisma.qualityPoint.findMany({
    where: { companyId },
    include: { product: { select: { id: true, name: true, sku: true } } },
    orderBy: { id: 'asc' },
  })
}

export async function createPoint(
  companyId: number,
  input: {
    name: string
    productId: number
    trigger: string
    operationName?: string
    checkType: string
    minValue?: number | null
    maxValue?: number | null
    checklist?: string
  },
) {
  const trigger = asTrigger(input.trigger)
  const checkType = asCheckType(input.checkType)
  const product = await prisma.product.findFirst({ where: { id: input.productId, companyId } })
  if (!product) throw new AppError(404, 'Product not found.')
  if (trigger === 'operation' && !input.operationName?.trim()) {
    throw new AppError(400, 'Name the manufacturing operation this check belongs to.')
  }
  if (checkType === 'measure' && input.minValue == null && input.maxValue == null) {
    throw new AppError(400, 'A measurement needs a minimum, a maximum, or both.')
  }
  if (checkType === 'checklist' && !input.checklist?.trim()) {
    throw new AppError(400, 'Add at least one checklist line.')
  }
  return prisma.qualityPoint.create({
    data: {
      companyId,
      name: input.name.trim(),
      productId: product.id,
      trigger,
      operationName: input.operationName?.trim() ?? '',
      checkType,
      minValue: input.minValue ?? null,
      maxValue: input.maxValue ?? null,
      checklist: input.checklist?.trim() ?? '',
    },
    include: { product: { select: { id: true, name: true, sku: true } } },
  })
}

export async function listChecks(companyId: number) {
  return prisma.qualityCheck.findMany({
    where: { companyId },
    include: checkInclude,
    orderBy: { id: 'desc' },
  })
}

export async function qualityDashboard(companyId: number) {
  const checks = await prisma.qualityCheck.findMany({
    where: { companyId },
    include: { product: { select: { id: true, name: true } }, vendor: { select: { id: true, name: true } } },
  })
  const alerts = await prisma.qualityAlert.count({ where: { companyId, status: 'open' } })
  const passed = checks.filter((row) => row.status === 'pass').length
  const failed = checks.filter((row) => row.status === 'fail').length
  const decided = passed + failed
  const byProduct = new Map<number, { productId: number; name: string; pass: number; fail: number; pending: number }>()
  const byVendor = new Map<number, { vendorId: number; name: string; pass: number; fail: number; pending: number }>()
  for (const check of checks) {
    const product = byProduct.get(check.productId) ?? { productId: check.productId, name: check.product.name, pass: 0, fail: 0, pending: 0 }
    const vendor = check.vendor
      ? byVendor.get(check.vendor.id) ?? { vendorId: check.vendor.id, name: check.vendor.name, pass: 0, fail: 0, pending: 0 }
      : null
    switch (check.status) {
      case 'pass':
        product.pass += 1
        if (vendor) vendor.pass += 1
        break
      case 'fail':
        product.fail += 1
        if (vendor) vendor.fail += 1
        break
      case 'pending':
        product.pending += 1
        if (vendor) vendor.pending += 1
        break
      default:
        break
    }
    byProduct.set(check.productId, product)
    if (vendor && check.vendor) byVendor.set(check.vendor.id, vendor)
  }
  return {
    passRate: decided === 0 ? null : roundMoney((passed / decided) * 100),
    passed,
    failed,
    pending: checks.filter((row) => row.status === 'pending').length,
    openAlerts: alerts,
    byProduct: [...byProduct.values()],
    byVendor: [...byVendor.values()],
  }
}

export async function listAlerts(companyId: number) {
  return prisma.qualityAlert.findMany({
    where: { companyId },
    include: {
      product: { select: { id: true, name: true, sku: true } },
      vendor: { select: { id: true, name: true } },
      check: { select: { id: true, status: true, trigger: true, purchaseOrderId: true, salesOrderId: true, manufacturingOrderId: true } },
      entry: { select: { id: true, name: true } },
    },
    orderBy: { id: 'desc' },
  })
}

async function quarantineLocation(tx: Tx, companyId: number) {
  const existing = await tx.stockLocation.findFirst({ where: { companyId, type: 'quarantine' } })
  if (existing) return existing
  return tx.stockLocation.create({ data: { companyId, name: 'Quarantine', type: 'quarantine' } })
}

async function parkFromSupplier(tx: Tx, companyId: number, purchaseOrderId: number, productId: number, quantity: number) {
  const order = await tx.purchaseOrder.findFirst({
    where: { id: purchaseOrderId, companyId },
    include: { lines: true },
  })
  if (!order) throw new AppError(404, 'Purchase order not found.')
  const line = order.lines.find((row) => row.productId === productId)
  const unit = line?.unitCost ?? 0
  const locations = await companyLocations(tx, companyId)
  const quarantine = await quarantineLocation(tx, companyId)
  await applyQuant(tx, productId, locations.supplier.id, -quantity)
  await applyQuant(tx, productId, quarantine.id, quantity)
  const value = roundMoney(unit * quantity)
  await postValuationJournal(tx, companyId, new Date(), `${order.name} quarantine`, '1410', '2203', value)
  await tx.stockMove.updateMany({
    where: { purchaseOrderId, productId, state: 'draft' },
    data: { state: 'cancel' },
  })
  await tx.stockMove.create({
    data: {
      productId,
      locationFromId: locations.supplier.id,
      locationToId: quarantine.id,
      quantity,
      state: 'done',
      reference: `${order.name} quarantine`,
      purchaseOrderId,
      date: new Date(),
    },
  })
  return { heldFrom: 'supplier' as const, quantity, value }
}

async function parkFromShelf(tx: Tx, companyId: number, productId: number, quantity: number, reference: string) {
  const locations = await companyLocations(tx, companyId)
  const available = await onHand(tx, productId, locations.internal.id)
  const take = roundQty(Math.min(quantity, available))
  if (take <= 0.0001) return { heldFrom: 'none' as const, quantity: 0, value: 0 }
  const quarantine = await quarantineLocation(tx, companyId)
  await applyQuant(tx, productId, locations.internal.id, -take)
  await applyQuant(tx, productId, quarantine.id, take)
  const move = await tx.stockMove.create({
    data: {
      productId,
      locationFromId: locations.internal.id,
      locationToId: quarantine.id,
      quantity: take,
      state: 'done',
      reference,
      date: new Date(),
    },
  })
  await valueDoneMove(tx, companyId, move.id)
  const ledger = await tx.stockLedger.findFirst({ where: { moveId: move.id } })
  return { heldFrom: 'stock' as const, quantity: take, value: roundMoney(Math.abs(ledger?.value ?? 0)) }
}

export async function ensureQualityChecks(tx: Tx, companyId: number, spec: CheckSpec) {
  const trigger = asTrigger(spec.trigger)
  const names = new Set((spec.operationNames ?? []).map((name) => name.trim().toLowerCase()))
  const points = await tx.qualityPoint.findMany({
    where: { companyId, active: true, trigger, productId: { in: spec.productIds } },
  })
  for (const point of points) {
    if (trigger === 'operation') {
      const wanted = point.operationName.trim().toLowerCase()
      if (!wanted || !names.has(wanted)) continue
    }
    const existing = await tx.qualityCheck.findFirst({
      where: {
        companyId,
        pointId: point.id,
        ...documentWhere(spec),
        operationName: trigger === 'operation' ? point.operationName : '',
      },
    })
    if (existing) continue
    await tx.qualityCheck.create({
      data: {
        companyId,
        pointId: point.id,
        productId: point.productId,
        trigger,
        operationName: trigger === 'operation' ? point.operationName : '',
        quantity: spec.quantity ?? 0,
        purchaseOrderId: spec.purchaseOrderId,
        salesOrderId: spec.salesOrderId,
        manufacturingOrderId: spec.manufacturingOrderId,
        vendorId: spec.vendorId ?? null,
      },
    })
  }
}

export async function assertQualityClear(tx: Tx, companyId: number, spec: CheckSpec) {
  const document = spec.purchaseOrderId
    ? { purchaseOrderId: spec.purchaseOrderId }
    : spec.salesOrderId
      ? { salesOrderId: spec.salesOrderId }
      : spec.manufacturingOrderId
        ? { manufacturingOrderId: spec.manufacturingOrderId }
        : { productId: { in: spec.productIds } }
  const rows = await tx.qualityCheck.findMany({
    where: {
      companyId,
      trigger: spec.trigger,
      ...document,
      status: { in: ['pending', 'fail'] },
      overrideReason: null,
    },
    include: { product: { select: { name: true } } },
  })
  const blocking = spec.trigger === 'operation'
    ? rows.filter((row) => (spec.operationNames ?? []).some((name) => name.trim().toLowerCase() === row.operationName.trim().toLowerCase()))
    : rows
  const first = blocking[0]
  if (!first) return
  const noun = spec.trigger === 'receipt' ? 'receipt' : spec.trigger === 'delivery' ? 'delivery' : 'production'
  const why = first.status === 'fail' ? 'failed its quality check' : 'has a pending quality check'
  throw new AppError(
    409,
    `${first.product.name} ${why}, so this ${noun} cannot be validated. Record a pass, or an admin can override with a reason.`,
    { qualityCheckId: first.id },
  )
}

async function loadSpec(companyId: number, spec: CheckSpec): Promise<CheckSpec> {
  if (spec.purchaseOrderId) {
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: spec.purchaseOrderId, companyId },
      include: { moves: true, lines: true },
    })
    if (!order) throw new AppError(404, 'Purchase order not found.')
    const moves = order.moves.filter((move) => move.state === 'draft')
    const productIds = [...new Set(moves.map((move) => move.productId))]
    const quantity = moves.reduce((sum, move) => sum + move.quantity, 0)
    return { ...spec, productIds, vendorId: order.vendorId, quantity }
  }
  if (spec.salesOrderId) {
    const order = await prisma.salesOrder.findFirst({
      where: { id: spec.salesOrderId, companyId },
      include: { moves: true },
    })
    if (!order) throw new AppError(404, 'Order not found.')
    const moves = order.moves.filter((move) => move.state === 'draft')
    return {
      ...spec,
      productIds: [...new Set(moves.map((move) => move.productId))],
      quantity: moves.reduce((sum, move) => sum + move.quantity, 0),
    }
  }
  if (spec.manufacturingOrderId) {
    const order = await prisma.manufacturingOrder.findFirst({
      where: { id: spec.manufacturingOrderId, companyId },
      include: { lines: true, jobCards: true },
    })
    if (!order) throw new AppError(404, 'Manufacturing order not found.')
    return {
      ...spec,
      productIds: [order.productId, ...order.lines.map((line) => line.productId)],
      operationNames: order.jobCards.map((card) => card.operationName),
      quantity: order.quantity,
    }
  }
  return spec
}

export async function prepareQualityChecks(companyId: number, spec: CheckSpec) {
  const ready = await loadSpec(companyId, spec)
  if (ready.productIds.length === 0) return
  await prisma.$transaction(async (tx) => {
    await ensureQualityChecks(tx, companyId, ready)
  })
}

function decide(
  checkType: CheckType,
  point: { minValue: number | null; maxValue: number | null; checklist: string },
  input: { status?: 'pass' | 'fail'; measured?: number | null; checklist?: string[] },
) {
  switch (checkType) {
    case 'pass_fail':
      if (input.status !== 'pass' && input.status !== 'fail') throw new AppError(400, 'Mark the check pass or fail.')
      return input.status
    case 'measure': {
      if (input.measured == null || Number.isNaN(input.measured)) throw new AppError(400, 'Enter the measurement.')
      const min = point.minValue ?? Number.NEGATIVE_INFINITY
      const max = point.maxValue ?? Number.POSITIVE_INFINITY
      return input.measured >= min && input.measured <= max ? 'pass' : 'fail'
    }
    case 'checklist': {
      const items = point.checklist.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
      const done = new Set(input.checklist ?? [])
      return items.every((item) => done.has(item)) ? 'pass' : 'fail'
    }
    default: {
      const neverType: never = checkType
      throw new AppError(400, `Unknown check type ${String(neverType)}.`)
    }
  }
}

export async function recordCheck(
  companyId: number,
  checkId: number,
  input: { status?: 'pass' | 'fail'; measured?: number | null; checklist?: string[]; notes?: string },
) {
  const check = await prisma.qualityCheck.findFirst({
    where: { id: checkId, companyId },
    include: { point: true, product: true },
  })
  if (!check) throw new AppError(404, 'Quality check not found.')
  if (check.overrideReason) throw new AppError(409, 'An admin already released this check.')
  const checkType = asCheckType(check.point.checkType)
  const status = decide(checkType, check.point, input)
  return prisma.$transaction(async (tx) => {
    const saved = await tx.qualityCheck.update({
      where: { id: check.id },
      data: {
        status,
        measured: input.measured ?? null,
        checklistDone: (input.checklist ?? []).join('\n'),
        notes: input.notes?.trim() ?? check.notes,
        overrideReason: null,
        overrideById: null,
        overrideAt: null,
      },
      include: checkInclude,
    })
    if (status === 'pass') return saved
    const existing = await tx.qualityAlert.findUnique({ where: { checkId: check.id } })
    if (existing) return saved
    const quantity = roundQty(check.quantity > 0 ? check.quantity : 1)
    let heldFrom: 'supplier' | 'stock' | 'none' = 'none'
    let heldQty = 0
    let heldValue = 0
    if (check.trigger === 'receipt' && check.purchaseOrderId) {
      const parked = await parkFromSupplier(tx, companyId, check.purchaseOrderId, check.productId, quantity)
      heldFrom = parked.heldFrom
      heldQty = parked.quantity
      heldValue = parked.value
    } else {
      const parked = await parkFromShelf(tx, companyId, check.productId, quantity, `${check.product.name} quarantine`)
      heldFrom = parked.heldFrom
      heldQty = parked.quantity
      heldValue = parked.value
    }
    await tx.qualityAlert.create({
      data: {
        companyId,
        checkId: check.id,
        productId: check.productId,
        vendorId: check.vendorId,
        quantity: heldQty > 0 ? heldQty : quantity,
        heldFrom,
        value: heldValue,
        note: input.notes?.trim() ?? '',
      },
    })
    return tx.qualityCheck.findFirstOrThrow({ where: { id: check.id }, include: checkInclude })
  })
}

export async function overrideCheck(companyId: number, userId: number, checkId: number, reason: string) {
  const note = reason.trim()
  if (note.length < 3) throw new AppError(400, 'Write a short reason for the override.')
  const check = await prisma.qualityCheck.findFirst({ where: { id: checkId, companyId } })
  if (!check) throw new AppError(404, 'Quality check not found.')
  return prisma.qualityCheck.update({
    where: { id: check.id },
    data: { overrideReason: note, overrideById: userId, overrideAt: new Date() },
    include: checkInclude,
  })
}

async function takeQuarantine(tx: Tx, companyId: number, productId: number, quantity: number) {
  const quarantine = await quarantineLocation(tx, companyId)
  const available = await onHand(tx, productId, quarantine.id)
  if (available + 0.0001 < quantity) {
    throw new AppError(409, 'Quarantine does not have that quantity any more.')
  }
  return quarantine
}

export async function resolveAlert(companyId: number, alertId: number, action: string) {
  const chosen = asAction(action)
  return prisma.$transaction(async (tx) => {
    const alert = await tx.qualityAlert.findFirst({
      where: { id: alertId, companyId },
      include: { product: true, check: true },
    })
    if (!alert) throw new AppError(404, 'Quality alert not found.')
    if (alert.status !== 'open') throw new AppError(409, 'That alert is already resolved.')
    const quantity = roundQty(alert.quantity)
    const locations = await companyLocations(tx, companyId)
    const quarantine = alert.heldFrom !== 'none' && quantity > 0.0001
      ? await takeQuarantine(tx, companyId, alert.productId, quantity)
      : null
    const parkedValue = alert.value > 0.0001 ? alert.value : roundMoney(alert.product.costPrice * quantity)
    let entryId: number | null = null
    switch (chosen) {
      case 'rework': {
        if (quarantine && quantity > 0.0001) {
          await applyQuant(tx, alert.productId, quarantine.id, -quantity)
          await applyQuant(tx, alert.productId, locations.internal.id, quantity)
          const move = await tx.stockMove.create({
            data: {
              productId: alert.productId,
              locationFromId: quarantine.id,
              locationToId: locations.internal.id,
              quantity,
              state: 'done',
              reference: `${alert.product.name} rework`,
              date: new Date(),
            },
          })
          await valueDoneMove(tx, companyId, move.id)
        }
        await tx.qualityCheck.update({
          where: { id: alert.checkId },
          data: { status: 'pending', overrideReason: null, overrideById: null, overrideAt: null },
        })
        break
      }
      case 'scrap': {
        if (quarantine && quantity > 0.0001) {
          await applyQuant(tx, alert.productId, quarantine.id, -quantity)
          const entry = await postValuationJournal(tx, companyId, new Date(), `${alert.product.name} scrap`, '6603', '1410', parkedValue)
          entryId = entry?.id ?? null
        }
        break
      }
      case 'return_vendor': {
        if (quarantine && quantity > 0.0001) {
          await applyQuant(tx, alert.productId, quarantine.id, -quantity)
          await applyQuant(tx, alert.productId, locations.supplier.id, quantity)
          const debit = alert.heldFrom === 'stock' ? '2202' : '2203'
          const entry = await postValuationJournal(tx, companyId, new Date(), `${alert.product.name} return`, debit, '1410', parkedValue)
          entryId = entry?.id ?? null
        }
        break
      }
      default: {
        const neverAction: never = chosen
        throw new AppError(400, `Unknown action ${String(neverAction)}.`)
      }
    }
    return tx.qualityAlert.update({
      where: { id: alert.id },
      data: { status: 'resolved', action: chosen, entryId, resolvedAt: new Date() },
      include: { product: { select: { id: true, name: true, sku: true } }, entry: { select: { id: true, name: true } } },
    })
  })
}
