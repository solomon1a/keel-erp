import { roundMoney } from '../../src/domain/money.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { assertBooksOpen } from './locks.ts'
import { roundQty } from './stock.ts'

const stockAccounts = [
  ['2203', 'Goods received not invoiced', 'liability'],
  ['1407', 'Work in progress', 'asset'],
] as const

async function ensureStockAccounts(tx: Tx, companyId: number) {
  for (const [code, name, type] of stockAccounts) {
    const existing = await tx.account.findFirst({ where: { companyId, code } })
    if (!existing) await tx.account.create({ data: { companyId, code, name, type } })
  }
  await tx.sequence.upsert({
    where: { name: `account.entry.${companyId}` },
    update: {},
    create: { name: `account.entry.${companyId}`, next: 0 },
  })
}

async function nextEntryName(tx: Tx, companyId: number) {
  const sequence = await tx.sequence.update({
    where: { name: `account.entry.${companyId}` },
    data: { next: { increment: 1 } },
  })
  return `JE${String(sequence.next).padStart(4, '0')}`
}

async function internalQty(tx: Tx, productId: number) {
  const rows = await tx.stockQuant.findMany({
    where: { productId, location: { type: 'internal' } },
  })
  return roundQty(rows.reduce((sum, row) => sum + row.quantity, 0))
}

function receiptCredit(fromType: string) {
  switch (fromType) {
    case 'production':
      return '1407'
    case 'customer':
      return '6401'
    case 'supplier':
    case 'inventory':
    case 'internal':
      return '2203'
    default:
      return '2203'
  }
}

function issueDebit(toType: string) {
  switch (toType) {
    case 'production':
      return '1407'
    case 'customer':
    case 'supplier':
    case 'inventory':
    case 'internal':
      return '6401'
    default:
      return '6401'
  }
}

async function postPair(tx: Tx, companyId: number, date: Date, label: string, debitCode: string, creditCode: string, value: number) {
  if (value <= 0.0001) return null
  const accounts = await tx.account.findMany({ where: { companyId, code: { in: [debitCode, creditCode, '1405'] } } })
  const byCode = new Map(accounts.map((row) => [row.code, row]))
  const debit = byCode.get(debitCode)
  const credit = byCode.get(creditCode)
  const journal = await tx.journal.findFirst({ where: { companyId, code: 'GEN' } })
  if (!debit || !credit || !journal) throw new AppError(500, 'Stock accounts are missing.')
  return tx.journalEntry.create({
    data: {
      name: await nextEntryName(tx, companyId),
      journalId: journal.id,
      date,
      companyId,
      lines: {
        create: [
          { accountId: debit.id, debit: value, credit: 0, label },
          { accountId: credit.id, debit: 0, credit: value, label },
        ],
      },
    },
  })
}

async function consumeRemaining(tx: Tx, companyId: number, productId: number, quantity: number) {
  let left = quantity
  const layers = await tx.valuationLayer.findMany({
    where: { companyId, productId, remaining: { gt: 0 } },
    orderBy: { id: 'asc' },
  })
  for (const layer of layers) {
    if (left <= 0.0001) break
    const take = Math.min(layer.remaining, left)
    await tx.valuationLayer.update({
      where: { id: layer.id },
      data: { remaining: roundQty(layer.remaining - take) },
    })
    left = roundQty(left - take)
  }
}

async function consumeFifo(tx: Tx, companyId: number, productId: number, quantity: number, fallback: number) {
  let left = quantity
  let cost = 0
  const layers = await tx.valuationLayer.findMany({
    where: { companyId, productId, remaining: { gt: 0 } },
    orderBy: { id: 'asc' },
  })
  for (const layer of layers) {
    if (left <= 0.0001) break
    const take = Math.min(layer.remaining, left)
    cost += take * layer.unitCost
    await tx.valuationLayer.update({
      where: { id: layer.id },
      data: { remaining: roundQty(layer.remaining - take) },
    })
    left = roundQty(left - take)
  }
  if (left > 0.0001) cost += left * fallback
  return roundMoney(cost)
}

export async function valueDoneMove(tx: Tx, companyId: number, moveId: number) {
  const move = await tx.stockMove.findFirst({
    where: { id: moveId },
    include: { product: true, locationFrom: true, locationTo: true },
  })
  if (!move || move.product.companyId !== companyId) return
  if (move.product.type !== 'product') return
  const fromInternal = move.locationFrom.type === 'internal'
  const toInternal = move.locationTo.type === 'internal'
  if (fromInternal === toInternal) return
  await assertBooksOpen(tx, companyId, move.date, false)
  await ensureStockAccounts(tx, companyId)
  const method = move.product.costMethod === 'fifo' ? 'fifo' : 'avco'
  let incoming = roundMoney(move.product.costPrice)
  if (move.purchaseOrderId) {
    const line = await tx.purchaseOrderLine.findFirst({
      where: { orderId: move.purchaseOrderId, productId: move.productId },
    })
    if (line) incoming = roundMoney(line.unitCost)
  }
  if (!fromInternal && toInternal) {
    const after = await internalQty(tx, move.productId)
    const before = roundQty(Math.max(0, after - move.quantity))
    const oldAvg = roundMoney(move.product.costPrice)
    const avg = after > 0.0001 ? roundMoney((before * oldAvg + move.quantity * incoming) / after) : incoming
    if (method === 'avco') {
      await tx.product.update({ where: { id: move.productId }, data: { costPrice: avg } })
    }
    const value = roundMoney(incoming * move.quantity)
    const entry = await postPair(tx, companyId, move.date, move.reference, '1405', receiptCredit(move.locationFrom.type), value)
    await tx.valuationLayer.create({
      data: {
        companyId,
        productId: move.productId,
        moveId: move.id,
        quantity: move.quantity,
        remaining: move.quantity,
        unitCost: incoming,
        value,
        method,
        entryId: entry?.id,
      },
    })
    return
  }
  const fallback = roundMoney(move.product.costPrice)
  const value = method === 'fifo'
    ? await consumeFifo(tx, companyId, move.productId, move.quantity, fallback)
    : roundMoney(fallback * move.quantity)
  if (method === 'avco') await consumeRemaining(tx, companyId, move.productId, move.quantity)
  const entry = await postPair(tx, companyId, move.date, move.reference, issueDebit(move.locationTo.type), '1405', value)
  await tx.valuationLayer.create({
    data: {
      companyId,
      productId: move.productId,
      moveId: move.id,
      quantity: -move.quantity,
      remaining: 0,
      unitCost: move.quantity > 0 ? roundMoney(value / move.quantity) : 0,
      value: -value,
      method,
      entryId: entry?.id,
    },
  })
}

export async function setCostMethod(companyId: number, productId: number, method: string) {
  if (method !== 'fifo' && method !== 'avco') throw new AppError(400, 'Cost method is fifo or avco.')
  const product = await prisma.product.findFirst({ where: { id: productId, companyId } })
  if (!product) throw new AppError(404, 'Product not found.')
  return prisma.product.update({
    where: { id: product.id },
    data: { costMethod: method },
    select: { id: true, name: true, sku: true, costMethod: true, costPrice: true },
  })
}

export async function listValuation(companyId: number) {
  return prisma.valuationLayer.findMany({
    where: { companyId },
    include: { product: { select: { id: true, name: true, sku: true, costMethod: true, costPrice: true } } },
    orderBy: { id: 'desc' },
    take: 80,
  })
}
