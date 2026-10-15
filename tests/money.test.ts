import { describe, expect, it } from 'vitest'
import { lineAmounts, sumLines } from '../src/domain/money.ts'

describe('line amounts', () => {
  it('applies discount before tax and rounds to cents', () => {
    const line = lineAmounts({ quantity: 2, unitPrice: 86, discount: 0, taxRate: 8.5 })
    expect(line).toEqual({ subtotal: 172, taxAmount: 14.62, total: 186.62 })
  })

  it('sums lines without drifting cents', () => {
    const first = lineAmounts({ quantity: 2, unitPrice: 86, discount: 0, taxRate: 8.5 })
    const second = lineAmounts({ quantity: 1, unitPrice: 18, discount: 0, taxRate: 8.5 })
    expect(sumLines([first, second])).toEqual({
      amountUntaxed: 190,
      amountTax: 16.15,
      amountTotal: 206.15,
    })
  })
})
