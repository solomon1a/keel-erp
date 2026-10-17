import type { QueryClient } from '@tanstack/react-query'
import { deskListMeta } from '../../shared/views.ts'
import { api } from './api.ts'

const warmed = new Set<string>()

function warm(client: QueryClient, key: readonly unknown[], path: string) {
  const id = JSON.stringify(key)
  if (warmed.has(id)) return
  warmed.add(id)
  void client.prefetchQuery({ queryKey: [...key], queryFn: () => api(path) })
}

function stateOf(query: string) {
  return new URLSearchParams(query).get('state') ?? 'all'
}

export function prefetchHref(client: QueryClient, href: string) {
  const [path = '', query = ''] = href.split('?')
  if (!path.startsWith('/')) return
  switch (path) {
    case '/go/dashboard':
      warm(client, ['home', 'month'], '/api/home?range=month')
      warm(client, ['desk'], '/api/desk')
      return
    case '/orders':
      warm(client, ['orders', stateOf(query)], `/api/orders?state=${stateOf(query)}`)
      return
    case '/purchases':
      warm(client, ['purchases', stateOf(query)], `/api/purchases?state=${stateOf(query)}`)
      return
    case '/contacts':
      warm(client, ['contacts', '', 'all', 'all'], '/api/contacts?search=&kind=all&role=all')
      return
    case '/products':
      warm(client, ['products'], '/api/products')
      return
    case '/crm':
      warm(client, ['leads'], '/api/leads')
      return
    case '/inventory':
      warm(client, ['products'], '/api/products')
      warm(client, ['stock'], '/api/stock')
      return
    case '/manufacturing':
      warm(client, ['manufacturing', stateOf(query)], `/api/manufacturing?state=${stateOf(query)}`)
      return
    case '/boms':
      warm(client, ['boms'], '/api/boms')
      return
    case '/pos':
      warm(client, ['pos-sessions'], '/api/pos/sessions')
      return
    case '/accounting':
      warm(client, ['invoices', ''], '/api/invoices')
      return
    case '/accounting/reports':
      warm(client, ['reports-pack'], '/api/reports/pack?asOf=2026-10-16')
      return
    case '/accounting/ledger':
      warm(client, ['ledger', ''], '/api/ledger')
      return
    case '/hr':
      warm(client, ['employees'], '/api/employees')
      warm(client, ['departments'], '/api/departments')
      return
    case '/hr/payroll':
      warm(client, ['payroll'], '/api/payroll')
      return
    case '/hr/expenses':
      warm(client, ['expenses'], '/api/expenses')
      return
    default:
      break
  }
  if (!path.startsWith('/app/')) return
  const [, , module, screen] = path.split('/')
  if (!module || !screen || screen === 'new') return
  warm(
    client,
    ['desk-records', module, screen, '', 'all', 1],
    `/api/desk-records?module=${encodeURIComponent(module)}&screen=${encodeURIComponent(screen)}&q=&state=all&page=1&pageSize=${deskListMeta.pageSize}`,
  )
}
