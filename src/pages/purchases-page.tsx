import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { purchaseStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { PurchaseOrder } from '../lib/types.ts'

const filters = [
  ['all', 'purchases.filterAll'],
  ['draft', 'purchases.filterDraft'],
  ['sent', 'purchases.filterSent'],
  ['purchase', 'purchases.filterPurchase'],
  ['done', 'purchases.filterDone'],
  ['cancel', 'purchases.filterCancel'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

export function PurchasesPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const navigate = useNavigate()
  const [state, setState] = useState('all')
  const orders = useQuery({
    queryKey: ['purchases', state],
    queryFn: () => api<PurchaseOrder[]>(`/api/purchases?state=${state}`),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('purchases.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('purchases.lead')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/vendors"><Button variant="outline">{t('purchases.vendors')}</Button></Link>
          <Link to="/purchases/new"><Button>{t('purchases.new')}</Button></Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Button key={value} size="sm" variant={state === value ? 'default' : 'outline'} onClick={() => setState(value)}>
            {t(label)}
          </Button>
        ))}
      </div>
      {orders.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {orders.isError ? <p className="text-sm text-destructive">{orders.error.message}</p> : null}
      {orders.data && orders.data.length === 0 ? (
        <EmptyState title={t('purchases.emptyTitle')} body={t('purchases.emptyBody')} action={{ to: '/purchases/new', label: t('purchases.new') }} />
      ) : null}
      {orders.data && orders.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('purchases.colNumber')}</th>
                <th className="px-4 py-3 font-medium">{t('purchases.colVendor')}</th>
                <th className="px-4 py-3 font-medium">{t('purchases.colState')}</th>
                <th className="px-4 py-3 font-medium">{t('purchases.colDate')}</th>
                <th className="px-4 py-3 font-medium">{t('purchases.colTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order) => (
                <tr key={order.id} className="record-row border-b border-border last:border-0" onClick={() => navigate(`/purchases/${order.id}`)}>
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/purchases/${order.id}`}>{order.name}</Link>
                  </td>
                  <td className="px-4 py-3">{order.vendor.name}</td>
                  <td className="px-4 py-3"><Badge tone={order.state}>{purchaseStateLabel(order.state, t)}</Badge></td>
                  <td className="px-4 py-3">{shortDate(order.dateOrder)}</td>
                  <td className="px-4 py-3">{money(order.amountTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
