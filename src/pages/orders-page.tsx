import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { orderStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { SalesOrder } from '../lib/types.ts'

const filters = [
  ['all', 'orders.filterAll'],
  ['draft', 'orders.filterDraft'],
  ['sent', 'orders.filterSent'],
  ['sale', 'orders.filterSale'],
  ['done', 'orders.filterDone'],
  ['cancel', 'orders.filterCancel'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

export function OrdersPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [state, setState] = useState('all')
  const orders = useQuery({
    queryKey: ['orders', state],
    queryFn: () => api<SalesOrder[]>(`/api/orders?state=${state}`),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('orders.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('orders.lead')}</p>
        </div>
        <Link to="/orders/new"><Button>{t('orders.new')}</Button></Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Button key={value} size="sm" variant={state === value ? 'default' : 'outline'} onClick={() => setState(value)}>
            {t(label)}
          </Button>
        ))}
      </div>
      {orders.isLoading ? <p className="text-sm text-muted-foreground">{t('orders.loading')}</p> : null}
      {orders.isError ? <p className="text-sm text-destructive">{orders.error.message}</p> : null}
      {orders.data && orders.data.length === 0 ? (
        <EmptyState title={t('orders.emptyTitle')} body={t('orders.emptyBody')} />
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('orders.colNumber')}</th>
              <th className="px-4 py-3 font-medium">{t('orders.colCustomer')}</th>
              <th className="px-4 py-3 font-medium">{t('orders.colState')}</th>
              <th className="px-4 py-3 font-medium">{t('orders.colDate')}</th>
              <th className="px-4 py-3 font-medium">{t('orders.colTotal')}</th>
            </tr>
          </thead>
          <tbody>
            {orders.data?.map((order) => (
              <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link className="font-semibold hover:underline" to={`/orders/${order.id}`}>{order.name}</Link>
                </td>
                <td className="px-4 py-3">{order.customer.name}</td>
                <td className="px-4 py-3"><Badge tone={order.state}>{orderStateLabel(order.state, t)}</Badge></td>
                <td className="px-4 py-3">{shortDate(order.dateOrder)}</td>
                <td className="px-4 py-3">{money(order.amountTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
