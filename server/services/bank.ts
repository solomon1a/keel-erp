import { Prisma } from '@prisma/client'
import { roundMoney } from '../../src/domain/money.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'
import { ensureBooks, payInvoiceTx, reversePaymentTx } from './accounting.ts'

function parseCsv(csv: string) {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const parsed = []
  for (const line of rows) {
    const [date, label, amount] = line.split(',').map((cell) => cell.trim())
    if (!date || !label || !amount) throw new AppError(400, 'Each line needs a date, a label, and an amount.')
    if (date.toLowerCase() === 'date') continue
    const when = new Date(date)
    if (Number.isNaN(when.getTime())) throw new AppError(400, `“${date}” is not a date.`)
    const value = Number(amount)
    if (!Number.isFinite(value) || value === 0) throw new AppError(400, 'Amount must be a number other than zero.')
    parsed.push({ lineDate: when, label, amount: roundMoney(value) })
  }
  if (parsed.length === 0) throw new AppError(400, 'The statement has no lines.')
  return parsed
}

export async function listStatements(companyId: number) {
  return prisma.bankStatement.findMany({
    where: { companyId },
    include: {
      lines: {
        orderBy: { id: 'asc' },
        include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
      },
    },
    orderBy: { id: 'desc' },
  })
}

export async function importStatement(companyId: number, name: string, csv: string) {
  const lines = parseCsv(csv)
  const statementDate = lines[0]?.lineDate ?? new Date()
  try {
    return await prisma.bankStatement.create({
      data: {
        companyId,
        name: name.trim(),
        statementDate,
        lines: { create: lines.map((line) => ({ ...line, companyId })) },
      },
      include: { lines: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'A statement with that name is already on this desk.')
    }
    throw error
  }
}

function directionFits(amount: number, moveType: string) {
  const moneyIn = amount >= 0
  switch (moveType) {
    case 'out_invoice':
    case 'in_refund':
      return moneyIn
    case 'in_invoice':
    case 'out_refund':
      return !moneyIn
    default:
      return false
  }
}

export async function reconcileLine(companyId: number, lineId: number, invoiceId: number, amount: number) {
  await ensureBooks(companyId)
  const pay = roundMoney(amount)
  if (pay <= 0) throw new AppError(400, 'Payment amount must be greater than zero.')
  return prisma.$transaction(async (tx) => {
    const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId } })
    if (!line) throw new AppError(404, 'That statement line is not in this company.')
    const open = roundMoney(Math.abs(line.amount) - line.reconciled)
    if (pay - open > 0.001) throw new AppError(400, 'That amount is more than the statement line still open.')
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (!directionFits(line.amount, invoice.moveType)) {
      throw new AppError(400, 'That statement line does not match this invoice.')
    }
    await payInvoiceTx(tx, companyId, invoice.id, pay, 'bank')
    await tx.reconcileMatch.create({
      data: { lineId: line.id, invoiceId: invoice.id, companyId, amount: pay },
    })
    return tx.bankStatementLine.update({
      where: { id: line.id },
      data: { reconciled: roundMoney(line.reconciled + pay) },
      include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
    })
  })
}

export async function unreconcileLine(companyId: number, lineId: number, invoiceId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const match = await tx.reconcileMatch.findFirst({ where: { lineId, invoiceId, companyId } })
    if (!match) throw new AppError(404, 'That match is not on this statement line.')
    const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId } })
    if (!line) throw new AppError(404, 'That statement line is not in this company.')
    await reversePaymentTx(tx, companyId, invoiceId, match.amount)
    await tx.reconcileMatch.delete({ where: { id: match.id } })
    return tx.bankStatementLine.update({
      where: { id: line.id },
      data: { reconciled: roundMoney(Math.max(0, line.reconciled - match.amount)) },
      include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
    })
  })
}

export async function setLockDates(companyId: number, lockDate: string | null, taxLockDate: string | null) {
  const parse = (value: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new AppError(400, 'Enter a valid date.')
    return date
  }
  return prisma.company.update({
    where: { id: companyId },
    data: { lockDate: parse(lockDate), taxLockDate: parse(taxLockDate) },
    select: { lockDate: true, taxLockDate: true },
  })
}

export async function getLockDates(companyId: number) {
  return prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { lockDate: true, taxLockDate: true },
  })
}
