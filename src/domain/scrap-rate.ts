import { roundMoney } from './money.ts'

/**
 * Wastage cost as a share of finished standard cost plus wastage.
 * A gap divided by a small expected-loss allowance treats that allowance as the whole baseline.
 */
export function scrapRatePct(wastageCost: number, finishedStandard: number) {
  const cost = roundMoney(Math.max(0, wastageCost))
  const finished = roundMoney(Math.max(0, finishedStandard))
  const base = roundMoney(finished + cost)
  if (base <= 0) return 0
  return roundMoney((cost / base) * 100)
}
