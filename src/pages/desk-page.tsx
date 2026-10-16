import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { BarChart } from '../components/bar-chart.tsx'
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
  pipelineValue: number
  pipelineCount: number
  receivable: number
  payable: number
  shopOrders: number
  staff: number
  leaveWaiting: number
  profit: number
  vatPayable: number
}

export function DeskPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const desk = useQuery({ queryKey: ['desk'], queryFn: () => api<Desk>('/api/desk') })
  const data = desk.data

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('desk.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('desk.lead')}</p>
      </div>
      {desk.isPending && !data ? <div className="h-40 animate-pulse rounded-lg bg-secondary/70" /> : null}
      {desk.isError ? <p className="text-sm text-destructive">{desk.error.message}</p> : null}
      {data ? (
      <>
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 font-serif text-2xl">{t('chart.title')}</h2>
        <BarChart
          rows={[
            { label: t('desk.openOrders'), value: data.openOrders, display: String(data.openOrders) },
            { label: t('desk.pipeline'), value: data.pipelineCount, display: money(data.pipelineValue) },
            { label: t('desk.shopOrders'), value: data.shopOrders, display: String(data.shopOrders) },
            { label: t('desk.staff'), value: data.staff, display: String(data.staff) },
            { label: t('desk.low'), value: data.lowStock.length, display: String(data.lowStock.length) },
          ]}
        />
      </section>
      <div className="grid gap-3 grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('desk.openOrders')} value={String(data.openOrders)} to="/orders" />
        <Stat label={t('desk.pipeline')} value={money(data.pipelineValue)} hint={t('desk.pipelineCount', { count: data.pipelineCount })} to="/crm" />
        <Stat label={t('desk.receivable')} value={money(data.receivable)} to="/accounting" />
        <Stat label={t('desk.payable')} value={money(data.payable)} to="/accounting" />
        <Stat label={t('desk.shopOrders')} value={String(data.shopOrders)} to="/website" />
        <Stat label={t('desk.profit')} value={money(data.profit)} to="/accounting/reports" />
        <Stat label={t('desk.vat')} value={money(data.vatPayable)} to="/accounting/reports" />
        <Stat label={t('desk.staff')} value={String(data.staff)} hint={t('desk.leaveCount', { count: data.leaveWaiting })} to="/hr" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t('desk.contacts')} value={String(data.contactCount)} to="/contacts" />
        <Stat label={t('desk.products')} value={String(data.productCount)} to="/products" />
        <Stat label={t('desk.low')} value={String(data.lowStock.length)} to="/inventory" />
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
      </>
      ) : null}
    </div>
  )
}

function Stat({ label, value, hint, to }: { label: string; value: string; hint?: string; to?: string }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-serif text-3xl">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  )
  const className = 'rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/40'
  if (!to) return <div className={className}>{body}</div>
  return (
    <Link className={className} to={to}>
      {body}
    </Link>
  )
}
