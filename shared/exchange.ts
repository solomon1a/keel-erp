export const displayCurrencies = ['CNY', 'PKR', 'USD', 'GBP', 'EUR'] as const

export type DisplayCurrency = (typeof displayCurrencies)[number]

export type RateRow = { currency: string; rate: number }

/**
 * Demo anchors: how many units of each currency equal 1 CNY.
 * A company's stored rate is anchor(currency) / anchor(base), so 1 CNY = 39 PKR.
 */
const unitsPerCny: Record<string, number> = {
  CNY: 1,
  PKR: 39,
  USD: 0.14,
  GBP: 0.11,
  EUR: 0.13,
  HKD: 1.09,
  JPY: 21,
}

export function demoRate(base: string, currency: string) {
  if (currency === base) return 1
  const baseUnits = unitsPerCny[base]
  const codeUnits = unitsPerCny[currency]
  if (!baseUnits || !codeUnits) return null
  return Math.round((codeUnits / baseUnits) * 1_000_000) / 1_000_000
}

export function defaultRateRows(base: string): RateRow[] {
  const codes = [base, ...displayCurrencies.filter((code) => code !== base)]
  const rows: RateRow[] = []
  for (const currency of codes) {
    const rate = demoRate(base, currency)
    if (rate == null) continue
    rows.push({ currency, rate })
  }
  return rows
}

export function rateFor(base: string, display: string, rates: RateRow[]) {
  if (display === base) return 1
  const row = rates.find((item) => item.currency === display)
  if (!row || !Number.isFinite(row.rate) || row.rate <= 0) return null
  return row.rate
}

export function convertFromBase(amount: number, base: string, display: string, rates: RateRow[]) {
  const rate = rateFor(base, display, rates)
  if (rate == null) return amount
  return amount * rate
}

export function formatRate(rate: number) {
  if (!Number.isFinite(rate)) return '—'
  const rounded = Math.round(rate * 10_000) / 10_000
  return String(rounded)
}

export function isDisplayCurrency(value: string): value is DisplayCurrency {
  switch (value) {
    case 'CNY':
    case 'PKR':
    case 'USD':
    case 'GBP':
    case 'EUR':
      return true
    default:
      return false
  }
}
