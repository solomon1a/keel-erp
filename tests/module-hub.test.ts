import { describe, expect, it } from 'vitest'
import { hubTiles, segmentTiles } from '../src/lib/module-hub.ts'
import { appModules } from '../src/lib/modules.ts'

function labels(moduleId: string) {
  const mod = appModules.find((item) => item.id === moduleId)
  if (!mod) throw new Error(`Missing module ${moduleId}`)
  return hubTiles(mod).map((tile) => tile.label)
}

describe('module hubs', () => {
  it('opens sales on the sections a person works in', () => {
    const sales = appModules.find((item) => item.id === 'sales')
    expect(sales?.home).toBe('/go/sales')
    expect(labels('sales')).toEqual(expect.arrayContaining([
      'menu.quotations',
      'menu.orders',
      'menu.customers',
      'menu.products',
      'desk.s.sales.pricelists',
      'hub.reports',
      'hub.settings',
    ]))
    const tiles = hubTiles(sales!)
    expect(tiles.find((tile) => tile.label === 'hub.reports')?.to).toBe('/app/sales/analysis')
    expect(tiles.find((tile) => tile.label === 'desk.g.configuration')?.to).toBe('/go/sales/desk.g.configuration')
    expect(segmentTiles(sales!, 'desk.g.configuration')?.tiles.map((tile) => tile.label)).toEqual([
      'desk.s.sales.teams',
      'desk.s.sales.payment-terms',
      'desk.s.sales.tags',
    ])
  })

  it('opens accounting on invoices, bills, the books, reporting, and settings', () => {
    expect(labels('accounting')).toEqual(expect.arrayContaining([
      'menu.invoices',
      'acct.in',
      'desk.s.accounting.customer-payments',
      'desk.g.entries',
      'desk.s.accounting.accounts',
      'hub.reports',
      'hub.settings',
    ]))
    const accounting = appModules.find((item) => item.id === 'accounting')!
    expect(hubTiles(accounting).find((tile) => tile.label === 'hub.reports')?.to).toBe('/go/accounting/menu.reporting')
    expect(segmentTiles(accounting, 'menu.reporting')?.tiles.map((tile) => tile.to)).toEqual(expect.arrayContaining([
      '/accounting/reports?view=pnl',
      '/accounting/reports?view=balance',
      '/accounting/reports?view=vat',
    ]))
  })

  it('gives every app a hub and keeps compliance off the launcher', () => {
    expect(appModules.some((mod) => mod.id === 'compliance')).toBe(false)
    for (const mod of appModules) {
      expect(mod.home).toBe(`/go/${mod.id}`)
      expect(mod.match).toContain(`/go/${mod.id}`)
      const tiles = hubTiles(mod)
      expect(tiles.length).toBeGreaterThan(0)
      for (const tile of tiles) expect(tile.to.startsWith('/')).toBe(true)
    }
  })
})
