import { roundMoney } from '../../src/domain/money.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'

const groups = ['product', 'partner', 'user', 'month'] as const
export type TradeGroup = (typeof groups)[number]
export type TradeSide = 'sales' | 'purchase'

export function asTradeGroup(value: string | undefined): TradeGroup {
  if (value === 'product' || value === 'partner' || value === 'user' || value === 'month') return value
  throw new AppError(400, 'Choose product, partner, salesperson, or month.')
}

function day(value: string, end: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'Use a date, YYYY-MM-DD.')
  return new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}Z`)
}

type Bucket = { key: string; label: string; amount: number; documents: number }

export async function tradeAnalysis(companyId: number, side: TradeSide, group: TradeGroup, from: string, to: string) {
  const start = day(from, false)
  const end = day(to, true)
  if (end < start) throw new AppError(400, 'The end date is before the start date.')
  const moveTypes = side === 'sales' ? ['out_invoice', 'out_refund'] : ['in_invoice', 'in_refund']
  const invoices = await prisma.invoice.findMany({
    where: { companyId, moveType: { in: moveTypes }, state: { in: ['posted', 'paid'] }, invoiceDate: { gte: start, lte: end } },
    include: {
      partner: { select: { id: true, name: true } },
      salesOrder: { select: { createdBy: { select: { id: true, name: true } } } },
      purchaseOrder: { select: { createdBy: { select: { id: true, name: true } } } },
      lines: {
        include: {
          salesOrderLine: { select: { product: { select: { id: true, name: true } } } },
          purchaseOrderLine: { select: { product: { select: { id: true, name: true } } } },
        },
      },
    },
    orderBy: { invoiceDate: 'asc' },
  })
  const map = new Map<string, Bucket>()
  const seen = new Map<string, Set<number>>()
  for (const invoice of invoices) {
    const sign = invoice.moveType.endsWith('refund') ? -1 : 1
    for (const line of invoice.lines) {
      const product = line.salesOrderLine?.product ?? line.purchaseOrderLine?.product
      const person = side === 'sales' ? invoice.salesOrder?.createdBy : invoice.purchaseOrder?.createdBy
      let key = 'none'
      let label = 'Unassigned'
      switch (group) {
        case 'product':
          key = product ? `product:${product.id}` : `text:${line.description}`
          label = product?.name ?? line.description
          break
        case 'partner':
          key = String(invoice.partner.id)
          label = invoice.partner.name
          break
        case 'user':
          key = person ? String(person.id) : 'none'
          label = person?.name ?? 'Unassigned'
          break
        case 'month':
          key = invoice.invoiceDate.toISOString().slice(0, 7)
          label = key
          break
        default: {
          const unexpected: never = group
          throw new AppError(400, unexpected)
        }
      }
      const row = map.get(key) ?? { key, label, amount: 0, documents: 0 }
      row.amount = roundMoney(row.amount + sign * line.subtotal)
      const docs = seen.get(key) ?? new Set<number>()
      docs.add(invoice.id)
      seen.set(key, docs)
      row.documents = docs.size
      map.set(key, row)
    }
  }
  const rows = [...map.values()].sort((a, b) => b.amount - a.amount || a.label.localeCompare(b.label))
  const total = roundMoney(rows.reduce((sum, row) => sum + row.amount, 0))
  return { side, group, from, to, total, rows }
}

export function tradeCsv(report: Awaited<ReturnType<typeof tradeAnalysis>>) {
  const header = ['label', 'amount', 'documents']
  const cell = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  const lines = report.rows.map((row) => [row.label, String(row.amount), String(row.documents)])
  return [header, ...lines].map((line) => line.map(cell).join(',')).join('\n')
}
