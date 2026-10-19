import { describe, expect, it } from 'vitest'
import { findDeskScreen } from '../shared/desk-screens.ts'
import { hubTiles, segmentTiles } from '../src/lib/module-hub.ts'
import { appModules, launcherModules, moduleForPath } from '../src/lib/modules.ts'

function labels(moduleId: string) {
  const mod = appModules.find((item) => item.id === moduleId)
  if (!mod) throw new Error(`Missing module ${moduleId}`)
  return hubTiles(mod).map((tile) => tile.label)
}

function links(moduleId: string) {
  const mod = appModules.find((item) => item.id === moduleId)
  if (!mod) throw new Error(`Missing module ${moduleId}`)
  return mod.menu.flatMap((entry) => entry.children ?? (entry.to ? [{ label: entry.label, to: entry.to }] : []))
}

function dest(moduleId: string, label: string) {
  return links(moduleId).find((link) => link.label === label)?.to
}

function comingSoon(to: string) {
  const path = to.split('?')[0] ?? ''
  const match = path.match(/^\/app\/([^/]+)\/([^/]+)$/)
  if (!match) return false
  const screen = findDeskScreen(match[1] ?? '', match[2] ?? '')
  return screen?.kind === 'list' || screen?.kind === 'report'
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
      'desk.s.sales.payment-terms',
      'hub.settings',
    ]))
    expect(labels('sales')).not.toContain('hub.reports')
    const tiles = hubTiles(sales!)
    expect(tiles.find((tile) => tile.label === 'desk.s.sales.pricelists')?.to).toBe('/sales/pricelists')
    expect(tiles.find((tile) => tile.label === 'desk.s.sales.payment-terms')?.to).toBe('/sales/payment-terms')
    expect(segmentTiles(sales!, 'desk.g.configuration')).toBeNull()
  })

  it('opens accounting on invoices, bills, the books, reporting, and settings', () => {
    expect(labels('accounting')).toEqual(expect.arrayContaining([
      'menu.invoices',
      'acct.in',
      'desk.s.accounting.customer-payments',
      'desk.s.accounting.credit-notes',
      'desk.g.entries',
      'desk.s.accounting.accounts',
      'desk.s.accounting.bank',
      'hub.reports',
      'hub.settings',
    ]))
    expect(labels('accounting')).not.toContain('desk.s.accounting.budgets')
    expect(labels('accounting')).not.toContain('desk.s.accounting.cost-centres')
    const accounting = appModules.find((item) => item.id === 'accounting')!
    expect(hubTiles(accounting).find((tile) => tile.label === 'hub.reports')?.to).toBe('/go/accounting/menu.reporting')
    expect(dest('accounting', 'desk.s.accounting.credit-notes')).toBe('/accounting?moveType=out_refund')
    expect(dest('accounting', 'desk.s.accounting.customer-payments')).toBe('/accounting?moveType=out_invoice')
    expect(dest('accounting', 'desk.s.accounting.vendor-payments')).toBe('/accounting?moveType=in_invoice')
    expect(dest('accounting', 'desk.s.accounting.vendor-refunds')).toBe('/accounting?moveType=in_refund')
    expect(dest('accounting', 'desk.s.accounting.reconcile')).toBe('/accounting/statements')
    expect(dest('accounting', 'desk.s.accounting.journals')).toBe('/accounting/ledger')
    expect(segmentTiles(accounting, 'menu.reporting')?.tiles.map((tile) => tile.to).sort()).toEqual([
      '/accounting/reports?view=aged-payable',
      '/accounting/reports?view=aged-receivable',
      '/accounting/reports?view=balance',
      '/accounting/reports?view=cashflow',
      '/accounting/reports?view=pnl',
      '/accounting/reports?view=vat',
    ])
  })

  it('opens HR, attendance, finance, procurement, and wastage on their real sections', () => {
    expect(dest('hr', 'desk.s.hr.departments')).toBe('/hr')
    expect(dest('hr', 'desk.s.hr.leave')).toBe('/hr')
    expect(dest('hr', 'desk.s.hr.approvals')).toBe('/hr')
    expect(dest('hr', 'desk.s.hr.jobs')).toBeUndefined()
    expect(dest('attendance', 'desk.s.attendance.check-in')).toBe('/hr')
    expect(dest('attendance', 'desk.s.attendance.shifts')).toBeUndefined()
    expect(dest('payroll', 'desk.s.payroll.payslips')).toBe('/hr/payroll')
    expect(dest('payroll', 'desk.s.payroll.batches')).toBe('/hr/payroll')
    expect(dest('payroll', 'desk.s.payroll.structures')).toBe('/hr/payroll')
    expect(dest('payroll', 'desk.s.payroll.rules')).toBeUndefined()
    expect(dest('purchase', 'desk.s.purchase.receipts')).toBe('/purchases?state=purchase')
    expect(dest('purchase', 'desk.s.purchase.bills')).toBe('/accounting?moveType=in_invoice')
    expect(dest('purchase', 'desk.s.purchase.vendor-pricelists')).toBe('/sales/pricelists?side=purchase')
    expect(dest('purchase', 'desk.s.purchase.requisitions')).toBeUndefined()
    expect(dest('inventory', 'desk.s.inventory.receipts')).toBe('/inventory/transfers')
    expect(dest('inventory', 'desk.s.inventory.deliveries')).toBe('/inventory/transfers')
    expect(dest('inventory', 'desk.s.inventory.adjustments')).toBe('/inventory')
    expect(dest('inventory', 'desk.s.inventory.scrap')).toBe('/manufacturing/wastage')
    expect(dest('inventory', 'desk.s.inventory.putaway')).toBeUndefined()
    expect(dest('wastage', 'desk.s.wastage.records')).toBe('/manufacturing/wastage')
    expect(dest('wastage', 'desk.s.wastage.by-product')).toBeUndefined()
    expect(dest('projects', 'desk.s.projects.timesheets')).toBe('/projects?view=time')
    expect(dest('projects', 'desk.s.projects.billing')).toBe('/projects?view=bill')
    expect(dest('projects', 'desk.s.projects.profitability')).toBe('/projects?view=profit')
    expect(dest('projects', 'desk.s.projects.milestones')).toBeUndefined()
    expect(dest('quality', 'desk.s.quality.inspections')).toBe('/quality')
    expect(dest('quality', 'desk.s.quality.alerts')).toBe('/quality/alerts')
    expect(dest('manufacturing', 'desk.s.manufacturing.work-orders')).toBe('/manufacturing')
    expect(dest('manufacturing', 'desk.s.manufacturing.production-plan')).toBe('/manufacturing/plan')
    expect(dest('manufacturing', 'desk.s.manufacturing.work-centers')).toBeUndefined()
    expect(dest('assets', 'desk.s.assets.register')).toBe('/assets')
    expect(dest('assets', 'desk.s.assets.depreciation')).toBe('/assets')
    expect(dest('subcontracting', 'desk.s.subcontracting.orders')).toBe('/subcontracting')
    expect(dest('subcontracting', 'desk.s.subcontracting.receipts')).toBe('/subcontracting')
    expect(dest('website', 'desk.s.website.pages')).toBe('/sites')
    expect(dest('website', 'desk.s.website.coupons')).toBeUndefined()
    expect(dest('pos', 'desk.s.pos.payment-methods')).toBeUndefined()
    expect(dest('helpdesk', 'desk.s.helpdesk.tickets')).toBeUndefined()
    expect(dest('helpdesk', 'desk.s.helpdesk.settings')).toBe('/app/helpdesk/settings')
  })

  it('gives every app a hub of real links and keeps compliance off the launcher', () => {
    expect(appModules.some((mod) => mod.id === 'compliance')).toBe(false)
    for (const mod of appModules) {
      expect(mod.home).toBe(`/go/${mod.id}`)
      expect(mod.match).toContain(`/go/${mod.id}`)
      const tiles = hubTiles(mod)
      expect(tiles.length, mod.id).toBeGreaterThan(0)
      for (const tile of tiles) {
        expect(tile.to.startsWith('/'), tile.to).toBe(true)
        expect(comingSoon(tile.to), `${mod.id} ${tile.to}`).toBe(false)
      }
      for (const link of links(mod.id)) expect(comingSoon(link.to), `${mod.id} ${link.to}`).toBe(false)
    }
    expect(launcherModules().map((mod) => mod.id).sort()).toEqual(appModules.map((mod) => mod.id).sort())
  })

  it('gives the website builder its own tile next to eCommerce', () => {
    const ids = launcherModules().map((mod) => mod.id)
    expect(ids.indexOf('sites')).toBe(ids.indexOf('website') + 1)
    expect(labels('sites')).toEqual(['menu.sitePages', 'menu.blog', 'menu.theme', 'menu.navigation', 'menu.inbox'])
    expect(labels('website')).not.toContain('menu.builder')
    expect(labels('website')).toEqual(expect.arrayContaining(['menu.websiteHome', 'menu.products', 'desk.s.website.pages', 'hub.settings']))
    expect(labels('website')).not.toContain('desk.s.website.coupons')
    expect(moduleForPath('/sites')?.id).toBe('sites')
    expect(moduleForPath('/sites/blog')?.id).toBe('sites')
    expect(moduleForPath('/website')?.id).toBe('website')
    expect(moduleForPath('/sales/pricelists')?.id).toBe('sales')
  })
})
