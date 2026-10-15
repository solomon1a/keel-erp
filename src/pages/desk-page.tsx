import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { orderStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { SalesOrder } from '../lib/types.ts'

type Desk = {
  contactCount: number
  productCount: number
  openOrders: number
  recentOrders: Array<SalesOrder & { customer: { name: string } }>
  lowStock: Array<{ id: number; name: string; sku: string; onHand: number }>
}

export function DeskPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const desk = useQuery({ queryKey: ['desk'], queryFn: () => api<Desk>('/api/desk') })
  if (desk.isLoading) return <p className="text-sm text-muted-foreground">{t('desk.loading')}</p>
  if (desk.isError) return <p className="text-sm text-destructive">{desk.error.message}</p>
  const data = desk.data
  if (!data) return null

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('desk.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('desk.lead')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('desk.contacts')} value={String(data.contactCount)} />
        <Stat label={t('desk.products')} value={String(data.productCount)} />
        <Stat label={t('desk.openOrders')} value={String(data.openOrders)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="rounded-lg border border-border bg-card">
          <header className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="font-serif text-2xl">{t('desk.recent')}</h2>
            <Link className="text-sm font-semibold text-primary" to="/orders">
              {t('desk.allOrders')}
            </Link>
          </header>
          {data.recentOrders.length === 0 ? (
            <div className="p-4">
              <EmptyState title={t('desk.emptyTitle')} body={t('desk.emptyBody')} />
            </div>
          ) : (
            <ul>
              {data.recentOrders.map((order) => (
                <li key={order.id} className="border-b border-border last:border-0">
                  <Link className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-secondary/50" to={`/orders/${order.id}`}>
                    <span>
                      <span className="font-semibold">{order.name}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {order.customer.name} · {shortDate(order.dateOrder)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3">
                      <Badge tone={order.state}>{orderStateLabel(order.state, t)}</Badge>
                      <span className="text-sm font-semibold">{money(order.amountTotal)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-serif text-2xl">{t('desk.low')}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{t('desk.lowLead')}</p>
          {data.lowStock.length === 0 ? (
            <p className="mt-4 text-sm">{t('desk.comfortable')}</p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {data.lowStock.map((item) => (
                <li key={item.id} className="flex items-baseline justify-between gap-3">
                  <Link className="font-medium hover:underline" to={`/products/${item.id}`}>
                    {item.name}
                  </Link>
                  <span className="text-sm text-destructive">{t('desk.onHand', { count: item.onHand })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-serif text-3xl">{value}</p>
    </div>
  )
}
