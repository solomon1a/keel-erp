import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { locationChoices } from '../components/warehouse-field.tsx'
import { locationLabel, moveStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useShortDate } from '../lib/format.ts'
import type { Product, StockMove, Warehouse } from '../lib/types.ts'

export function MovesPage() {
  const { t } = useI18n()
  const shortDate = useShortDate()
  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const moves = useQuery({
    queryKey: ['moves', productId, locationId],
    queryFn: () => {
      const params = new URLSearchParams()
      if (productId) params.set('productId', productId)
      if (locationId) params.set('locationId', locationId)
      const query = params.toString()
      return api<StockMove[]>(`/api/stock/moves${query ? `?${query}` : ''}`)
    },
  })

  const goods = products.data?.filter((product) => product.type === 'product') ?? []
  const locations = locationChoices(warehouses.data)

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('ledger.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('ledger.lead')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t('ledger.product')}</span>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">{t('ledger.all')}</option>
            {goods.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t('ledger.location')}</span>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={locationId} onChange={(event) => setLocationId(event.target.value)}>
            <option value="">{t('ledger.all')}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.label}</option>
            ))}
          </select>
        </label>
      </div>
      {moves.isLoading ? <p className="text-sm text-muted-foreground">{t('ledger.loading')}</p> : null}
      {moves.isError ? <p className="text-sm text-destructive">{moves.error.message}</p> : null}
      {moves.data && moves.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('ledger.empty')}</p> : null}
      {moves.data && moves.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('ledger.date')}</th>
                <th className="px-4 py-3 font-medium">{t('ledger.product')}</th>
                <th className="px-4 py-3 font-medium">{t('ledger.qty')}</th>
                <th className="px-4 py-3 font-medium">{t('ledger.from')}</th>
                <th className="px-4 py-3 font-medium">{t('ledger.to')}</th>
                <th className="px-4 py-3 font-medium">{t('ledger.lot')}</th>
                <th className="px-4 py-3 font-medium">{t('ledger.reference')}</th>
              </tr>
            </thead>
            <tbody>
              {moves.data.map((move) => (
                <tr key={move.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{shortDate(move.date)}</td>
                  <td className="px-4 py-3">{move.product.name}</td>
                  <td className="px-4 py-3">{move.quantity}</td>
                  <td className="px-4 py-3">{locationLabel(move.locationFrom.type, move.locationFrom.name, t)}</td>
                  <td className="px-4 py-3">{locationLabel(move.locationTo.type, move.locationTo.name, t)}</td>
                  <td className="px-4 py-3">{move.lotName || '—'}</td>
                  <td className="px-4 py-3">
                    {move.reference}
                    <span className="block text-muted-foreground">{moveStateLabel(move.state, t)}</span>
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
