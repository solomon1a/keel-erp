import { roundMoney } from '../../src/domain/money.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'
import { summarizePnl } from './accounting.ts'
import { toBase } from './fx.ts'

export const homeRanges = ['today', 'week', 'month', 'year'] as const
export type HomeRange = (typeof homeRanges)[number]

export type HomeOrderStatus = 'quotation' | 'sent' | 'confirmed' | 'to_invoice' | 'cancelled' | 'open'

export type HomeAttentionKind = 'purchase' | 'invoice' | 'expense' | 'leave'

export type HomeStepKey = 'company' | 'team' | 'contacts' | 'taxes' | 'bank' | 'quotation'

const pipelineStages = ['new', 'qualified', 'proposition', 'won'] as const
type PipelineStage = (typeof pipelineStages)[number]

export type HomeDashboard = {
  range: HomeRange
  from: string
  to: string
  empty: boolean
  bank: { balance: number; accounts: number; changePct: number }
  kpis: {
    revenue: { amount: number; changePct: number }
    profit: { amount: number; margin: number; marginDelta: number }
    receivable: { amount: number; overdueCount: number; overdueAmount: number }
    payable: { amount: number; dueSoonAmount: number }
  }
  chart: { months: { month: string; income: number; expense: number }[] }
  pipeline: {
    openCount: number
    winRate: number
    stages: { stage: PipelineStage; count: number; amount: number }[]
    openValue: number
    avgDeal: number
  }
  orders: {
    id: number
    name: string
    customer: string
    date: string
    amount: number
    status: HomeOrderStatus
  }[]
  attention: {
    kind: HomeAttentionKind
    id: number
    name: string
    partner: string
    amount: number | null
    days: number | null
    dateFrom: string | null
    dateTo: string | null
    href: string
  }[]
  attentionCount: number
  lowStock: { id: number; name: string; onHand: number; level: 'bad' | 'warn' }[]
  onboarding: {
    done: number
    total: number
    steps: { key: HomeStepKey; done: boolean; href: string }[]
  } | null
}

export type HomeSearchHit = {
  orders: { id: number; name: string; partner: string }[]
  contacts: { id: number; name: string }[]
  products: { id: number; name: string; sku: string }[]
}

function iso(day: Date) {
  return day.toISOString().slice(0, 10)
}

function utcDay(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function addDays(day: Date, days: number) {
  const next = new Date(day)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function monthKey(day: Date) {
  const month = String(day.getUTCMonth() + 1).padStart(2, '0')
  return `${day.getUTCFullYear()}-${month}`
}

export function parseHomeRange(value: string | undefined): HomeRange {
  switch (value) {
    case undefined:
    case '':
    case 'month':
      return 'month'
    case 'today':
    case 'week':
    case 'year':
      return value
    default:
      throw new AppError(400, 'Choose today, week, month, or year.')
  }
}

export function dashboardRange(range: HomeRange, now = new Date()) {
  const today = utcDay(now)
  switch (range) {
    case 'today': {
      const from = iso(today)
      const prior = addDays(today, -1)
      return { from, to: from, priorFrom: iso(prior), priorTo: iso(prior) }
    }
    case 'week': {
      const weekday = today.getUTCDay()
      const start = addDays(today, weekday === 0 ? -6 : 1 - weekday)
      const priorEnd = addDays(start, -1)
      const priorStart = addDays(priorEnd, -6)
      return { from: iso(start), to: iso(today), priorFrom: iso(priorStart), priorTo: iso(priorEnd) }
    }
    case 'month': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      const priorEnd = addDays(start, -1)
      const priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1))
      return { from: iso(start), to: iso(today), priorFrom: iso(priorStart), priorTo: iso(priorEnd) }
    }
    case 'year': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), 0, 1))
      const priorEnd = addDays(start, -1)
      const priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), 0, 1))
      return { from: iso(start), to: iso(today), priorFrom: iso(priorStart), priorTo: iso(priorEnd) }
    }
    default: {
      const unexpected: never = range
      throw new AppError(400, `Unknown range ${unexpected}.`)
    }
  }
}

function changePct(current: number, prior: number) {
  if (Math.abs(prior) < 0.001) return Math.abs(current) < 0.001 ? 0 : 100
  return roundMoney(((current - prior) / Math.abs(prior)) * 100)
}

function marginOf(profit: number, income: number) {
  if (Math.abs(income) < 0.001) return 0
  return roundMoney((profit / income) * 100)
}

function ageDays(invoiceDate: Date, asOf: Date) {
  return Math.floor((asOf.getTime() - invoiceDate.getTime()) / 86_400_000)
}

