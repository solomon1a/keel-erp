import { roundMoney } from './money.ts'

export type FulfillmentStatus = 'nothing' | 'to_deliver_and_bill' | 'to_bill' | 'to_deliver' | 'completed'

export type TradeLineQty = {
  quantity: number
  qtyDelivered: number
  qtyInvoiced: number
}

/** What is still open on a confirmed order. Services count as delivered once their delivered quantity is set. */
export function fulfillmentStatus(lines: TradeLineQty[]): FulfillmentStatus {
  if (lines.length === 0) return 'nothing'
  const deliverLeft = lines.some((line) => line.qtyDelivered + 0.0001 < line.quantity)
  const billLeft = lines.some((line) => line.qtyInvoiced + 0.0001 < line.quantity)
  if (deliverLeft && billLeft) return 'to_deliver_and_bill'
  if (!deliverLeft && billLeft) return 'to_bill'
  if (deliverLeft && !billLeft) return 'to_deliver'
  return 'completed'
}

export type PriceBreak = {
  productId: number
  minQty: number
  price: number
}

export type PriceRule = {
  name?: string
  productId: number | null
  minQty: number
  discountPercent: number
  fixedPrice: number | null
  customerId: number | null
  customerGroupId: number | null
  vendorId: number | null
  active: boolean
}

export type ResolvedPrice = {
  unitPrice: number
  discount: number
  ruleName: string | null
}

function specificity(rule: PriceRule, side: 'sales' | 'purchase', customerId: number | null, customerGroupId: number | null, vendorId: number | null, productId: number, quantity: number): number {
  if (!rule.active) return 0
  if (rule.productId !== null && rule.productId !== productId) return 0
  if (rule.minQty - quantity > 0.0001) return 0
  if (side === 'sales') {
    if (rule.vendorId) return 0
    if (rule.customerId) return rule.customerId === customerId ? 4 : 0
    if (rule.customerGroupId) return rule.customerGroupId === customerGroupId ? 2 : 0
    return 1
  }
  if (rule.customerId || rule.customerGroupId) return 0
  if (rule.vendorId) return rule.vendorId === vendorId ? 4 : 0
  return 1
}

/**
 * A quantity break replaces the catalog price when its minimum is met.
 * The winning rule is the most specific match (customer, then group, then open),
 * and within that the highest minimum quantity. A fixed price replaces the unit
 * price and clears the discount. Otherwise the percent discounts the break or list price.
 */
export function resolveUnitPrice(input: {
  side: 'sales' | 'purchase'
  productId: number
  quantity: number
  listPrice: number
  customerId: number | null
  customerGroupId: number | null
  vendorId: number | null
  breaks: PriceBreak[]
  rules: PriceRule[]
}): ResolvedPrice {
  const breaks = input.breaks
    .filter((row) => row.productId === input.productId && row.minQty - input.quantity <= 0.0001)
    .sort((a, b) => b.minQty - a.minQty)
  const base = breaks[0]?.price ?? input.listPrice
  const ranked = input.rules
    .map((rule) => ({
      rule,
      score: specificity(rule, input.side, input.customerId, input.customerGroupId, input.vendorId, input.productId, input.quantity),
    }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || b.rule.minQty - a.rule.minQty)
  const winner = ranked[0]?.rule
  if (!winner) return { unitPrice: roundMoney(base), discount: 0, ruleName: null }
  if (winner.fixedPrice !== null && winner.fixedPrice !== undefined) {
    return { unitPrice: roundMoney(winner.fixedPrice), discount: 0, ruleName: winner.name ?? null }
  }
  return { unitPrice: roundMoney(base), discount: winner.discountPercent, ruleName: winner.name ?? null }
}
