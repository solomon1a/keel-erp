import { describe, expect, it } from 'vitest'
import { hubTiles, segmentTiles } from '../src/lib/module-hub.ts'
import { appModules, launcherModules, moduleForPath } from '../src/lib/modules.ts'

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

  it('opens HR, attendance, finance, procurement, and wastage on their sections', () => {
    expect(labels('hr')).toEqual(expect.arrayContaining([
      'desk.s.hr.dashboard',
      'menu.employees',
      'desk.s.hr.departments',
      'desk.s.hr.designations',
      'desk.s.hr.org',
      'desk.s.hr.contracts',
      'desk.s.hr.jobs',
      'desk.s.hr.applicants',
      'desk.s.hr.onboarding',
      'desk.s.hr.appraisals',
      'desk.s.hr.leave-types',
      'desk.s.hr.leave',
      'desk.s.hr.approvals',
      'hub.reports',
      'hub.settings',
    ]))
    expect(labels('attendance')).toEqual(expect.arrayContaining([
      'desk.s.attendance.check-in',
      'desk.s.attendance.shifts',
      'desk.s.attendance.rosters',
      'desk.s.attendance.sheet',
      'desk.s.attendance.late',
      'desk.s.attendance.absent',
      'desk.s.attendance.overtime',
      'desk.s.attendance.calendar',
      'hub.reports',
    ]))
    expect(labels('accounting')).toEqual(expect.arrayContaining([
      'desk.s.accounting.dashboard',
      'desk.s.accounting.bank',
      'desk.s.accounting.budgets',
      'desk.s.accounting.cost-centres',
      'menu.expenses',
      'hub.reports',
    ]))
    expect(segmentTiles(appModules.find((item) => item.id === 'accounting')!, 'menu.reporting')?.tiles.map((tile) => tile.label)).toEqual(expect.arrayContaining([
      'acct.pnl',
      'acct.balance',
      'desk.s.accounting.cash-flow',
      'desk.s.accounting.aged-receivable',
      'desk.s.accounting.aged-payable',
      'acct.vat',
    ]))
    expect(labels('purchase')).toEqual(expect.arrayContaining([
      'desk.s.purchase.requisitions',
      'menu.rfq',
      'desk.s.purchase.comparison',
      'menu.orders',
      'desk.s.purchase.approvals',
      'desk.s.purchase.receipts',
      'desk.s.purchase.bills',
      'desk.s.purchase.evaluation',
      'hub.reports',
    ]))
    expect(labels('wastage')).toEqual(expect.arrayContaining([
      'desk.s.wastage.dashboard',
      'desk.s.wastage.records',
      'desk.s.wastage.inventory',
      'desk.s.wastage.manufacturing',
      'hub.reports',
      'hub.settings',
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

  it('gives the website builder its own tile next to eCommerce', () => {
    const ids = launcherModules().map((mod) => mod.id)
    expect(ids.indexOf('sites')).toBe(ids.indexOf('website') + 1)
    expect(labels('sites')).toEqual(['menu.sitePages', 'menu.blog', 'menu.theme', 'menu.navigation', 'menu.inbox'])
    expect(labels('website')).not.toContain('menu.builder')
    expect(labels('website')).toEqual(expect.arrayContaining(['menu.websiteHome', 'menu.products', 'desk.s.website.coupons', 'hub.reports', 'hub.settings']))
    expect(moduleForPath('/sites')?.id).toBe('sites')
    expect(moduleForPath('/sites/blog')?.id).toBe('sites')
    expect(moduleForPath('/website')?.id).toBe('website')
  })
})