function orderStatus(state: string, lines: { quantity: number; qtyInvoiced: number }[]): HomeOrderStatus {
  switch (state) {
    case 'draft':
      return 'quotation'
    case 'sent':
      return 'sent'
    case 'cancel':
      return 'cancelled'
    case 'sale':
    case 'done':
      return lines.some((line) => line.qtyInvoiced + 0.001 < line.quantity) ? 'to_invoice' : 'confirmed'
    default:
      return 'open'
  }
}

function endOf(day: string) {
  return new Date(`${day}T23:59:59.999Z`)
}

function isPipelineStage(stage: string): stage is PipelineStage {
  switch (stage) {
    case 'new':
    case 'qualified':
    case 'proposition':
    case 'won':
      return true
    default:
      return false
  }
}

export async function homeDashboard(companyId: number, range: HomeRange, now = new Date()): Promise<HomeDashboard> {
  const bounds = dashboardRange(range, now)
  const asOf = endOf(bounds.to)
  const chartStart = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - 11, 1))
  const chartFrom = iso(chartStart)
  const windowFrom = bounds.priorFrom < chartFrom ? bounds.priorFrom : chartFrom
  const [
    movements,
    bankAccounts,
    bankItems,
    receivable,
    payable,
    openInvoices,
    orders,
    leads,
    products,
    purchases,
    purchaseCount,
    expenses,
    expenseCount,
    leaves,
    leaveCount,
    orderCount,
    entryCount,
    userCount,
    contactCount,
    statementCount,
    quotationCount,
    company,
  ] = await Promise.all([
    prisma.journalItem.findMany({
      where: {
        entry: { companyId, date: { gte: new Date(`${windowFrom}T00:00:00.000Z`), lte: asOf } },
        account: { type: { in: ['income', 'expense'] } },
      },
      select: {
        debit: true,
        credit: true,
        account: { select: { code: true, name: true, type: true } },
        entry: { select: { date: true } },
      },
    }),
    prisma.account.count({ where: { companyId, code: { in: ['1001', '1002'] } } }),
    prisma.journalItem.findMany({
      where: {
        account: { companyId, code: { in: ['1001', '1002'] } },
        entry: { companyId, date: { lte: asOf } },
      },
      select: { debit: true, credit: true, entry: { select: { date: true } } },
    }),
    prisma.invoice.findMany({
      where: { companyId, moveType: 'out_invoice', state: 'posted' },
      select: { residual: true, rate: true, currency: true },
    }),
    prisma.invoice.findMany({
      where: { companyId, moveType: 'in_invoice', state: 'posted' },
      select: { residual: true, rate: true, currency: true },
    }),
    prisma.invoice.findMany({
      where: {
        companyId,
        state: 'posted',
        residual: { gt: 0.001 },
        moveType: { in: ['out_invoice', 'in_invoice'] },
      },
      select: {
        id: true,
        name: true,
        moveType: true,
        residual: true,
        currency: true,
        rate: true,
        invoiceDate: true,
        partner: { select: { name: true } },
      },
      orderBy: { invoiceDate: 'asc' },
    }),
    prisma.salesOrder.findMany({
      where: { companyId },
      orderBy: [{ dateOrder: 'desc' }, { id: 'desc' }],
      take: 24,
      select: {
        id: true,
        name: true,
        state: true,
        dateOrder: true,
        amountTotal: true,
        customer: { select: { name: true } },
        lines: { select: { quantity: true, qtyInvoiced: true } },
      },
    }),
    prisma.lead.findMany({
      where: { companyId },
      select: { stage: true, expectedRevenue: true },
    }),
    prisma.product.findMany({
      where: { companyId, type: 'product', active: true },
      select: {
        id: true,
        name: true,
        quants: { where: { location: { type: 'internal' } }, select: { quantity: true } },
        reorderRules: { select: { minQty: true } },
      },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId, state: { in: ['draft', 'sent'] } },
      orderBy: { dateOrder: 'desc' },
      take: 4,
      select: { id: true, name: true, amountTotal: true, vendor: { select: { name: true } } },
    }),
    prisma.purchaseOrder.count({ where: { companyId, state: { in: ['draft', 'sent'] } } }),
    prisma.expenseClaim.findMany({
      where: { companyId, state: 'submitted' },
      orderBy: { spentOn: 'desc' },
      take: 4,
      select: { id: true, description: true, merchant: true, amount: true, employee: { select: { name: true } } },
    }),
    prisma.expenseClaim.count({ where: { companyId, state: 'submitted' } }),
    prisma.leaveRequest.findMany({
      where: { state: 'draft', employee: { companyId } },
      orderBy: { dateFrom: 'asc' },
      take: 4,
      select: {
        id: true,
        dateFrom: true,
        dateTo: true,
        employeeId: true,
        employee: { select: { name: true } },
      },
    }),
    prisma.leaveRequest.count({ where: { state: 'draft', employee: { companyId } } }),
    prisma.salesOrder.count({ where: { companyId } }),
    prisma.journalEntry.count({ where: { companyId } }),
    prisma.user.count({ where: { companyId } }),
    prisma.contact.count({ where: { companyId } }),
    prisma.bankStatement.count({ where: { companyId } }),
    prisma.quotation.count({ where: { companyId } }),
    prisma.company.findUnique({ where: { id: companyId }, select: { taxId: true } }),
  ])

  const current = summarizePnl(movements, bounds.from, bounds.to)
  const prior = summarizePnl(movements, bounds.priorFrom, bounds.priorTo)

  const balanceAsOf = (day: string) => {
    const cutoff = endOf(day)
    return roundMoney(
      bankItems.reduce((sum, item) => (item.entry.date <= cutoff ? sum + item.debit - item.credit : sum), 0),
    )
  }
  const bankBalance = balanceAsOf(bounds.to)
  const priorBank = balanceAsOf(bounds.priorTo)

  const overdue = openInvoices.filter((invoice) => invoice.moveType === 'out_invoice' && ageDays(invoice.invoiceDate, asOf) > 30)
  const dueSoon = openInvoices.filter((invoice) => invoice.moveType === 'in_invoice' && ageDays(invoice.invoiceDate, asOf) <= 7)
  const openBase = (invoice: { residual: number; currency: string; rate: number }) => toBase(invoice.residual, invoice.currency ? invoice.rate : 1)
  const overdueAmount = roundMoney(overdue.reduce((sum, invoice) => sum + openBase(invoice), 0))
  const dueSoonAmount = roundMoney(dueSoon.reduce((sum, invoice) => sum + openBase(invoice), 0))
  const receivableAmount = roundMoney(receivable.reduce((sum, invoice) => sum + openBase(invoice), 0))
  const payableAmount = roundMoney(payable.reduce((sum, invoice) => sum + openBase(invoice), 0))

  const months = Array.from({ length: 12 }, (_, index) => {
    const cursor = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() - (11 - index), 1))
    return { month: monthKey(cursor), income: 0, expense: 0 }
  })
  const monthIndex = new Map(months.map((row, index) => [row.month, index]))
  for (const item of movements) {
    const index = monthIndex.get(monthKey(item.entry.date))
    if (index === undefined) continue
    const row = months[index]
    if (!row) continue
    if (item.account.type === 'income') row.income += item.credit - item.debit
    else row.expense += item.debit - item.credit
  }
  for (const row of months) {
    row.income = roundMoney(row.income)
    row.expense = roundMoney(row.expense)
  }

  const stageRows = new Map<PipelineStage, { count: number; amount: number }>()
  for (const stage of pipelineStages) stageRows.set(stage, { count: 0, amount: 0 })
  let lost = 0
  for (const lead of leads) {
    if (lead.stage === 'lost') {
      lost += 1
      continue
    }
    if (!isPipelineStage(lead.stage)) continue
    const row = stageRows.get(lead.stage)
    if (!row) continue
    row.count += 1
    row.amount = roundMoney(row.amount + lead.expectedRevenue)
  }
  const stages = pipelineStages.map((stage) => {
    const row = stageRows.get(stage) ?? { count: 0, amount: 0 }
    return { stage, count: row.count, amount: row.amount }
  })
  const openStages = stages.filter((stage) => stage.stage !== 'won')
  const openCount = openStages.reduce((sum, stage) => sum + stage.count, 0)
  const openValue = roundMoney(openStages.reduce((sum, stage) => sum + stage.amount, 0))
  const won = stages.find((stage) => stage.stage === 'won')?.count ?? 0
  const closed = won + lost
  const winRate = closed === 0 ? 0 : Math.round((won / closed) * 100)

  const attention = [
    ...purchases.map((order) => ({
      kind: 'purchase' as const,
      id: order.id,
      name: order.name,
      partner: order.vendor.name,
      amount: order.amountTotal,
      days: null,
      dateFrom: null,
      dateTo: null,
      href: `/purchases/${order.id}`,
    })),
    ...overdue.slice(0, 4).map((invoice) => ({
      kind: 'invoice' as const,
      id: invoice.id,
      name: invoice.name,
      partner: invoice.partner.name,
      amount: openBase(invoice),
      days: ageDays(invoice.invoiceDate, asOf),
      dateFrom: null,
      dateTo: null,
      href: `/accounting/${invoice.id}`,
    })),
    ...expenses.map((claim) => ({
      kind: 'expense' as const,
      id: claim.id,
      name: claim.employee.name,
      partner: claim.merchant || claim.description,
      amount: claim.amount,
      days: null,
      dateFrom: null,
      dateTo: null,
      href: '/hr/expenses',
    })),
    ...leaves.map((leave) => ({
      kind: 'leave' as const,
      id: leave.id,
      name: leave.employee.name,
      partner: '',
      amount: null,
      days: Math.max(1, Math.round((leave.dateTo.getTime() - leave.dateFrom.getTime()) / 86_400_000) + 1),
      dateFrom: iso(leave.dateFrom),
      dateTo: iso(leave.dateTo),
      href: `/hr/${leave.employeeId}`,
    })),
  ].slice(0, 6)

  const lowStock = products
    .map((product) => {
      const onHand = product.quants.reduce((sum, quant) => sum + quant.quantity, 0)
      const mins = product.reorderRules.map((rule) => rule.minQty)
      const floor = mins.length > 0 ? Math.min(...mins) : 5
      return { id: product.id, name: product.name, onHand, floor }
    })
    .filter((product) => product.onHand < product.floor)
    .sort((a, b) => a.onHand - b.onHand)
    .slice(0, 6)
    .map((product) => ({
      id: product.id,
      name: product.name,
      onHand: product.onHand,
      level: product.onHand <= 3 ? ('bad' as const) : ('warn' as const),
    }))

  const empty = orderCount === 0 && entryCount === 0
  const steps = [
    { key: 'company' as const, done: true, href: '/settings' },
    { key: 'team' as const, done: userCount > 1, href: '/admin/users' },
    { key: 'contacts' as const, done: contactCount > 0, href: '/contacts' },
    { key: 'taxes' as const, done: Boolean(company?.taxId), href: '/settings' },
    { key: 'bank' as const, done: statementCount > 0, href: '/accounting/statements' },
    { key: 'quotation' as const, done: orderCount + quotationCount > 0, href: '/orders/new' },
  ]
  const revenueMargin = marginOf(current.profit, current.income)
  const priorMargin = marginOf(prior.profit, prior.income)

  return {
    range,
    from: bounds.from,
    to: bounds.to,
    empty,
    bank: { balance: bankBalance, accounts: bankAccounts, changePct: changePct(bankBalance, priorBank) },
    kpis: {
      revenue: { amount: current.income, changePct: changePct(current.income, prior.income) },
      profit: { amount: current.profit, margin: revenueMargin, marginDelta: roundMoney(revenueMargin - priorMargin) },
      receivable: { amount: receivableAmount, overdueCount: overdue.length, overdueAmount },
      payable: { amount: payableAmount, dueSoonAmount },
    },
    chart: { months },
    pipeline: {
      openCount,
      winRate,
      stages,
      openValue,
      avgDeal: openCount === 0 ? 0 : roundMoney(openValue / openCount),
    },
    orders: orders.map((order) => ({
      id: order.id,
      name: order.name,
      customer: order.customer.name,
      date: order.dateOrder.toISOString(),
      amount: order.amountTotal,
      status: orderStatus(order.state, order.lines),
    })),
    attention,
    attentionCount: purchaseCount + overdue.length + expenseCount + leaveCount,
    lowStock,
    onboarding: empty ? { done: steps.filter((step) => step.done).length, total: steps.length, steps } : null,
  }
}

export async function homeSearch(companyId: number, raw: string): Promise<HomeSearchHit> {
  const q = raw.trim().slice(0, 80)
  if (!q) return { orders: [], contacts: [], products: [] }
  const [orders, contacts, products] = await Promise.all([
    prisma.salesOrder.findMany({
      where: {
        companyId,
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }],
      },
      orderBy: { dateOrder: 'desc' },
      take: 6,
      select: { id: true, name: true, customer: { select: { name: true } } },
    }),
    prisma.contact.findMany({
      where: { companyId, name: { contains: q, mode: 'insensitive' } },
      orderBy: { name: 'asc' },
      take: 6,
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: {
        companyId,
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }],
      },
      orderBy: { name: 'asc' },
      take: 6,
      select: { id: true, name: true, sku: true },
    }),
  ])
  return {
    orders: orders.map((order) => ({ id: order.id, name: order.name, partner: order.customer.name })),
    contacts,
    products,
  }
}
