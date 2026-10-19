import { findDeskScreen } from '../../shared/desk-screens.ts'

/**
 * Stub desk lists and reports stay routable, but navigation never links them.
 * A path here is a real screen that already does the job.
 */
const liveTargets: Record<string, string> = {
  '/app/inventory/receipts': '/inventory/transfers',
  '/app/inventory/deliveries': '/inventory/transfers',
  '/app/inventory/adjustments': '/inventory',
  '/app/inventory/scrap': '/manufacturing/wastage',
  '/app/inventory/valuation': '/inventory/valuation',
  '/app/inventory/locations': '/inventory/warehouses',
  '/app/inventory/routes': '/inventory/routes',

  '/app/purchase/dashboard': '/purchases',
  '/app/purchase/receipts': '/purchases?state=purchase',
  '/app/purchase/bills': '/accounting?moveType=in_invoice',
  '/app/purchase/vendor-pricelists': '/sales/pricelists?side=purchase',

  '/app/sales/pricelists': '/sales/pricelists',
  '/app/sales/payment-terms': '/sales/payment-terms',

  '/app/accounting/dashboard': '/accounting',
  '/app/accounting/credit-notes': '/accounting?moveType=out_refund',
  '/app/accounting/customer-payments': '/accounting?moveType=out_invoice',
  '/app/accounting/vendor-refunds': '/accounting?moveType=in_refund',
  '/app/accounting/vendor-payments': '/accounting?moveType=in_invoice',
  '/app/accounting/reconcile': '/accounting/statements',
  '/app/accounting/bank': '/accounting/statements',
  '/app/accounting/journals': '/accounting/ledger',
  '/app/accounting/aged-receivable': '/accounting/reports?view=aged-receivable',
  '/app/accounting/aged-payable': '/accounting/reports?view=aged-payable',
  '/app/accounting/cash-flow': '/accounting/reports?view=cashflow',

  '/app/projects/dashboard': '/projects',
  '/app/projects/timesheets': '/projects?view=time',
  '/app/projects/billing': '/projects?view=bill',
  '/app/projects/profitability': '/projects?view=profit',

  '/app/quality/dashboard': '/quality',

  '/app/manufacturing/dashboard': '/manufacturing',
  '/app/manufacturing/work-orders': '/manufacturing',
  '/app/manufacturing/production-plan': '/manufacturing/plan',

  '/app/assets/dashboard': '/assets',
  '/app/assets/depreciation': '/assets',
  '/app/assets/schedule': '/assets',
  '/app/assets/disposals': '/assets',

  '/app/subcontracting/dashboard': '/subcontracting',
  '/app/subcontracting/orders': '/subcontracting',
  '/app/subcontracting/receipts': '/subcontracting',
  '/app/subcontracting/pending': '/subcontracting',
  '/app/subcontracting/boms': '/boms',

  '/app/wastage/dashboard': '/manufacturing/wastage',
  '/app/wastage/records': '/manufacturing/wastage',
  '/app/wastage/inventory': '/manufacturing/wastage',
  '/app/wastage/manufacturing': '/manufacturing/wastage',

  '/app/website/pages': '/sites',

  '/app/hr/dashboard': '/hr',
  '/app/hr/departments': '/hr',
  '/app/hr/leave': '/hr',
  '/app/hr/approvals': '/hr',

  '/app/attendance/dashboard': '/hr',
  '/app/attendance/check-in': '/hr',

  '/app/payroll/batches': '/hr/payroll',
  '/app/payroll/payslips': '/hr/payroll',
  '/app/payroll/structures': '/hr/payroll',

  '/app/expenses/reports': '/hr/expenses',
  '/app/expenses/approvals': '/hr/expenses',
}

type NavEntry = {
  label: string
  to?: string
  children?: { label: string; to: string }[]
}

/** Real destination, or null when the click would open a Coming soon list or report. */
export function liveHref(to: string): string | null {
  const path = to.split('?')[0] ?? ''
  const mapped = liveTargets[path]
  if (mapped) return mapped
  const match = path.match(/^\/app\/([^/]+)\/([^/]+)$/)
  if (!match) return to
  const screen = findDeskScreen(match[1] ?? '', match[2] ?? '')
  if (!screen) return to
  if (screen.kind === 'list' || screen.kind === 'report') return null
  return to
}

export function visibleEntries<T extends NavEntry>(entries: T[]): T[] {
  const next: T[] = []
  for (const entry of entries) {
    if (entry.children) {
      const children = entry.children.flatMap((child) => {
        const to = liveHref(child.to)
        return to ? [{ ...child, to }] : []
      })
      if (children.length > 0) next.push({ ...entry, children })
      continue
    }
    if (!entry.to) continue
    const to = liveHref(entry.to)
    if (to) next.push({ ...entry, to })
  }
  return next
}

export function menuHasLinks(entries: NavEntry[]) {
  return entries.some((entry) => Boolean(entry.to) || (entry.children?.length ?? 0) > 0)
}
