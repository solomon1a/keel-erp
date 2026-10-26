import { describe, expect, it } from 'vitest'
import { roundMoney } from '../src/domain/money.ts'
import { scrapRatePct } from '../src/domain/scrap-rate.ts'

describe('scrap rate', () => {
  it('uses finished standard cost as the baseline instead of a tiny loss allowance', () => {
    const allowance = 0.2
    const actualQty = 8.2
    const inflated = roundMoney(((actualQty - allowance) / allowance) * 100)
    expect(inflated).toBe(4000)
    expect(scrapRatePct(78.02, 1000)).toBe(7.24)
    expect(scrapRatePct(78.02, 1000)).toBeLessThan(inflated)
  })

  it('stays between 0 and 100', () => {
    expect(scrapRatePct(0, 0)).toBe(0)
    expect(scrapRatePct(0, 500)).toBe(0)
    expect(scrapRatePct(78.02, 0)).toBe(100)
    expect(scrapRatePct(25, 75)).toBe(25)
  })
})
