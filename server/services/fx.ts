import { roundMoney } from '../../src/domain/money.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { readSetting } from './company-settings.ts'
import { ensureAccounts, postEntry } from './journals.ts'

const GAIN = '6061'
const LOSS = '6606'

export function toBase(amount: number, rate: number) {
  if (!(rate > 0)) throw new AppError(400, 'The exchange rate has to be greater than zero.')
  if (rate === 1) return roundMoney(amount)
  return roundMoney(amount / rate)
}

type Sided = { debit: number; credit: number }

/** Convert document-currency lines into the company currency and absorb the cent on the first income or expense line. */
export function scalePosting<T extends Sided>(lines: T[], rate: number): T[] {
  if (rate === 1) return lines
  const scaled = lines.map((line) => ({
    ...line,
    debit: line.debit ? toBase(line.debit, rate) : 0,
    credit: line.credit ? toBase(line.credit, rate) : 0,
  }))
  const debit = roundMoney(scaled.reduce((sum, line) => sum + line.debit, 0))
  const credit = roundMoney(scaled.reduce((sum, line) => sum + line.credit, 0))
  const gap = roundMoney(debit - credit)
  if (gap !== 0) {
    const plug = scaled.find((line, index) => index > 0 && (line.debit > 0 || line.credit > 0)) ?? scaled[0]
    if (!plug) throw new AppError(500, 'The journal entry does not balance.')
    if (plug.credit > 0 || plug.debit === 0) plug.credit = roundMoney(plug.credit + gap)
    else plug.debit = roundMoney(plug.debit - gap)
    if (plug.debit < 0 || plug.credit < 0) throw new AppError(500, 'The journal entry does not balance.')
  }
  return scaled.filter((line) => line.debit !== 0 || line.credit !== 0)
}

export function settlementBases(pay: number, invoiceRate: number, payRate: number) {
  const clearBase = toBase(pay, invoiceRate)
  const cashBase = toBase(pay, payRate)
  return { clearBase, cashBase, fx: roundMoney(cashBase - clearBase) }
}

type Settlement = {
  moveType: string
  clearBase: number
  cashBase: number
  fx: number
  cashId: number
  arId: number
  apId: number
  gainId: number
  lossId: number
  label: string
  partnerId: number
}

export function settlementLines(input: Settlement) {
  const { moveType, clearBase, cashBase, fx, cashId, arId, apId, gainId, lossId, label, partnerId } = input
  const row = (accountId: number, debit: number, credit: number) => ({ accountId, debit, credit, label, partnerId })
  let lines: Array<{ accountId: number; debit: number; credit: number; label: string; partnerId: number }>
  switch (moveType) {
    case 'out_invoice':
      lines = [row(cashId, cashBase, 0), row(arId, 0, clearBase)]
      break
    case 'out_refund':
      lines = [row(arId, clearBase, 0), row(cashId, 0, cashBase)]
      break
    case 'in_invoice':
      lines = [row(apId, clearBase, 0), row(cashId, 0, cashBase)]
      break
    case 'in_refund':
      lines = [row(cashId, cashBase, 0), row(apId, 0, clearBase)]
      break
    default:
      throw new AppError(400, 'Unknown invoice type.')
  }
  if (fx !== 0) {
    const inflow = moveType === 'out_invoice' || moveType === 'in_refund'
    const gain = inflow ? fx > 0 : fx < 0
    const amount = Math.abs(fx)
    lines.push(gain ? row(gainId, 0, amount) : row(lossId, amount, 0))
  }
  return lines.filter((line) => line.debit !== 0 || line.credit !== 0)
}

async function fxAccount(tx: Tx, companyId: number, code: string, kind: 'gain' | 'loss') {
  const fallback = kind === 'gain' ? GAIN : LOSS
  if (code === fallback) {
    await ensureAccounts(tx, companyId, [[fallback, kind === 'gain' ? 'Exchange gain' : 'Exchange loss', kind === 'gain' ? 'income' : 'expense']])
  }
  const account = await tx.account.findFirst({ where: { companyId, code } })
  if (!account) throw new AppError(400, `Account ${code} is not in this company.`)
  return account
}

export async function fxAccounts(tx: Tx, companyId: number) {
  const gainCode = await readSetting(tx, companyId, 'accounting', 'fxGain', GAIN)
  const lossCode = await readSetting(tx, companyId, 'accounting', 'fxLoss', LOSS)
  const gain = await fxAccount(tx, companyId, gainCode, 'gain')
  const loss = await fxAccount(tx, companyId, lossCode, 'loss')
  return { gain, loss }
}

type OpenForeign = {
  id: number
  name: string
  moveType: string
  currency: string
  rate: number
  residual: number
  partner: { name: string }
}

function controlSide(moveType: string) {
  switch (moveType) {
    case 'out_invoice':
    case 'in_refund':
      return 'asset' as const
    case 'in_invoice':
    case 'out_refund':
      return 'liability' as const
    default:
      throw new AppError(400, 'Unknown invoice type.')
  }
}

