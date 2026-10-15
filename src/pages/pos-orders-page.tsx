import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { posOrderLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { PosOrder, Warehouse } from '../lib/types.ts'

export function PosOrdersPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [warehouseId, setWarehouseId] = useState('')
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const orders = useQuery({
    queryKey: ['pos-orders', warehouseId],
    queryFn: () => api<PosOrder[]>(`/api/pos/orders${warehouseId ? `?warehouseId=${warehouseId}` : ''}`),
  })

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('pos.ordersTitle')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('pos.ordersLead')}</p>
      </div>
      <label className="grid max-w-xs gap-1 text-sm">
        <span className="text-muted-foreground">{t('pos.shop')}</span>
        <select className="h-10 rounded-md border border-border bg-card px-3" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)}>
          <option value="">{t('pos.all')}</option>
          {warehouses.data?.map((warehouse) => (
            <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
          ))}
        </select>
      </label>
      {orders.isLoading ? <p className="text-sm text-muted-foreground">{t('pos.loading')}</p> : null}
      {orders.isError ? <p className="text-sm text-destructive">{orders.error.message}</p> : null}
      {orders.data && orders.data.length === 0 ? <EmptyState title={t('pos.ordersTitle')} body={t('pos.noOrders')} /> : null}
      {orders.data && orders.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('pos.session')}</th>
                <th className="px-4 py-3 font-medium">{t('pos.shop')}</th>
                <th className="px-4 py-3 font-medium">{t('pos.customer')}</th>
                <th className="px-4 py-3 font-medium">{t('pos.total')}</th>
              </tr>
            </thead>
            <tbody>
              {orders.data.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/pos/orders/${order.id}`}>{order.name}</Link>
                    <span className="mt-1 block text-muted-foreground">{shortDate(order.createdAt)}</span>
                  </td>
                  <td className="px-4 py-3">{order.warehouse?.name}</td>
                  <td className="px-4 py-3">{order.customer?.name ?? t('pos.walkIn')}</td>
                  <td className="px-4 py-3">
                    {money(order.amountTotal)}
                    <span className="mt-1 block"><Badge tone={order.state}>{posOrderLabel(order.state, t)}</Badge></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
