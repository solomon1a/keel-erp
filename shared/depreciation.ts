import { roundMoney } from '../src/domain/money.ts'

export const depreciationMethods = ['straight_line', 'declining'] as const

export type DepreciationMethod = (typeof depreciationMethods)[number]

export type DepreciationInput = {
  cost: number
  salvage: number
  months: number
  method: DepreciationMethod
  start: string
}

export type DepreciationSlot = {
  date: string
  amount: number
}

function shiftMonth(iso: string, count: number) {
  const [year, month, day] = iso.split('-').map(Number)
  const cursor = new Date(Date.UTC(year ?? 2026, (month ?? 1) - 1 + count, 1))
  const last = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0)).getUTCDate()
  const picked = Math.min(day ?? 1, last)
  const date = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), picked))
  return date.toISOString().slice(0, 10)
}

export function depreciationSchedule(input: DepreciationInput): DepreciationSlot[] {
  const months = Math.max(1, Math.round(input.months))
  const cost = roundMoney(input.cost)
  const salvage = roundMoney(Math.min(Math.max(input.salvage, 0), cost))
  const depreciable = roundMoney(cost - salvage)
  if (depreciable <= 0) return []
  switch (input.method) {
    case 'straight_line': {
      const monthly = roundMoney(depreciable / months)
      const slots: DepreciationSlot[] = []
      let posted = 0
      for (let index = 0; index < months; index += 1) {
        const amount = index === months - 1 ? roundMoney(depreciable - posted) : monthly
        posted = roundMoney(posted + amount)
        if (amount > 0) slots.push({ date: shiftMonth(input.start, index), amount })
      }
      return slots
    }
    case 'declining': {
      const rate = 2 / months
      const slots: DepreciationSlot[] = []
      let book = cost
      for (let index = 0; index < months; index += 1) {
        const room = roundMoney(book - salvage)
        if (room <= 0.001) break
        const raw = index === months - 1 ? room : roundMoney(book * rate)
        const amount = roundMoney(Math.min(room, Math.max(raw, 0)))
        const charge = amount > 0 ? amount : room
        book = roundMoney(book - charge)
        slots.push({ date: shiftMonth(input.start, index), amount: charge })
      }
      return slots
    }
    default: {
      const unexpected: never = input.method
      return unexpected
    }
  }
}
