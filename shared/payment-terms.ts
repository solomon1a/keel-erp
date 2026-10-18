import { roundMoney } from '../src/domain/money.ts'

export type TermSlice = { sequence: number; percent: number; days: number }

export type Instalment = { sequence: number; dueDate: string; percent: number; amount: number }

export function addDays(isoDate: Date, days: number) {
  const next = new Date(isoDate)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export function scheduleInstalments(total: number, invoiceDate: Date, lines: TermSlice[]): Instalment[] {
  const ordered = [...lines].sort((a, b) => a.sequence - b.sequence)
  if (ordered.length === 0) {
    return [{ sequence: 1, dueDate: invoiceDate.toISOString(), percent: 100, amount: roundMoney(total) }]
  }
  let used = 0
  return ordered.map((line, index) => {
    const last = index === ordered.length - 1
    const amount = last ? roundMoney(total - used) : roundMoney(total * (line.percent / 100))
    used = roundMoney(used + amount)
    return {
      sequence: line.sequence,
      dueDate: addDays(invoiceDate, line.days).toISOString(),
      percent: line.percent,
      amount,
    }
  })
}

export function isOverdue(dueDate: Date | null, residual: number, today = new Date()) {
  if (!dueDate || residual <= 0.001) return false
  const due = new Date(dueDate)
  due.setUTCHours(0, 0, 0, 0)
  const day = new Date(today)
  day.setUTCHours(0, 0, 0, 0)
  return due.getTime() < day.getTime()
}
