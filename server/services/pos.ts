import { lineAmounts, roundMoney, sumLines } from '../../src/domain/money.ts'
import type { PosOrderInput, PosRefundInput, PosSessionCloseInput, PosSessionOpenInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import type { SessionUser } from '../auth.ts'
import { applyQuant, companyLocations, onHand, roundQty, warehouseStockLocation } from './stock.ts'
import { resolvePrice } from './trade.ts'
import { valueDoneMove } from './valuation.ts'

const orderInclude = {
  customer: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  session: { select: { id: true, name: true, state: true } },
  lines: {
    include: { product: { select: { id: true, name: true, sku: true, barcode: true } } },
    orderBy: { id: 'asc' as const },
  },
  payments: { orderBy: { id: 'asc' as const } },
  createdBy: { select: { id: true, name: true } },
}

const sessionInclude = {
  warehouse: { select: { id: true, name: true, code: true } },
  openedBy: { select: { id: true, name: true } },
  closedBy: { select: { id: true, name: true } },
}

type PaymentRow = { method: string; direction: string; amount: number }

function methodTotals(payments: PaymentRow[], direction: string) {
  const totals: Record<string, number> = { cash: 0, card: 0, wechat: 0, alipay: 0 }
  for (const payment of payments) {
    if (payment.direction !== direction) continue
    totals[payment.method] = roundMoney((totals[payment.method] ?? 0) + payment.amount)
  }
  return totals
}

async function nextName(tx: Tx, sequenceName: string, prefix: string) {
  const sequence = await tx.sequence.update({
    where: { name: sequenceName },
    data: { next: { increment: 1 } },
  })
  return `${prefix}${String(sequence.next).padStart(4, '0')}`
}

function moneyMatches(left: number, right: number) {
  return Math.abs(left - right) < 0.001
}

function cashParts(method: string, amount: number, tendered: number | undefined) {
  if (method !== 'cash') return { tendered: null as number | null, change: null as number | null }
  const received = tendered ?? amount
  if (received + 0.001 < amount) {
    throw new AppError(400, 'Cash received is less than the cash amount.')
  }
  return { tendered: roundMoney(received), change: roundMoney(received - amount) }
}

async function summarize(tx: Tx, session: { id: number; openingCash: number }) {
  const orders = await tx.posOrder.findMany({
    where: { sessionId: session.id },
    include: { payments: true },
  })
  const payments = orders.flatMap((order) => order.payments)
  const salesTotal = roundMoney(orders.reduce((sum, order) => sum + order.amountTotal, 0))
  const refundTotal = roundMoney(orders.reduce((sum, order) => sum + order.amountRefunded, 0))
  const byMethod = methodTotals(payments, 'payment')
  const refunds = methodTotals(payments, 'refund')
  const expectedCash = roundMoney(session.openingCash + byMethod.cash - refunds.cash)
  return {
    orderCount: orders.length,
    salesTotal,
    refundTotal,
    net: roundMoney(salesTotal - refundTotal),
    expectedCash,
    payments: byMethod,
    refunds,
  }
}

async function presentSession(tx: Tx, sessionId: number) {
  const session = await tx.posSession.findFirstOrThrow({ where: { id: sessionId }, include: sessionInclude })
  return { ...session, summary: await summarize(tx, session) }
}

export async function listSessions(companyId: number, state?: string) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.posSession.findMany({
      where: { companyId, ...(state && state !== 'all' ? { state } : {}) },
      include: sessionInclude,
      orderBy: { id: 'desc' },
      take: 100,
    })
    const presented = []
    for (const row of rows) {
      presented.push({ ...row, summary: await summarize(tx, row) })
    }
    return presented
  })
}

export async function getSession(companyId: number, sessionId: number) {
  const session = await prisma.posSession.findFirst({ where: { id: sessionId, companyId } })
  if (!session) throw new AppError(404, 'Session not found.')
  return prisma.$transaction((tx) => presentSession(tx, session.id))
}

