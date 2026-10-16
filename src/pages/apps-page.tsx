import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import { modulesInGroup } from '../lib/modules.ts'

type Desk = {
  openOrders: number
  pipelineCount: number
  shopOrders: number
  staff: number
  lowStock: unknown[]
  productCount: number
}

const groupKeys = {
  overview: 'apps.group.overview',
  sell: 'apps.group.sell',
  supply: 'apps.group.supply',
  finance: 'apps.group.finance',
  people: 'apps.group.people',
} as const satisfies Record<string, MessageKey>

export function AppsPage() {
  const { t } = useI18n()
  const desk = useQuery({ queryKey: ['desk'], queryFn: () => api<Desk>('/api/desk') })
  const purchases = useQuery({ queryKey: ['purchases', 'all'], queryFn: () => api<unknown[]>('/api/purchases?state=all') })
  const manufacturing = useQuery({ queryKey: ['manufacturing', 'all'], queryFn: () => api<unknown[]>('/api/manufacturing?state=all') })
  const sessions = useQuery({ queryKey: ['pos-sessions'], queryFn: () => api<unknown[]>('/api/pos/sessions') })
  const invoices = useQuery({ queryKey: ['invoices', ''], queryFn: () => api<unknown[]>('/api/invoices') })

  function badge(id: string) {
    switch (id) {
      case 'dashboard':
        return desk.data ? String(desk.data.openOrders) : null
      case 'sales':
        return desk.data ? String(desk.data.openOrders) : null
      case 'crm':
        return desk.data ? String(desk.data.pipelineCount) : null
      case 'purchase':
        return purchases.data ? String(purchases.data.length) : null
      case 'inventory':
        return desk.data ? String(desk.data.lowStock.length) : null
      case 'manufacturing':
        return manufacturing.data ? String(manufacturing.data.length) : null
      case 'pos':
        return sessions.data ? String(sessions.data.length) : null
      case 'website':
        return desk.data ? String(desk.data.shopOrders) : null
      case 'accounting':
        return invoices.data ? String(invoices.data.length) : null
      case 'hr':
        return desk.data ? String(desk.data.staff) : null
      default:
        return null
    }
  }

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('apps.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('apps.lead')}</p>
      </div>
      {(['overview', 'sell', 'supply', 'finance', 'people'] as const).map((group) => (
        <section key={group} className="grid gap-3">
          <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{t(groupKeys[group])}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {modulesInGroup(group).map((mod) => {
              const count = badge(mod.id)
              const Icon = mod.icon
              return (
                <Link
                  key={mod.id}
                  to={mod.home}
                  className="group relative rounded-lg border border-border bg-card p-4 transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm"
                >
                  {count !== null ? (
                    <span className="absolute top-3 right-3 rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                      {count}
                    </span>
                  ) : (
                    <span className="absolute top-3 right-3 h-5 w-8 animate-pulse rounded-full bg-secondary" />
                  )}
                  <Icon className="size-6 text-primary" />
                  <p className="mt-3 font-serif text-2xl">{t(mod.label)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t(mod.description)}</p>
                </Link>
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}
