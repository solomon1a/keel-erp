import type { MessageKey } from '../i18n/messages.ts'
import { moduleMenus } from './module-menus.ts'

export type MenuLink = { label: string; to: string }

export type MenuEntry = {
  label: string
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

export const appModules: AppModule[] = [
  {
    id: 'dashboard',
    label: 'mod.dashboard',
    description: 'mod.dashboard.desc',
    home: '/desk',
    group: 'overview',
    match: ['/desk', '/app/dashboard'],
    menu: moduleMenus.dashboard ?? [],
  },
  {
    id: 'sales',
    label: 'mod.sales',
    description: 'mod.sales.desc',
    home: '/orders',
    group: 'sell',
    match: ['/orders', '/products', '/app/sales'],
    menu: moduleMenus.sales ?? [],
  },
  {
    id: 'crm',
    label: 'mod.crm',
    description: 'mod.crm.desc',
    home: '/crm',
    group: 'sell',
    match: ['/crm', '/app/crm'],
    menu: moduleMenus.crm ?? [],
  },
  {
    id: 'pos',
    label: 'mod.pos',
    description: 'mod.pos.desc',
    home: '/pos',
    group: 'sell',
    match: ['/pos', '/app/pos'],
    menu: moduleMenus.pos ?? [],
  },
  {
    id: 'website',
    label: 'mod.website',
    description: 'mod.website.desc',
    home: '/website',
    group: 'sell',
    match: ['/website', '/app/website'],
    menu: moduleMenus.website ?? [],
  },
  {
    id: 'purchase',
    label: 'mod.purchase',
    description: 'mod.purchase.desc',
    home: '/purchases',
    group: 'supply',
    match: ['/purchases', '/vendors', '/app/purchase'],
    menu: moduleMenus.purchase ?? [],
  },
  {
    id: 'inventory',
    label: 'mod.inventory',
    description: 'mod.inventory.desc',
    home: '/inventory',
    group: 'supply',
    match: ['/inventory', '/app/inventory'],
    menu: moduleMenus.inventory ?? [],
  },
  {
    id: 'manufacturing',
    label: 'mod.manufacturing',
    description: 'mod.manufacturing.desc',
    home: '/manufacturing',
    group: 'supply',
    match: ['/manufacturing', '/boms', '/app/manufacturing'],
    menu: moduleMenus.manufacturing ?? [],
  },
  {
    id: 'accounting',
    label: 'mod.accounting',
    description: 'mod.accounting.desc',
    home: '/accounting',
    group: 'finance',
    match: ['/accounting', '/app/accounting'],
    menu: moduleMenus.accounting ?? [],
  },
  {
    id: 'hr',
    label: 'mod.hr',
    description: 'mod.hr.desc',
    home: '/hr',
    group: 'people',
    match: ['/hr', '/app/hr'],
    menu: moduleMenus.hr ?? [],
  },
  {
    id: 'contacts',
    label: 'mod.contacts',
    description: 'mod.contacts.desc',
    home: '/contacts',
    group: 'sell',
    match: ['/contacts', '/app/contacts'],
    menu: moduleMenus.contacts ?? [],
  },
  {
    id: 'payroll',
    label: 'mod.payroll',
    description: 'mod.payroll.desc',
    home: '/hr/payroll',
    group: 'people',
    match: ['/hr/payroll', '/app/payroll'],
    menu: moduleMenus.payroll ?? [],
  },
  {
    id: 'expenses',
    label: 'mod.expenses',
    description: 'mod.expenses.desc',
    home: '/hr/expenses',
    group: 'people',
    match: ['/hr/expenses', '/app/expenses'],
    menu: moduleMenus.expenses ?? [],
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
  const current = new URLSearchParams(search)
  if (query) {
    if (pathname !== path) return false
    const wanted = new URLSearchParams(query)
    for (const [key, value] of wanted) {
      if (current.get(key) !== value) return false
    }
    return true
  }
  if (path === '/orders') return pathname === '/orders' && !current.get('state')
  if (path === '/purchases') return pathname === '/purchases' && !current.get('state')
  if (path === '/hr') return pathname === '/hr' || /^\/hr\/\d+/.test(pathname)
  if (path === '/inventory') return pathname === '/inventory'
  if (path === '/pos') return pathname === '/pos' || pathname.startsWith('/pos/sessions')
  if (path === '/accounting') return (pathname === '/accounting' && !current.get('moveType')) || /^\/accounting\/\d+/.test(pathname)
  if (path === '/accounting/reports') return pathname === '/accounting/reports' && !current.get('view')
  if (path === '/crm') return pathname === '/crm' || /^\/crm\/\d+/.test(pathname)
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function sectionForPath(mod: AppModule, pathname: string, search: string): MenuLink | null {
  const links = mod.menu.flatMap((entry) => entry.children ?? (entry.to ? [{ label: entry.label, to: entry.to }] : []))
  return links.find((link) => linkActive(link.to, pathname, search)) ?? links[0] ?? null
}