export async function openPosSession(companyId: number, userId: number, input: PosSessionOpenInput) {
  return prisma.$transaction(async (tx) => {
    await warehouseStockLocation(tx, companyId, input.warehouseId)
    const open = await tx.posSession.findFirst({
      where: { companyId, warehouseId: input.warehouseId, state: 'open' },
    })
    if (open) throw new AppError(409, 'This shop already has an open session.')
    const created = await tx.posSession.create({
      data: {
        name: await nextName(tx, 'pos.session', 'SES'),
        state: 'open',
        warehouseId: input.warehouseId,
        companyId,
        openingCash: roundMoney(input.openingCash),
        openedById: userId,
      },
    })
    return presentSession(tx, created.id)
  })
}

export async function closePosSession(user: SessionUser, sessionId: number, input: PosSessionCloseInput) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.posSession.findFirst({ where: { id: sessionId, companyId: user.companyId } })
    if (!session) throw new AppError(404, 'Session not found.')
    if (session.state !== 'open') throw new AppError(409, 'This session is already closed.')
    const summary = await summarize(tx, session)
    const closingCash = roundMoney(input.closingCash)
    const difference = roundMoney(closingCash - summary.expectedCash)
    if (!moneyMatches(difference, 0) && user.role !== 'admin') {
      throw new AppError(403, 'Only an admin can close a session when the counted cash does not match.')
    }
    await tx.posSession.update({
      where: { id: session.id },
      data: {
        state: 'closed',
        closingCash,
        difference,
        note: input.note,
        closedById: user.id,
        closedAt: new Date(),
      },
    })
    return presentSession(tx, session.id)
  })
}

export async function posCatalog(companyId: number, warehouseId: number) {
  const snapshot = await prisma.$transaction(async (tx) => {
    const { warehouse, location } = await warehouseStockLocation(tx, companyId, warehouseId)
    const products = await tx.product.findMany({
      where: { companyId, type: 'product', kind: 'finished', active: true },
      include: { category: true, quants: { where: { locationId: location.id } } },
      orderBy: { name: 'asc' },
    })
    const categories = await tx.productCategory.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
    })
    return {
      warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code },
      location: { id: location.id, name: location.name },
      categories: categories.map((category) => ({ id: category.id, name: category.name })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        barcode: product.barcode,
        listPrice: product.listPrice,
        categoryId: product.categoryId,
        categoryName: product.category?.name ?? null,
        onHand: product.quants[0]?.quantity ?? 0,
      })),
    }
  })
  return snapshot
}

async function pricedLines(tx: Tx, companyId: number, lines: PosOrderInput['lines'], taxRate: number, customerId: number | null) {
  const products = await tx.product.findMany({
    where: { companyId, id: { in: lines.map((line) => line.productId) } },
  })
  const byId = new Map(products.map((product) => [product.id, product]))
  const priced = []
  for (const line of lines) {
    const product = byId.get(line.productId)
    if (!product || product.type !== 'product' || !product.active) {
      throw new AppError(400, 'Choose a product that is still for sale.')
    }
    const quote = await resolvePrice(companyId, {
      side: 'sales',
      productId: product.id,
      quantity: line.quantity,
      customerId,
    })
    const discount = line.discount && line.discount > 0 ? line.discount : quote.discount
    const amounts = lineAmounts({
      quantity: line.quantity,
      unitPrice: quote.unitPrice,
      discount,
      taxRate,
    })
    priced.push({
      product,
      quantity: roundQty(line.quantity),
      unitPrice: quote.unitPrice,
      discount,
      taxRate,
      description: product.name,
      ...amounts,
    })
  }
  return priced
}

