import type { CSSProperties } from 'react'
import { cn } from '../lib/utils.ts'

const files = import.meta.glob('./icons/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const iconNames = [
  'accounting',
  'contacts',
  'crm',
  'dashboard',
  'ecommerce',
  'expenses',
  'hr',
  'inventory',
  'manufacturing',
  'payroll',
  'pos',
  'purchase',
  'sales',
  'assets',
  'projects',
  'quality',
  'subcontracting',
  'helpdesk',
] as const

export type ModuleIconId = (typeof iconNames)[number]

const icons = Object.fromEntries(iconNames.map((name) => [name, files[`./icons/${name}.svg`] ?? ''])) as Record<ModuleIconId, string>

const menuIcons: Record<string, ModuleIconId> = {
  'mod.dashboard': 'dashboard',
  'mod.contacts': 'contacts',
  'mod.payroll': 'payroll',
  'mod.expenses': 'expenses',
  'menu.orders': 'sales',
  'menu.quotations': 'sales',
  'menu.customers': 'contacts',
  'menu.products': 'inventory',
  'menu.pipeline': 'crm',
  'menu.rfq': 'purchase',
  'menu.vendors': 'purchase',
  'menu.onHand': 'inventory',
  'menu.transfers': 'inventory',
  'menu.warehouses': 'inventory',
  'menu.moves': 'inventory',
  'menu.replenish': 'inventory',
  'menu.operations': 'inventory',
  'menu.reporting': 'inventory',
  'menu.mo': 'manufacturing',
  'menu.boms': 'manufacturing',
  'menu.sessions': 'pos',
  'menu.posOrders': 'pos',
  'menu.daily': 'pos',
  'menu.storefront': 'ecommerce',
  'menu.websiteHome': 'ecommerce',
  'menu.invoices': 'accounting',
  'menu.ledger': 'accounting',
  'menu.reports': 'accounting',
  'menu.employees': 'hr',
  'menu.payroll': 'payroll',
  'menu.expenses': 'expenses',
  'mod.assets': 'assets',
  'mod.projects': 'projects',
  'mod.quality': 'quality',
  'mod.subcontracting': 'subcontracting',
  'mod.helpdesk': 'helpdesk',
}

const accents: Record<string, string> = {
  dashboard: 'var(--kl-color-module-dashboard)',
  sales: 'var(--kl-color-module-sales)',
  crm: 'var(--kl-color-module-crm)',
  purchase: 'var(--kl-color-module-purchase)',
  inventory: 'var(--kl-color-module-inventory)',
  manufacturing: 'var(--kl-color-module-manufacturing)',
  pos: 'var(--kl-color-module-pos)',
  website: 'var(--kl-color-module-ecommerce)',
  accounting: 'var(--kl-color-module-accounting)',
  hr: 'var(--kl-color-module-hr)',
  contacts: 'var(--kl-color-module-contacts)',
  payroll: 'var(--kl-color-module-payroll)',
  expenses: 'var(--kl-color-module-expenses)',
  assets: 'var(--kl-color-module-assets)',
  projects: 'var(--kl-color-module-projects)',
  quality: 'var(--kl-color-module-quality)',
  subcontracting: 'var(--kl-color-module-subcontracting)',
  helpdesk: 'var(--kl-color-module-helpdesk)',
}

export function moduleIconId(moduleId: string): ModuleIconId {
  if (moduleId === 'website') return 'ecommerce'
  if (iconNames.some((name) => name === moduleId)) return moduleId as ModuleIconId
  return 'dashboard'
}

export function menuIconId(label: string): ModuleIconId | null {
  return menuIcons[label] ?? null
}

export function moduleAccent(moduleId: string) {
  return accents[moduleId] ?? 'var(--kl-color-module-dashboard)'
}

export function ModuleIcon({ id, className, style }: { id: ModuleIconId; className?: string; style?: CSSProperties }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block shrink-0 [&>svg]:block [&>svg]:h-full [&>svg]:w-full', className)}
      style={style}
      dangerouslySetInnerHTML={{ __html: icons[id] }}
    />
  )
}
