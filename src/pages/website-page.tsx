import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { orderStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { Product, SalesOrder } from '../lib/types.ts'

export function WebsitePage() {
  const { t } = useI18n()
  const money = useMoney()
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const orders = useQuery({ queryKey: ['orders', 'all'], queryFn: () => api<SalesOrder[]>('/api/orders?state=all') })
  const published = products.data?.filter((product) => product.websitePublished) ?? []
  const shopOrders = orders.data?.filter((order) => order.origin === 'shop') ?? []
  const waiting = (products.isPending && !products.data) || (orders.isPending && !orders.data)

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('web.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('web.lead')}</p>
        </div>
        <a href="/shop"><Button>{t('web.open')}</Button></a>
      </div>
      {waiting ? <div className="h-24 animate-pulse rounded-lg bg-secondary/70" /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('web.published')}</p>
          <p className="font-serif text-3xl">{published.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">{t('web.orders')}</p>
          <p className="font-serif text-3xl">{shopOrders.length}</p>
        </div>
      </div>
      {shopOrders.length === 0 && !waiting ? <EmptyState title={t('orders.emptyTitle')} body={t('web.lead')} action={{ to: '/shop', label: t('web.open') }} /> : null}
      {shopOrders.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {shopOrders.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/orders/${order.id}`}>{order.name}</Link>
                  </td>
                  <td className="px-4 py-3">{order.customer.name}</td>
                  <td className="px-4 py-3"><Badge tone={order.state}>{orderStateLabel(order.state, t)}</Badge></td>
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
