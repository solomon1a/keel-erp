import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { manufacturingStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import type { ManufacturingOrder } from '../lib/types.ts'

const filters = [
  ['all', 'manufacturing.filterAll'],
  ['draft', 'manufacturing.filterDraft'],
  ['confirmed', 'manufacturing.filterConfirmed'],
  ['progress', 'manufacturing.filterProgress'],
  ['done', 'manufacturing.filterDone'],
  ['cancel', 'manufacturing.filterCancel'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

export function ManufacturingPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const state = params.get('state') ?? 'all'
  const setState = (value: string) => {
    const next = new URLSearchParams(params)
    if (value === 'all') next.delete('state')
    else next.set('state', value)
    setParams(next, { replace: true })
  }
  const orders = useQuery({
    queryKey: ['manufacturing', state],
    queryFn: () => api<ManufacturingOrder[]>(`/api/manufacturing?state=${state}`),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('manufacturing.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('manufacturing.lead')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/boms"><Button variant="outline">{t('manufacturing.boms')}</Button></Link>
          <Link to="/manufacturing/new"><Button>{t('manufacturing.new')}</Button></Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Button key={value} size="sm" variant={state === value ? 'secondary' : 'outline'} onClick={() => setState(value)}>
            {t(label)}
          </Button>
        ))}
      </div>
      {orders.isLoading ? <p className="text-sm text-muted-foreground">{t('manufacturing.loading')}</p> : null}
      {orders.isError ? <p className="text-sm text-destructive">{orders.error.message}</p> : null}
      {orders.data && orders.data.length === 0 ? (
        <EmptyState title={t('manufacturing.emptyTitle')} body={t('manufacturing.emptyBody')} />
      ) : null}
      {orders.data && orders.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('manufacturing.colNumber')}</th>
                <th className="px-4 py-3 font-medium">{t('manufacturing.colProduct')}</th>
                <th className="px-4 py-3 font-medium">{t('manufacturing.colState')}</th>
                <th className="px-4 py-3 font-medium">{t('manufacturing.colQty')}</th>
                <th className="px-4 py-3 font-medium">{t('manufacturing.colDone')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/manufacturing/${order.id}`}>{order.name}</Link>
                  </td>
                  <td className="px-4 py-3">{order.product.name}</td>
                  <td className="px-4 py-3"><Badge tone={order.state}>{manufacturingStateLabel(order.state, t)}</Badge></td>
                  <td className="px-4 py-3">{order.quantity}</td>
                  <td className="px-4 py-3">{order.quantityDone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
