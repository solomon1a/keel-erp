import type { Locale } from '../i18n/locale.tsx'

type Month = { month: string; income: number; expense: number }

function niceMax(value: number) {
  if (value <= 0) return 1
  const padded = value * 1.15
  const exponent = Math.pow(10, Math.floor(Math.log10(padded)))
  const fraction = padded / exponent
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return nice * exponent
}

function curve(points: { x: number; y: number }[]) {
  const first = points[0]
  if (!first) return ''
  let path = `M${first.x},${first.y}`
  for (let index = 1; index < points.length; index += 1) {
    const prev = points[index - 1]
    const current = points[index]
    if (!prev || !current) continue
    const mid = (prev.x + current.x) / 2
    path += ` C${mid},${prev.y} ${mid},${current.y} ${current.x},${current.y}`
  }
  return path
}

export function HomeChart({ months, locale }: { months: Month[]; locale: Locale }) {
  const width = 640
  const height = 196
  const left = 40
  const right = 12
  const top = 14
  const bottom = 24
  const plotWidth = width - left - right
  const plotHeight = height - top - bottom
  const peak = niceMax(Math.max(...months.map((month) => Math.max(month.income, month.expense)), 0))
  const yFor = (value: number) => top + plotHeight - (value / peak) * plotHeight
  const xFor = (index: number) => left + (months.length <= 1 ? plotWidth / 2 : (index / (months.length - 1)) * plotWidth)
  const income = months.map((month, index) => ({ x: xFor(index), y: yFor(month.income) }))
  const expense = months.map((month, index) => ({ x: xFor(index), y: yFor(month.expense) }))
  const baseline = top + plotHeight
  const incomeLine = curve(income)
  const expenseLine = curve(expense)
  const lastIncome = income[income.length - 1]
  const lastExpense = expense[expense.length - 1]
  const firstIncome = income[0]
  const firstExpense = expense[0]
  const formatter = new Intl.NumberFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { notation: 'compact', maximumFractionDigits: 1 })
  const monthLabel = new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', timeZone: 'UTC' })
  const ticks = [0, 0.33, 0.66, 1]

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-2 h-auto w-full" role="img">
      <defs>
        <linearGradient id="home-rev-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--home-rev)" stopOpacity="0.26" />
          <stop offset="1" stopColor="var(--home-rev)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="home-exp-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--home-exp)" stopOpacity="0.16" />
          <stop offset="1" stopColor="var(--home-exp)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((tick) => {
        const value = peak * (1 - tick)
        const y = top + plotHeight * tick
        return (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y} y2={y} stroke="var(--home-grid)" />
            <text x={left - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--home-axis)">
              {formatter.format(value)}
            </text>
          </g>
        )
      })}
      {firstIncome && lastIncome ? <path d={`${incomeLine} L${lastIncome.x},${baseline} L${firstIncome.x},${baseline} Z`} fill="url(#home-rev-fill)" /> : null}
      {firstExpense && lastExpense ? <path d={`${expenseLine} L${lastExpense.x},${baseline} L${firstExpense.x},${baseline} Z`} fill="url(#home-exp-fill)" /> : null}
      <path d={incomeLine} fill="none" stroke="var(--home-rev)" strokeWidth="2.5" />
      <path d={expenseLine} fill="none" stroke="var(--home-exp)" strokeWidth="2" />
      {months.map((month, index) => (
        <text key={month.month} x={xFor(index)} y={height - 6} textAnchor="middle" fontSize="11" fill="var(--home-axis)">
          {monthLabel.format(new Date(`${month.month}-01T00:00:00.000Z`))}
        </text>
      ))}
      {lastIncome && lastExpense ? (
        <>
          <line x1={lastIncome.x} x2={lastIncome.x} y1={top} y2={baseline} stroke="var(--home-rev)" strokeOpacity="0.35" strokeDasharray="3 3" />
          <circle cx={lastIncome.x} cy={lastIncome.y} r="5" fill="var(--kl-glass-bg)" stroke="var(--home-rev)" strokeWidth="2.5" />
          <circle cx={lastExpense.x} cy={lastExpense.y} r="4" fill="var(--kl-glass-bg)" stroke="var(--home-exp)" strokeWidth="2" />
        </>
      ) : null}
    </svg>
  )
}
