import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { locationLabel, moveStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useShortDate } from '../lib/format.ts'
import type { StockMove } from '../lib/types.ts'

type StockResponse = {
  levels: Array<{ id: number; name: string; sku: string; active: boolean; onHand: number }>
  moves: StockMove[]
}

export function InventoryPage() {
  const { t } = useI18n()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const stock = useQuery({ queryKey: ['stock'], queryFn: () => api<StockResponse>('/api/stock') })
  const [productId, setProductId] = useState('')
  const [quantityDelta, setQuantityDelta] = useState('1')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const adjust = useMutation({
    mutationFn: () =>
      api('/api/stock/adjust', {
        method: 'POST',
        body: JSON.stringify({
          productId: Number(productId),
          quantityDelta: Number(quantityDelta),
          note: note || t('stock.noteDefault'),
        }),
      }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['stock'] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['desk'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('stock.failed')),
  })

  if (stock.isLoading) return <p className="text-sm text-muted-foreground">{t('stock.loading')}</p>
  if (stock.isError) return <p className="text-sm text-destructive">{stock.error.message}</p>
  const data = stock.data
  if (!data) return null

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('stock.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('stock.lead')}</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('stock.goods')}</th>
                <th className="px-4 py-3 font-medium">{t('stock.sku')}</th>
                <th className="px-4 py-3 font-medium">{t('stock.onHand')}</th>
              </tr>
            </thead>
            <tbody>
              {data.levels.map((level) => (
                <tr key={level.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/products/${level.id}`}>{level.name}</Link>
                    {level.active ? null : <span className="ml-2 text-muted-foreground">{t('common.archived')}</span>}
                  </td>
                  <td className="px-4 py-3">{level.sku}</td>
                  <td className={level.onHand < 5 ? 'px-4 py-3 font-semibold text-destructive' : 'px-4 py-3'}>{level.onHand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="grid content-start gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError('')
            adjust.mutate()
          }}
        >
          <h2 className="font-serif text-2xl">{t('stock.adjust')}</h2>
          {error ? <Notice message={error} /> : null}
          <Field label={t('stock.product')}>
            <select className="h-10 rounded-md border border-border bg-background px-3" value={productId} onChange={(event) => setProductId(event.target.value)} required>
              <option value="">{t('stock.choose')}</option>
              {data.levels.filter((level) => level.active).map((level) => (
                <option key={level.id} value={level.id}>{level.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('stock.delta')} hint={t('stock.deltaHint')}>
            <Input type="number" step="0.001" value={quantityDelta} onChange={(event) => setQuantityDelta(event.target.value)} />
          </Field>
          <Field label={t('stock.note')}>
            <Input placeholder={t('stock.noteDefault')} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <Button type="submit" disabled={adjust.isPending}>{adjust.isPending ? t('common.saving') : t('stock.post')}</Button>
        </form>
      </div>
      <section>
        <h2 className="font-serif text-2xl">{t('stock.recent')}</h2>
        {data.moves.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('stock.none')}</p> : (
          <ul className="mt-3 grid gap-2 text-sm">
            {data.moves.map((move) => (
              <li key={move.id} className="rounded-md border border-border bg-card px-3 py-2">
                <span className="font-medium">{move.product.name}</span> · {move.quantity} · {locationLabel(move.locationFrom.type, move.locationFrom.name, t)} → {locationLabel(move.locationTo.type, move.locationTo.name, t)}
                <span className="block text-muted-foreground">{move.reference} · {moveStateLabel(move.state, t)} · {shortDate(move.date)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
