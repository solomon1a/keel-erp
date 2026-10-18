import { api } from './api.ts'

export type PriceQuote = { unitPrice: number; discount: number; ruleName: string | null }

export function quotePrice(input: {
  side: 'sales' | 'purchase'
  productId: number
  quantity: number
  customerId?: number | null
  vendorId?: number | null
}) {
  return api<PriceQuote>('/api/pricing/resolve', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
