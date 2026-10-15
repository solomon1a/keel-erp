export type LineMoneyInput = {
  quantity: number
  unitPrice: number
  discount: number
  taxRate: number
}

export type LineMoney = {
  subtotal: number
  taxAmount: number
  total: number
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function appliedRate(subtotal: number, taxAmount: number): number | null {
  if (subtotal === 0) return null
  return roundMoney((taxAmount / subtotal) * 100)
}

export function lineAmounts(input: LineMoneyInput): LineMoney {
  const net = input.quantity * input.unitPrice * (1 - input.discount / 100)
  const subtotal = roundMoney(net)
  const taxAmount = roundMoney(subtotal * (input.taxRate / 100))
  return {
    subtotal,
    taxAmount,
    total: roundMoney(subtotal + taxAmount),
  }
}

export function sumLines(lines: Array<{ subtotal: number; taxAmount: number }>): {
  amountUntaxed: number
  amountTax: number
  amountTotal: number
} {
  const amountUntaxed = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0))
  const amountTax = roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0))
  return {
    amountUntaxed,
    amountTax,
    amountTotal: roundMoney(amountUntaxed + amountTax),
  }
}
