import type { LucideIcon } from 'lucide-react'
import {
  BookOpen,
  Factory,
  Globe,
  Kanban,
  LayoutDashboard,
  ShoppingBag,
  Store,
  Truck,
  Users,
  Warehouse,
} from 'lucide-react'
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
  icon: LucideIcon
  group: 'overview' | 'sell' | 'supply' | 'finance' | 'people'
  menu: MenuEntry[]
  match: string[]
}

export const appModules: AppModule[] = [
  {
    id: 'dashboard',
    label: 'mod.dashboard',
    description: 'mod.dashboard.desc',
    home: '/desk',
    icon: LayoutDashboard,
    group: 'overview',
    match: ['/desk'],
    menu: [{ label: 'mod.dashboard', to: '/desk' }],
  },
  {
    id: 'sales',
    label: 'mod.sales',
    description: 'mod.sales.desc',
    home: '/orders',
    icon: ShoppingBag,
    group: 'sell',
    match: ['/orders', '/contacts', '/products'],
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
    icon: Kanban,
    group: 'sell',
    match: ['/crm'],
    menu: [{ label: 'menu.pipeline', to: '/crm' }],
  },
  {
    id: 'pos',
    label: 'mod.pos',
    description: 'mod.pos.desc',
    home: '/pos',
    icon: Store,
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
    icon: Globe,
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
    icon: Truck,
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
    icon: Warehouse,
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
    icon: Factory,
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
    icon: BookOpen,
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
    icon: Users,
    group: 'people',
    match: ['/hr'],
    menu: [
      { label: 'menu.employees', to: '/hr' },
      { label: 'menu.payroll', to: '/hr/payroll' },
      { label: 'menu.expenses', to: '/hr/expenses' },
    ],
  },
]

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
