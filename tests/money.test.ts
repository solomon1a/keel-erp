import { describe, expect, it } from 'vitest'
import { appliedRate, lineAmounts, sumLines } from '../src/domain/money.ts'

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

  it('prices a 13% VAT line the way the sample order does', () => {
    const blanket = lineAmounts({ quantity: 2, unitPrice: 86, discount: 0, taxRate: 13 })
    const notebook = lineAmounts({ quantity: 1, unitPrice: 18, discount: 0, taxRate: 13 })
    expect(blanket).toEqual({ subtotal: 172, taxAmount: 22.36, total: 194.36 })
    expect(notebook.taxAmount).toBe(2.34)
    expect(sumLines([blanket, notebook])).toEqual({
      amountUntaxed: 190,
      amountTax: 24.7,
      amountTotal: 214.7,
    })
    expect(appliedRate(172, 22.36)).toBe(13)
  })
})
