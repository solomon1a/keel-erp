import { roundMoney } from '../../src/domain/money.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'
import { toBase } from './fx.ts'

export type AgeBucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90'

export type AgedSide = 'receivable' | 'payable'

const buckets: AgeBucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90']

type AgedDoc = {
  id: number
  name: string
  moveType: string
  invoiceDate: string
  dueDate: string
  days: number
  bucket: AgeBucket
  amount: number
}

type AgedPartner = {
  partnerId: number
  name: string
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90: number
  total: number
  documents: AgedDoc[]
}

function dayStamp(value: string) {
  const day = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(day.getTime())) throw new AppError(400, 'Enter a valid date.')
  return day
}

export function ageBucket(daysOverdue: number): AgeBucket {
  if (daysOverdue <= 0) return 'current'
  if (daysOverdue <= 30) return 'd1_30'
  if (daysOverdue <= 60) return 'd31_60'
  if (daysOverdue <= 90) return 'd61_90'
  return 'd90'
}

function emptyTotals() {
  return { current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90: 0, total: 0 }
}

function addBucket(row: ReturnType<typeof emptyTotals>, bucket: AgeBucket, amount: number) {
  row[bucket] = roundMoney(row[bucket] + amount)
  row.total = roundMoney(row.total + amount)
}

function signedAmount(side: AgedSide, moveType: string, residual: number) {
  if (side === 'receivable') {
    if (moveType === 'out_invoice') return residual
    if (moveType === 'out_refund') return -residual
    return null
  }
  if (moveType === 'in_invoice') return residual
  if (moveType === 'in_refund') return -residual
  return null
}

export async function agedStatement(companyId: number, side: AgedSide, asOf: string) {
  const day = dayStamp(asOf)
  const end = new Date(day.getTime() + 86_400_000 - 1)
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      state: { in: ['posted', 'paid'] },
      residual: { gt: 0.001 },
      invoiceDate: { lte: end },
    },
    select: {
      id: true,
      name: true,
      moveType: true,
      invoiceDate: true,
      dueDate: true,
      residual: true,
      currency: true,
      rate: true,
      partnerId: true,
      partner: { select: { name: true } },
    },
    orderBy: [{ partner: { name: 'asc' } }, { invoiceDate: 'asc' }],
  })
  const partners = new Map<number, AgedPartner>()
  const totals = emptyTotals()
  for (const invoice of invoices) {
    const amount = signedAmount(side, invoice.moveType, toBase(invoice.residual, invoice.currency ? invoice.rate : 1))
    if (amount === null || Math.abs(amount) < 0.001) continue
    const due = invoice.dueDate ?? invoice.invoiceDate
    const days = Math.floor((day.getTime() - due.getTime()) / 86_400_000)
    const bucket = ageBucket(days)
    const partner = partners.get(invoice.partnerId) ?? {
      partnerId: invoice.partnerId,
      name: invoice.partner.name,
      ...emptyTotals(),
      documents: [],
    }
    addBucket(partner, bucket, amount)
    addBucket(totals, bucket, amount)
    partner.documents.push({
      id: invoice.id,
      name: invoice.name,
      moveType: invoice.moveType,
      invoiceDate: invoice.invoiceDate.toISOString().slice(0, 10),
      dueDate: due.toISOString().slice(0, 10),
      days,
      bucket,
      amount,
    })
    partners.set(invoice.partnerId, partner)
  }
  return { asOf, side, partners: [...partners.values()], totals }
}

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function agedCsv(report: Awaited<ReturnType<typeof agedStatement>>) {
  const header = ['Partner', 'Document', 'Type', 'Invoice date', 'Due date', 'Days overdue', 'Bucket', 'Amount']
  const rows = report.partners.flatMap((partner) => partner.documents.map((doc) => [
    partner.name,
    doc.name,
    doc.moveType,
    doc.invoiceDate,
    doc.dueDate,
    String(doc.days),
    doc.bucket,
    doc.amount.toFixed(2),
  ]))
  return [header, ...rows].map((line) => line.map(csvCell).join(',')).join('\n')
}

type FlowSection = 'operating' | 'investing' | 'financing'

type FlowAccount = { code: string; name: string; type: string }

function isCash(account: FlowAccount) {
  return account.type === 'asset' && (account.code === '1001' || account.code === '1002' || /\b(cash|bank)\b/i.test(account.name))
}

function isReceivable(account: FlowAccount) {
  return account.code === '1122' || /\breceivable\b/i.test(account.name)
}

function isInventory(account: FlowAccount) {
  return account.code === '1405' || /\binventory\b/i.test(account.name)
}

function isPayable(account: FlowAccount) {
  return account.code === '2202' || /\bpayable\b/i.test(account.name)
}

function isTax(account: FlowAccount) {
  return account.code.startsWith('2221') || /\b(vat|tax)\b/i.test(account.name)
}

function flowSection(account: FlowAccount): FlowSection | 'cash' {
  if (isCash(account)) return 'cash'
  if (account.type === 'equity') return 'financing'
  if (account.type === 'income' || account.type === 'expense') return 'operating'
  if (account.type === 'asset') return isReceivable(account) || isInventory(account) ? 'operating' : 'investing'
  if (account.type === 'liability') return isPayable(account) || isTax(account) ? 'operating' : 'financing'
  return 'operating'
}

export async function cashFlow(companyId: number, from: string, to: string) {
  const start = dayStamp(from)
  const end = new Date(dayStamp(to).getTime() + 86_400_000 - 1)
  if (end < start) throw new AppError(400, 'The end date is before the start date.')
  const entries = await prisma.journalEntry.findMany({
    where: { companyId, date: { lte: end } },
    select: {
      id: true,
      name: true,
      date: true,
      lines: {
        select: {
          label: true,
          debit: true,
          credit: true,
          account: { select: { code: true, name: true, type: true } },
        },
      },
    },
    orderBy: { date: 'asc' },
  })
  const sections = { operating: 0, investing: 0, financing: 0 }
  let opening = 0
  const lines: Array<{ id: number; name: string; date: string; label: string; section: FlowSection; amount: number }> = []
  for (const entry of entries) {
    const cashLines = entry.lines.filter((line) => isCash(line.account))
    if (cashLines.length === 0) continue
    const cashDelta = roundMoney(cashLines.reduce((sum, line) => sum + line.debit - line.credit, 0))
    if (entry.date < start) {
      opening = roundMoney(opening + cashDelta)
      continue
    }
    const counterparts = entry.lines.filter((line) => !isCash(line.account))
    const weights = counterparts.map((line) => Math.abs(line.debit - line.credit))
    const weightTotal = weights.reduce((sum, value) => sum + value, 0)
    if (counterparts.length === 0 || weightTotal === 0) continue
    counterparts.forEach((line, index) => {
      const section = flowSection(line.account)
      if (section === 'cash') return
      const share = roundMoney(cashDelta * ((weights[index] ?? 0) / weightTotal))
      if (Math.abs(share) < 0.001) return
      sections[section] = roundMoney(sections[section] + share)
      lines.push({
        id: entry.id,
        name: entry.name,
        date: entry.date.toISOString().slice(0, 10),
        label: line.label || entry.name,
        section,
        amount: share,
      })
    })
  }
  const net = roundMoney(sections.operating + sections.investing + sections.financing)
  return {
    from,
    to,
    operating: sections.operating,
    investing: sections.investing,
    financing: sections.financing,
    net,
    opening,
    closing: roundMoney(opening + net),
    lines,
  }
}

export { buckets }