export async function createPosOrder(companyId: number, userId: number, input: PosOrderInput) {
  return prisma.$transaction(async (tx) => {
    const session = await tx.posSession.findFirst({ where: { id: input.sessionId, companyId } })
    if (!session) throw new AppError(404, 'Session not found.')
    if (session.state !== 'open') throw new AppError(409, 'Open a session before selling.')
    if (input.customerId) {
      const customer = await tx.contact.findFirst({ where: { id: input.customerId, companyId, isCustomer: true } })
      if (!customer) throw new AppError(400, 'Choose a customer.')
    }
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
    const priced = await pricedLines(tx, companyId, input.lines, company.defaultTaxRate, input.customerId ?? null)
    const totals = sumLines(priced)
    const { location } = await warehouseStockLocation(tx, companyId, session.warehouseId)
    const { customer } = await companyLocations(tx, companyId)
    const needed = new Map<number, { name: string; quantity: number }>()
    for (const line of priced) {
      const current = needed.get(line.product.id)
      needed.set(line.product.id, {
        name: line.product.name,
        quantity: roundQty((current?.quantity ?? 0) + line.quantity),
      })
    }
    for (const [productId, need] of needed) {
      const available = await onHand(tx, productId, location.id)
      if (available + 0.0001 < need.quantity) {
        throw new AppError(409, `${need.name} has ${available} on hand and this sale needs ${need.quantity}.`)
      }
    }
    const paid = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amount, 0))
    if (!moneyMatches(paid, totals.amountTotal)) {
      throw new AppError(400, 'Payments must equal the total.')
    }
    const name = await nextName(tx, 'pos.order', 'POS')
    const order = await tx.posOrder.create({
      data: {
        name,
        state: 'paid',
        sessionId: session.id,
        companyId,
        warehouseId: session.warehouseId,
        customerId: input.customerId ?? null,
        amountUntaxed: totals.amountUntaxed,
        amountTax: totals.amountTax,
        amountTotal: totals.amountTotal,
        createdById: userId,
        lines: {
          create: priced.map((line) => ({
            productId: line.product.id,
            description: line.description,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: line.discount,
            taxRate: line.taxRate,
            subtotal: line.subtotal,
            taxAmount: line.taxAmount,
          })),
        },
        payments: {
          create: input.payments.map((payment) => {
            const cash = cashParts(payment.method, payment.amount, payment.tendered)
            return {
              method: payment.method,
              direction: 'payment',
              amount: roundMoney(payment.amount),
              tendered: cash.tendered,
              change: cash.change,
            }
          }),
        },
      },
    })
    for (const [productId, need] of needed) {
      await applyQuant(tx, productId, location.id, -need.quantity)
      await applyQuant(tx, productId, customer.id, need.quantity)
      const move = await tx.stockMove.create({
        data: {
          productId,
          locationFromId: location.id,
          locationToId: customer.id,
          quantity: need.quantity,
          state: 'done',
          reference: name,
          posOrderId: order.id,
          date: new Date(),
        },
      })
      await valueDoneMove(tx, companyId, move.id)
    }
    return tx.posOrder.findFirstOrThrow({ where: { id: order.id }, include: orderInclude })
  })
}

export async function listPosOrders(companyId: number, warehouseId?: number) {
  return prisma.posOrder.findMany({
    where: { companyId, ...(warehouseId ? { warehouseId } : {}) },
    include: orderInclude,
    orderBy: { id: 'desc' },
    take: 200,
  })
}

export async function getPosOrder(companyId: number, orderId: number) {
  const order = await prisma.posOrder.findFirst({ where: { id: orderId, companyId }, include: orderInclude })
  if (!order) throw new AppError(404, 'Sale not found.')
  return order
}