export async function fxPosition(companyId: number) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { currency: true } })
  const invoices = await prisma.invoice.findMany({
    where: { companyId, state: 'posted', residual: { gt: 0.001 }, currency: { not: '' } },
    select: { id: true, name: true, moveType: true, currency: true, rate: true, residual: true, partner: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  const table = await prisma.exchangeRate.findMany({ where: { companyId }, select: { currency: true, rate: true } })
  const rows = invoices.map((invoice) => positionRow(invoice, table))
  const unrealised = roundMoney(rows.reduce((sum, row) => sum + row.unrealised, 0))
  return { base: company.currency, unrealised, rows }
}

function positionRow(invoice: OpenForeign, table: Array<{ currency: string; rate: number }>) {
  const current = table.find((row) => row.currency === invoice.currency)
  if (!current || !(current.rate > 0)) throw new AppError(400, `Add an exchange rate for ${invoice.currency}.`)
  const booked = toBase(invoice.residual, invoice.rate)
  const currentBase = toBase(invoice.residual, current.rate)
  const delta = roundMoney(currentBase - booked)
  const unrealised = controlSide(invoice.moveType) === 'asset' ? delta : roundMoney(-delta)
  return {
    id: invoice.id,
    name: invoice.name,
    partner: invoice.partner.name,
    moveType: invoice.moveType,
    currency: invoice.currency,
    residual: invoice.residual,
    rate: invoice.rate,
    currentRate: current.rate,
    booked,
    currentBase,
    unrealised,
  }
}

export async function revalueFx(companyId: number) {
  const position = await fxPosition(companyId)
  return prisma.$transaction(async (tx) => {
    const open = await tx.fxRevaluation.findFirst({
      where: { companyId, reversed: false },
      orderBy: { id: 'desc' },
      include: { entry: { include: { lines: true } } },
    })
    if (open?.entry) {
      await postEntry(
        tx,
        companyId,
        new Date(),
        open.entry.lines.map((line) => ({
          accountId: line.accountId,
          debit: line.credit,
          credit: line.debit,
          label: 'Reverse exchange revaluation',
          partnerId: line.partnerId ?? undefined,
        })),
        undefined,
        'GEN',
      )
      await tx.fxRevaluation.update({ where: { id: open.id }, data: { reversed: true } })
    }
    const receivable = await readSetting(tx, companyId, 'accounting', 'receivable', '1122')
    const payable = await readSetting(tx, companyId, 'accounting', 'payable', '2202')
    const { gain, loss } = await fxAccounts(tx, companyId)
    const ar = await tx.account.findFirst({ where: { companyId, code: receivable } })
    const ap = await tx.account.findFirst({ where: { companyId, code: payable } })
    if (!ar || !ap) throw new AppError(400, 'The receivable or payable account is missing.')
    const lines: Array<{ accountId: number; debit: number; credit: number; label: string; partnerId?: number }> = []
    for (const row of position.rows) {
      const delta = roundMoney(row.currentBase - row.booked)
      if (delta === 0) continue
      const control = controlSide(row.moveType) === 'asset' ? ar.id : ap.id
      const label = `Revalue ${row.name}`
      if (controlSide(row.moveType) === 'asset') {
        if (delta > 0) lines.push({ accountId: control, debit: delta, credit: 0, label }, { accountId: gain.id, debit: 0, credit: delta, label })
        else lines.push({ accountId: loss.id, debit: Math.abs(delta), credit: 0, label }, { accountId: control, debit: 0, credit: Math.abs(delta), label })
      } else if (delta > 0) {
        lines.push({ accountId: loss.id, debit: delta, credit: 0, label }, { accountId: control, debit: 0, credit: delta, label })
      } else {
        lines.push({ accountId: control, debit: Math.abs(delta), credit: 0, label }, { accountId: gain.id, debit: 0, credit: Math.abs(delta), label })
      }
    }
    if (lines.length === 0) return { ...position, posted: false, entry: null }
    const entry = await postEntry(tx, companyId, new Date(), lines, undefined, 'GEN')
    await tx.fxRevaluation.create({ data: { companyId, entryId: entry.id } })
    return { ...position, posted: true, entry: entry.name }
  }, transactionOptions)
}

export async function setInvoiceCurrency(companyId: number, invoiceId: number, currency: string, rate: number) {
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId }, select: { id: true, state: true } })
  if (!invoice) throw new AppError(404, 'Invoice not found.')
  if (invoice.state !== 'draft') throw new AppError(409, 'Posting locks the currency and the rate.')
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { currency: true } })
  const data = currency === company.currency ? { currency: '', rate: 1 } : { currency, rate }
  if (data.currency && !(data.rate > 0)) throw new AppError(400, 'The exchange rate has to be greater than zero.')
  await prisma.invoice.update({ where: { id: invoice.id }, data })
}
