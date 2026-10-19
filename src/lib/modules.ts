import type { MessageKey } from '../i18n/messages.ts'
import { menuHasLinks, visibleEntries } from './live-links.ts'
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
    match: ['/orders', '/products', '/app/sales', '/sales'],
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
    id: 'sites',
    label: 'mod.sites',
    description: 'mod.sites.desc',
    home: '/sites',
    group: 'sell',
    match: ['/sites'],
    menu: moduleMenus.sites ?? [],
  },
  {
    id: 'email',
    label: 'mod.email',
    description: 'mod.email.desc',
    home: '/email',
    group: 'sell',
    match: ['/email', '/app/email'],
    menu: moduleMenus.email ?? [],
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
    id: 'attendance',
    label: 'mod.attendance',
    description: 'mod.attendance.desc',
    home: '/app/attendance/check-in',
    group: 'people',
    match: ['/app/attendance', '/hr/attendance'],
    menu: moduleMenus.attendance ?? [],
  },
  {
    id: 'wastage',
    label: 'mod.wastage',
    description: 'mod.wastage.desc',
    home: '/app/wastage/records',
    group: 'supply',
    match: ['/app/wastage', '/manufacturing/wastage'],
    menu: moduleMenus.wastage ?? [],
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
  {
    id: 'assets',
    label: 'mod.assets',
    description: 'mod.assets.desc',
    home: '/app/assets/register',
    group: 'finance',
    match: ['/app/assets', '/assets'],
    menu: moduleMenus.assets ?? [],
  },
  {
    id: 'projects',
    label: 'mod.projects',
    description: 'mod.projects.desc',
    home: '/app/projects/projects',
    group: 'supply',
    match: ['/app/projects', '/projects'],
    menu: moduleMenus.projects ?? [],
  },
  {
    id: 'quality',
    label: 'mod.quality',
    description: 'mod.quality.desc',
    home: '/app/quality/inspections',
    group: 'supply',
    match: ['/app/quality', '/quality'],
    menu: moduleMenus.quality ?? [],
  },
  {
    id: 'subcontracting',
    label: 'mod.subcontracting',
    description: 'mod.subcontracting.desc',
    home: '/app/subcontracting/orders',
    group: 'supply',
    match: ['/app/subcontracting', '/subcontracting'],
    menu: moduleMenus.subcontracting ?? [],
  },
  {
    id: 'helpdesk',
    label: 'mod.helpdesk',
    description: 'mod.helpdesk.desc',
    home: '/app/helpdesk/tickets',
    group: 'sell',
    match: ['/app/helpdesk', '/helpdesk'],
    menu: moduleMenus.helpdesk ?? [],
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
  'wastage',
  'quality',
  'subcontracting',
  'pos',
  'website',
  'sites',
  'email',
  'accounting',
  'assets',
  'expenses',
  'hr',
  'attendance',
  'payroll',
  'projects',
  'helpdesk',
]

for (const mod of appModules) {
  mod.home = `/go/${mod.id}`
  mod.menu = visibleEntries(mod.menu)
  if (!mod.match.includes(mod.home)) mod.match.push(mod.home)
}

export function launcherModules() {
  return [...appModules]
    .filter((mod) => menuHasLinks(mod.menu))
    .sort((a, b) => launcherOrder.indexOf(a.id) - launcherOrder.indexOf(b.id))
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
  if (path === '/hr') return pathname === '/hr' || /^\/hr\/\d+$/.test(pathname)
  if (path === '/hr/attendance') return pathname === '/hr/attendance'
  if (path === '/hr/leave') return pathname === '/hr/leave' && !current.get('view') && !current.get('state')
  if (path === '/inventory') return pathname === '/inventory'
  if (path === '/pos') return pathname === '/pos' || pathname.startsWith('/pos/sessions')
  if (path === '/accounting') return (pathname === '/accounting' && !current.get('moveType')) || /^\/accounting\/\d+/.test(pathname)
  if (path === '/accounting/reports') return pathname === '/accounting/reports' && !current.get('view')
  if (path === '/projects') return (pathname === '/projects' || /^\/projects\/\d+/.test(pathname)) && !current.get('view')
  if (path === '/helpdesk') return (pathname === '/helpdesk' || /^\/helpdesk\/\d+$/.test(pathname)) && !current.get('view')
  if (path === '/crm') return pathname === '/crm' || /^\/crm\/\d+/.test(pathname)
  return pathname === path || pathname.startsWith(`${path}/`)
}

export function sectionForPath(mod: AppModule, pathname: string, search: string): MenuLink | null {
  if (pathname === `/go/${mod.id}`) return null
  if (pathname.startsWith(`/go/${mod.id}/`)) {
    const segment = decodeURIComponent(pathname.slice(`/go/${mod.id}/`.length).split('/')[0] ?? '')
    const entry = mod.menu.find((item) => item.label === segment)
    if (!entry) return null
    const label = entry.label === 'menu.reporting' ? 'hub.reports' : entry.label
    return { label, to: pathname }
  }
  const links = mod.menu.flatMap((entry) => entry.children ?? (entry.to ? [{ label: entry.label, to: entry.to }] : []))
  return links.find((link) => linkActive(link.to, pathname, search)) ?? links[0] ?? null
}