export async function refundPosOrder(user: SessionUser, orderId: number, input: PosRefundInput) {
  if (user.role !== 'admin') throw new AppError(403, 'Only an admin can refund a sale.')
  return prisma.$transaction(async (tx) => {
    const order = await tx.posOrder.findFirst({
      where: { id: orderId, companyId: user.companyId },
      include: { lines: true },
    })
    if (!order) throw new AppError(404, 'Sale not found.')
    if (order.state === 'refunded') throw new AppError(409, 'This sale is already refunded.')
    const session = await tx.posSession.findFirst({ where: { id: order.sessionId, companyId: user.companyId } })
    if (!session || session.state !== 'open') throw new AppError(409, 'Refunds stay on an open session.')
    const { location } = await warehouseStockLocation(tx, user.companyId, order.warehouseId)
    const { customer } = await companyLocations(tx, user.companyId)
    const refundLines = input.lines.map((request) => {
      const line = order.lines.find((row) => row.id === request.lineId)
      if (!line) throw new AppError(400, 'That line is not on this sale.')
      const quantity = roundQty(request.quantity)
      const left = roundQty(line.quantity - line.refundedQty)
      if (quantity > left + 0.0001) {
        throw new AppError(409, `${line.description} only has ${left} left to refund.`)
      }
      const amounts = lineAmounts({
        quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: line.taxRate,
      })
      return { line, quantity, total: amounts.total }
    })
    const refundTotal = roundMoney(refundLines.reduce((sum, line) => sum + line.total, 0))
    const paidBack = roundMoney(input.payments.reduce((sum, payment) => sum + payment.amount, 0))
    if (!moneyMatches(paidBack, refundTotal)) {
      throw new AppError(400, 'Refund payments must equal the refund total.')
    }
    for (const refund of refundLines) {
      await tx.posOrderLine.update({
        where: { id: refund.line.id },
        data: { refundedQty: roundQty(refund.line.refundedQty + refund.quantity) },
      })
      await applyQuant(tx, refund.line.productId, customer.id, -refund.quantity)
      await applyQuant(tx, refund.line.productId, location.id, refund.quantity)
      const move = await tx.stockMove.create({
        data: {
          productId: refund.line.productId,
          locationFromId: customer.id,
          locationToId: location.id,
          quantity: refund.quantity,
          state: 'done',
          reference: `${order.name} refund`,
          posOrderId: order.id,
          date: new Date(),
        },
      })
      await valueDoneMove(tx, order.companyId, move.id)
    }
    await tx.posPayment.createMany({
      data: input.payments.map((payment) => ({
        orderId: order.id,
        method: payment.method,
        direction: 'refund',
        amount: roundMoney(payment.amount),
        tendered: null,
        change: null,
      })),
    })
    const lines = await tx.posOrderLine.findMany({ where: { orderId: order.id } })
    const fully = lines.every((line) => line.refundedQty + 0.0001 >= line.quantity)
    const amountRefunded = roundMoney(order.amountRefunded + refundTotal)
    await tx.posOrder.update({
      where: { id: order.id },
      data: { amountRefunded, state: fully ? 'refunded' : 'partial' },
    })
    return tx.posOrder.findFirstOrThrow({ where: { id: order.id }, include: orderInclude })
  })
}

export async function posReport(companyId: number, warehouseId: number, date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new AppError(400, 'Choose a date.')
  const start = new Date(`${date}T00:00:00.000Z`)
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  if (Number.isNaN(start.getTime())) throw new AppError(400, 'Choose a date.')
  const warehouse = await prisma.warehouse.findFirst({ where: { id: warehouseId, companyId } })
  if (!warehouse) throw new AppError(404, 'Shop not found.')
  const orders = await prisma.posOrder.findMany({
    where: { companyId, warehouseId, createdAt: { gte: start, lt: end } },
    include: { payments: true, customer: { select: { name: true } } },
    orderBy: { id: 'asc' },
  })
  const payments = orders.flatMap((order) => order.payments)
  const salesTotal = roundMoney(orders.reduce((sum, order) => sum + order.amountTotal, 0))
  const refundTotal = roundMoney(orders.reduce((sum, order) => sum + order.amountRefunded, 0))
  return {
    date,
    warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code },
    orderCount: orders.length,
    salesTotal,
    refundTotal,
    net: roundMoney(salesTotal - refundTotal),
    payments: methodTotals(payments, 'payment'),
    refunds: methodTotals(payments, 'refund'),
    orders: orders.map((order) => ({
      id: order.id,
      name: order.name,
      state: order.state,
      amountTotal: order.amountTotal,
      amountRefunded: order.amountRefunded,
      customerName: order.customer?.name ?? null,
      createdAt: order.createdAt,
    })),
  }
}
