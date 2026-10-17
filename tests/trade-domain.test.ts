import { describe, expect, it } from 'vitest'
import { fulfillmentStatus, resolveUnitPrice } from '../src/domain/trade.ts'

describe('trade status and price', () => {
  it('reads partial delivery and billing from the line quantities', () => {
    expect(fulfillmentStatus([])).toBe('nothing')
    expect(fulfillmentStatus([{ quantity: 10, qtyDelivered: 4, qtyInvoiced: 3 }])).toBe('to_deliver_and_bill')
    expect(fulfillmentStatus([{ quantity: 10, qtyDelivered: 10, qtyInvoiced: 3 }])).toBe('to_bill')
    expect(fulfillmentStatus([{ quantity: 10, qtyDelivered: 4, qtyInvoiced: 10 }])).toBe('to_deliver')
    expect(fulfillmentStatus([{ quantity: 10, qtyDelivered: 10, qtyInvoiced: 10 }])).toBe('completed')
  })

  it('lets a group discount sit on the quantity break, and a fixed price replace both', () => {
    const breaks = [{ productId: 1, minQty: 12, price: 16 }]
    const group = {
      name: 'Dozen notebooks',
      productId: 1,
      minQty: 12,
      discountPercent: 5,
      fixedPrice: null,
      customerId: null,
      customerGroupId: 7,
      vendorId: null,
      active: true,
    }
    expect(resolveUnitPrice({
      side: 'sales',
      productId: 1,
      quantity: 12,
      listPrice: 18,
      customerId: 3,
      customerGroupId: 7,
      vendorId: null,
      breaks,
      rules: [group],
    })).toEqual({ unitPrice: 16, discount: 5, ruleName: 'Dozen notebooks' })

    expect(resolveUnitPrice({
      side: 'sales',
      productId: 1,
      quantity: 12,
      listPrice: 18,
      customerId: 3,
      customerGroupId: 7,
      vendorId: null,
      breaks,
      rules: [{ ...group, name: 'Fixed', fixedPrice: 15, customerId: 3, customerGroupId: null }],
    })).toEqual({ unitPrice: 15, discount: 0, ruleName: 'Fixed' })

    expect(resolveUnitPrice({
      side: 'sales',
      productId: 1,
      quantity: 2,
      listPrice: 18,
      customerId: null,
      customerGroupId: null,
      vendorId: null,
      breaks,
      rules: [group],
    })).toEqual({ unitPrice: 18, discount: 0, ruleName: null })
  })
})
