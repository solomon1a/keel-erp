import { describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import {
  jiangbeiHelpdeskBoard,
  volumeBooks,
  volumeCustomers,
  volumeDeskOrders,
  volumeEmployees,
  volumeInvoices,
  volumeLeads,
  volumeManufacturing,
  volumeProducts,
  volumeProjects,
  volumePurchases,
  volumeQuotations,
  volumeRfqs,
  volumeTickets,
  volumeVendors,
} from '../prisma/volume-plan.ts'
import { roundMoney } from '../src/domain/money.ts'

describe('Jiangbei volume plan', () => {
  it('keeps a year of documents in balance', () => {
    expect(volumeCustomers.length).toBeGreaterThanOrEqual(60)
    expect(volumeCustomers.length).toBeLessThanOrEqual(80)
    expect(volumeVendors.length).toBeGreaterThanOrEqual(25)
    expect(volumeVendors.length).toBeLessThanOrEqual(30)
    expect(volumeProducts.length).toBeGreaterThanOrEqual(80)
    expect(volumeLeads.length).toBeGreaterThanOrEqual(120)
    expect(volumeQuotations.length).toBeGreaterThanOrEqual(150)
    expect(volumeDeskOrders.length).toBeGreaterThanOrEqual(150)
    expect(volumePurchases.length).toBeGreaterThanOrEqual(80)
    expect(volumeRfqs.length).toBeGreaterThanOrEqual(80)
    expect(volumeManufacturing.length).toBeGreaterThanOrEqual(40)
    expect(volumeEmployees.length).toBeGreaterThanOrEqual(28)
    expect(volumeProjects.length).toBeGreaterThanOrEqual(8)
    expect(volumeTickets.length).toBeGreaterThanOrEqual(50)
    expect(volumeInvoices.some((row) => row.moveType === 'out_refund')).toBe(true)
    expect(roundMoney(volumeBooks.assetDelta - volumeBooks.liabilityDelta - volumeBooks.profit) === 0).toBe(true)
    expect(volumeBooks.profit).toBe(roundMoney(volumeBooks.income - volumeBooks.expense))
    expect(jiangbeiBooks.profit).toBe(roundMoney(jiangbeiBooks.income - jiangbeiBooks.expense))
    expect(jiangbeiBooks.profit).toBeGreaterThan(0)
    expect(jiangbeiBooks.margin).toBeGreaterThanOrEqual(5)
    expect(jiangbeiBooks.margin).toBeLessThanOrEqual(25)
    expect(jiangbeiBooks.assets).toBeGreaterThan(0)
    expect(roundMoney(jiangbeiBooks.assets - jiangbeiBooks.liabilities - jiangbeiBooks.equity)).toBe(0)
    expect(jiangbeiHelpdeskBoard.tickets).toBe(12 + volumeTickets.length)
  })
})
