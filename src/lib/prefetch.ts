import type { QueryClient } from '@tanstack/react-query'
import { api } from './api.ts'

export function prefetchDesk(client: QueryClient) {
  const jobs: Array<[readonly unknown[], string]> = [
    [['desk'], '/api/desk'],
    [['orders', 'all'], '/api/orders?state=all'],
    [['orders', 'draft'], '/api/orders?state=draft'],
    [['contacts', '', 'all', 'all'], '/api/contacts?search=&kind=all&role=all'],
    [['products'], '/api/products'],
    [['leads'], '/api/leads'],
    [['purchases', 'all'], '/api/purchases?state=all'],
    [['vendors', ''], '/api/contacts?role=supplier&search='],
    [['boms'], '/api/boms'],
    [['manufacturing', 'all'], '/api/manufacturing?state=all'],
    [['stock'], '/api/stock'],
    [['transfers', 'all'], '/api/transfers?state=all'],
    [['warehouses'], '/api/warehouses'],
    [['pos-sessions'], '/api/pos/sessions'],
    [['pos-orders', ''], '/api/pos/orders'],
    [['invoices', ''], '/api/invoices'],
    [['employees'], '/api/employees'],
    [['departments'], '/api/departments'],
    [['payroll'], '/api/payroll'],
    [['salaries'], '/api/payroll/salaries'],
    [['expenses'], '/api/expenses'],
    [['replenish'], '/api/stock/replenish'],
    [['moves', '', ''], '/api/stock/moves'],
    [['pnl'], '/api/reports/pnl'],
    [['taxes'], '/api/taxes'],
  ]
  for (const [queryKey, path] of jobs) {
    void client.prefetchQuery({ queryKey: [...queryKey], queryFn: () => api(path) })
  }
}
