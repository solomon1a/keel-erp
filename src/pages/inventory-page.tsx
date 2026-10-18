import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExportButton } from '../components/export-button.tsx'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { locationChoices } from '../components/warehouse-field.tsx'
import { locationLabel, moveStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { Product, StockMove, Warehouse } from '../lib/types.ts'

type StockLevel = {
  productId: number
  name: string
  sku: string
  costPrice: number
  tracking: string
  locationId: number
  locationName: string
  warehouseId: number | null
  warehouseName: string
  onHand: number
  value: number
}

type StockResponse = {
  levels: StockLevel[]
  valuation: number
}

export function InventoryPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api<StockResponse>('/api/stock') })
  const moves = useQuery({ queryKey: ['moves', 'recent'], queryFn: () => api<StockMove[]>('/api/stock/moves') })
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const [productId, setProductId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [quantityDelta, setQuantityDelta] = useState('1')
  const [lotName, setLotName] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const goods = products.data?.filter((product) => product.active && product.type === 'product') ?? []
  const selected = goods.find((product) => product.id === Number(productId))
  const locations = locationChoices(warehouses.data)

  useEffect(() => {
    if (locationId || !warehouses.data) return
    const choices = locationChoices(warehouses.data)
    const preferred = choices.find((location) => location.isDefault) ?? choices[0]
    if (preferred) setLocationId(String(preferred.id))
  }, [locationId, warehouses.data])

  const adjust = useMutation({
    mutationFn: () =>
      api('/api/stock/adjust', {
        method: 'POST',
        body: JSON.stringify({
          productId: Number(productId),
          locationId: Number(locationId),
          quantityDelta: Number(quantityDelta),
          note: note || t('stock.noteDefault'),
          ...(selected && selected.tracking !== 'none' ? { lotName } : {}),
        }),
      }),
    onSuccess: async () => {
      setError('')
      setLotName('')
      await queryClient.invalidateQueries({ queryKey: ['stock'] })
      await queryClient.invalidateQueries({ queryKey: ['moves'] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['replenish'] })
      await queryClient.invalidateQueries({ queryKey: ['desk'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('stock.failed')),
  })

  if (stock.isLoading) return <p className="text-sm text-muted-foreground">{t('stock.loading')}</p>
  if (stock.isError) return <p className="text-sm text-destructive">{stock.error.message}</p>
  const data = stock.data
  if (!data) return null
  const recent = (moves.data ?? []).slice(0, 8)

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('stock.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('stock.lead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="stock" />
          <Link to="/inventory/warehouses"><Button variant="outline">{t('stock.warehousesLink')}</Button></Link>
          <Link to="/inventory/transfers"><Button variant="outline">{t('stock.transfersLink')}</Button></Link>
          <Link to="/inventory/replenish"><Button variant="outline">{t('stock.replenishLink')}</Button></Link>
          <Link to="/inventory/moves"><Button variant="outline">{t('stock.movesLink')}</Button></Link>
        </div>
      </div>
      <p className="text-sm">
        <span className="text-muted-foreground">{t('stock.valuation')}</span>{' '}
        <span className="font-semibold">{money(data.valuation)}</span>
      </p>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          {data.levels.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t('stock.empty')}</p>
          ) : (
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('stock.goods')}</th>
                  <th className="px-4 py-3 font-medium">{t('stock.sku')}</th>
                  <th className="px-4 py-3 font-medium">{t('stock.warehouse')}</th>
                  <th className="px-4 py-3 font-medium">{t('stock.location')}</th>
                  <th className="px-4 py-3 font-medium">{t('stock.onHand')}</th>
                  <th className="px-4 py-3 font-medium">{t('stock.value')}</th>
                </tr>
              </thead>
              <tbody>
                {data.levels.map((level) => (
                  <tr key={`${level.productId}-${level.locationId}`} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link className="font-semibold hover:underline" to={`/products/${level.productId}`}>{level.name}</Link>
                    </td>
                    <td className="px-4 py-3">{level.sku}</td>
                    <td className="px-4 py-3">{level.warehouseName}</td>
                    <td className="px-4 py-3">{level.locationName}</td>
                    <td className={level.onHand < 5 ? 'px-4 py-3 font-semibold text-destructive' : 'px-4 py-3'}>{level.onHand}</td>
                    <td className="px-4 py-3">{money(level.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <form
          className="grid content-start gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError('')
            adjust.mutate()
          }}
        >
          <h2 className="font-serif text-2xl">{t('stock.count')}</h2>
          {error ? <Notice message={error} /> : null}
          <Field label={t('stock.product')}>
            <select
              className="h-10 rounded-md border border-border bg-background px-3"
              value={productId}
              onChange={(event) => {
                setProductId(event.target.value)
                setLotName('')
              }}
              required
            >
              <option value="">{t('stock.choose')}</option>
              {goods.map((product) => (
                <option key={product.id} value={product.id}>{product.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('stock.location')}>
            <select className="h-10 rounded-md border border-border bg-background px-3" value={locationId} onChange={(event) => setLocationId(event.target.value)} required>
              <option value="">{t('stock.chooseLocation')}</option>
              {locations.map((location) => (
                <option key={location.id} value={location.id}>{location.label}</option>
              ))}
            </select>
          </Field>
          <Field label={t('stock.delta')} hint={t('stock.deltaHint')}>
            <Input type="number" step="0.001" value={quantityDelta} onChange={(event) => setQuantityDelta(event.target.value)} />
          </Field>
          {selected && selected.tracking !== 'none' ? (
            <Field label={t('stock.lot')}>
              <Input value={lotName} onChange={(event) => setLotName(event.target.value)} required />
            </Field>
          ) : null}
          <Field label={t('stock.note')}>
            <Input placeholder={t('stock.noteDefault')} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <Button type="submit" disabled={adjust.isPending}>{adjust.isPending ? t('common.saving') : t('stock.post')}</Button>
        </form>
      </div>
      <section>
        <div className="flex items-end justify-between gap-3">
          <h2 className="font-serif text-2xl">{t('stock.recent')}</h2>
          <Link className="text-sm underline" to="/inventory/moves">{t('stock.movesLink')}</Link>
        </div>
        {recent.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('stock.none')}</p> : (
          <ul className="mt-3 grid gap-2 text-sm">
            {recent.map((move) => (
              <li key={move.id} className="rounded-md border border-border bg-card px-3 py-2">
                <span className="font-medium">{move.product.name}</span> · {move.quantity} · {locationLabel(move.locationFrom.type, move.locationFrom.name, t)} → {locationLabel(move.locationTo.type, move.locationTo.name, t)}
                {move.lotName ? <span className="text-muted-foreground"> · {move.lotName}</span> : null}
                <span className="block text-muted-foreground">{move.reference} · {moveStateLabel(move.state, t)} · {shortDate(move.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
