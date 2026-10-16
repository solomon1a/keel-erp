import type { MessageKey } from '../i18n/messages.ts'

export type MenuLink = { label: MessageKey; to: string }

export type MenuEntry = {
  label: MessageKey
  to?: string
  children?: MenuLink[]
}

export type AppModule = {
  id: string
  label: MessageKey
  description: MessageKey
  home: string
  group: 'overview' | 'sell' | 'supply' | 'finance' | 'people'
  menu: MenuEntry[]
  match: string[]
}

const peopleMenu: MenuEntry[] = [
  { label: 'menu.employees', to: '/hr' },
  { label: 'menu.payroll', to: '/hr/payroll' },
  { label: 'menu.expenses', to: '/hr/expenses' },
]

export const appModules: AppModule[] = [
  {
    id: 'dashboard',
    label: 'mod.dashboard',
    description: 'mod.dashboard.desc',
    home: '/desk',
    group: 'overview',
    match: ['/desk'],
    menu: [{ label: 'mod.dashboard', to: '/desk' }],
  },
  {
    id: 'sales',
    label: 'mod.sales',
    description: 'mod.sales.desc',
    home: '/orders',
    group: 'sell',
    match: ['/orders', '/products'],
    menu: [
      {
        label: 'menu.orders',
        children: [
          { label: 'menu.orders', to: '/orders' },
          { label: 'menu.quotations', to: '/orders?state=draft' },
        ],
      },
      { label: 'menu.customers', to: '/contacts' },
      { label: 'menu.products', to: '/products' },
    ],
  },
  {
    id: 'crm',
    label: 'mod.crm',
    description: 'mod.crm.desc',
    home: '/crm',
    group: 'sell',
    match: ['/crm'],
    menu: [{ label: 'menu.pipeline', to: '/crm' }],
  },
  {
    id: 'pos',
    label: 'mod.pos',
    description: 'mod.pos.desc',
    home: '/pos',
    group: 'sell',
    match: ['/pos'],
    menu: [
      { label: 'menu.sessions', to: '/pos' },
      { label: 'menu.posOrders', to: '/pos/orders' },
      { label: 'menu.daily', to: '/pos/report' },
    ],
  },
  {
    id: 'website',
    label: 'mod.website',
    description: 'mod.website.desc',
    home: '/website',
    group: 'sell',
    match: ['/website'],
    menu: [
      { label: 'menu.websiteHome', to: '/website' },
      { label: 'menu.storefront', to: '/shop' },
    ],
  },
  {
    id: 'purchase',
    label: 'mod.purchase',
    description: 'mod.purchase.desc',
    home: '/purchases',
    group: 'supply',
    match: ['/purchases', '/vendors'],
    menu: [
      { label: 'menu.rfq', to: '/purchases' },
      { label: 'menu.vendors', to: '/vendors' },
    ],
  },
  {
    id: 'inventory',
    label: 'mod.inventory',
    description: 'mod.inventory.desc',
    home: '/inventory',
    group: 'supply',
    match: ['/inventory'],
    menu: [
      {
        label: 'menu.operations',
        children: [
          { label: 'menu.onHand', to: '/inventory' },
          { label: 'menu.transfers', to: '/inventory/transfers' },
          { label: 'menu.replenish', to: '/inventory/replenish' },
        ],
      },
      { label: 'menu.warehouses', to: '/inventory/warehouses' },
      { label: 'menu.reporting', to: '/inventory/moves' },
    ],
  },
  {
    id: 'manufacturing',
    label: 'mod.manufacturing',
    description: 'mod.manufacturing.desc',
    home: '/manufacturing',
    group: 'supply',
    match: ['/manufacturing', '/boms'],
    menu: [
      { label: 'menu.mo', to: '/manufacturing' },
      { label: 'menu.boms', to: '/boms' },
    ],
  },
  {
    id: 'accounting',
    label: 'mod.accounting',
    description: 'mod.accounting.desc',
    home: '/accounting',
    group: 'finance',
    match: ['/accounting'],
    menu: [
      { label: 'menu.invoices', to: '/accounting' },
      { label: 'menu.ledger', to: '/accounting/ledger' },
      { label: 'menu.reports', to: '/accounting/reports' },
    ],
  },
  {
    id: 'hr',
    label: 'mod.hr',
    description: 'mod.hr.desc',
    home: '/hr',
    group: 'people',
    match: ['/hr'],
    menu: peopleMenu,
  },
  {
    id: 'contacts',
    label: 'mod.contacts',
    description: 'mod.contacts.desc',
    home: '/contacts',
    group: 'sell',
    match: ['/contacts'],
    menu: [{ label: 'mod.contacts', to: '/contacts' }],
  },
  {
    id: 'payroll',
    label: 'mod.payroll',
    description: 'mod.payroll.desc',
    home: '/hr/payroll',
    group: 'people',
    match: ['/hr/payroll'],
    menu: peopleMenu,
  },
  {
    id: 'expenses',
    label: 'mod.expenses',
    description: 'mod.expenses.desc',
    home: '/hr/expenses',
    group: 'people',
    match: ['/hr/expenses'],
    menu: peopleMenu,
  },
]

const launcherOrder = [
  'dashboard',
  'contacts',
  'crm',
  'sales',
  'purchase',
  'inventory',
  'manufacturing',
  'pos',
  'website',
  'accounting',
  'expenses',
  'hr',
  'payroll',
]

export function launcherModules() {
  return [...appModules].sort((a, b) => launcherOrder.indexOf(a.id) - launcherOrder.indexOf(b.id))
}

const groups = ['overview', 'sell', 'supply', 'finance', 'people'] as const

export function modulesInGroup(group: (typeof groups)[number]) {
  return appModules.filter((mod) => mod.group === group)
}

export function moduleForPath(pathname: string) {
  const ranked = [...appModules].sort((a, b) => {
    const aLen = Math.max(...a.match.map((prefix) => prefix.length))
    const bLen = Math.max(...b.match.map((prefix) => prefix.length))
    return bLen - aLen
  })
  return ranked.find((mod) => mod.match.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) ?? null
}

export function linkActive(to: string, pathname: string, search: string) {
  const [path, query] = to.split('?')
  if (!path) return false
  if (query) {
    const wanted = new URLSearchParams(query).get('state')
    return pathname === path && new URLSearchParams(search).get('state') === wanted
  }
  if (path === '/orders') return pathname === '/orders' && !new URLSearchParams(search).get('state')
  if (path === '/hr') return pathname === '/hr' || /^\/hr\/\d+/.test(pathname)
  if (path === '/inventory') return pathname === '/inventory'
  if (path === '/pos') return pathname === '/pos' || pathname.startsWith('/pos/sessions')
  if (path === '/accounting') return pathname === '/accounting' || /^\/accounting\/\d+/.test(pathname)
  if (path === '/crm') return pathname === '/crm' || /^\/crm\/\d+/.test(pathname)
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function sectionForPath(mod: AppModule, pathname: string, search: string): MenuLink | null {
  const links = mod.menu.flatMap((entry) => entry.children ?? (entry.to ? [{ label: entry.label, to: entry.to }] : []))
  return links.find((link) => linkActive(link.to, pathname, search)) ?? links[0] ?? null
}
