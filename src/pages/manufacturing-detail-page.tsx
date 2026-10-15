import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { locationLabel, manufacturingStateLabel, moveStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { ManufacturingLine, ManufacturingOrder, User } from '../lib/types.ts'

function shortfall(line: ManufacturingLine) {
  const gap = line.quantity - line.consumed - (line.onHand ?? 0)
  return gap > 0.0001 ? Math.round(gap * 1000) / 1000 : 0
}

export function ManufacturingDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [error, setError] = useState('')
  const [produceQty, setProduceQty] = useState('')
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me') })
  const order = useQuery({ queryKey: ['manufacturing-order', id], queryFn: () => api<ManufacturingOrder>(`/api/manufacturing/${id}`) })

  useEffect(() => {
    if (!order.data) return
    const remaining = Math.round((order.data.quantity - order.data.quantityDone) * 1000) / 1000
    setProduceQty(String(remaining))
  }, [order.data])

  const refresh = async () => {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['manufacturing-order', id] })
    await queryClient.invalidateQueries({ queryKey: ['manufacturing'] })
    await queryClient.invalidateQueries({ queryKey: ['stock'] })
    await queryClient.invalidateQueries({ queryKey: ['products'] })
    await queryClient.invalidateQueries({ queryKey: ['desk'] })
  }

  const act = useMutation({
    mutationFn: (action: 'confirm' | 'start' | 'cancel') =>
      api<ManufacturingOrder>(`/api/manufacturing/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  const produce = useMutation({
    mutationFn: (body: { quantity?: number }) =>
      api<ManufacturingOrder>(`/api/manufacturing/${id}/produce`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('mo.loading')}</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  const row = order.data
  if (!row) return null
  const lines = row.lines ?? []
  const isAdmin = me.data?.role === 'admin'
  const remaining = Math.round((row.quantity - row.quantityDone) * 1000) / 1000
  const shortage = lines
    .filter((line) => line.product.purchasable && shortfall(line) > 0)
    .map((line) => `${line.productId}:${shortfall(line)}`)
    .join(',')

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
          <p className="mt-1">
            <Link className="font-medium hover:underline" to={`/boms/${row.bomId}`}>{row.product.name}</Link>
            <span className="text-muted-foreground"> · {row.product.sku}</span>
          </p>
          <p className="text-sm text-muted-foreground">{t('mo.produced')} {row.quantityDone} / {row.quantity}</p>
        </div>
        <Badge tone={row.state}>{manufacturingStateLabel(row.state, t)}</Badge>
      </div>
      {error ? <Notice message={error} /> : null}
      {row.state === 'draft' && !isAdmin ? <p className="text-sm text-muted-foreground">{t('mo.adminOnly')}</p> : null}
      <div className="flex flex-wrap gap-2">
        {row.state === 'draft' ? <Link to={`/manufacturing/${row.id}/edit`}><Button variant="outline">{t('mo.edit')}</Button></Link> : null}
        {row.state === 'draft' && isAdmin ? (
          <Button disabled={act.isPending} onClick={() => act.mutate('confirm')}>{t('mo.confirm')}</Button>
        ) : null}
        {row.state === 'confirmed' ? (
          <Button disabled={act.isPending} onClick={() => act.mutate('start')}>{t('mo.start')}</Button>
        ) : null}
        {row.state !== 'done' && row.state !== 'cancel' && row.quantityDone <= 0 ? (
          <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate('cancel')}>{t('mo.cancel')}</Button>
        ) : null}
        {shortage ? <Link to={`/purchases/new?need=${shortage}`}><Button variant="outline">{t('mo.draftRfq')}</Button></Link> : null}
        <Link to={`/manufacturing/${row.id}/print`} target="_blank"><Button variant="outline">{t('mo.print')}</Button></Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('mo.colComponent')}</th>
              <th className="px-4 py-3 font-medium">{t('mo.colNeed')}</th>
              <th className="px-4 py-3 font-medium">{t('mo.colOnHand')}</th>
              <th className="px-4 py-3 font-medium">{t('mo.colShort')}</th>
              <th className="px-4 py-3 font-medium">{t('mo.colConsumed')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium">{line.product.name}</span>
                  <span className="block text-muted-foreground">{line.product.sku}</span>
                </td>
                <td className="px-4 py-3">{line.quantity}</td>
                <td className="px-4 py-3">{line.onHand ?? 0}</td>
                <td className="px-4 py-3">{shortfall(line) || '—'}</td>
                <td className="px-4 py-3">{line.consumed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {row.state === 'progress' ? (
        <section className="grid max-w-md gap-3">
          <h2 className="font-serif text-2xl">{t('mo.produce')}</h2>
          <p className="text-sm text-muted-foreground">{t('mo.remaining')}: {remaining}</p>
          <Input type="number" min="0" step="0.001" value={produceQty} onChange={(event) => setProduceQty(event.target.value)} aria-label={t('mo.produceQty')} />
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={produce.isPending}
              onClick={() => {
                const quantity = Number(produceQty)
                if (!(quantity > 0)) {
                  setError(t('mo.stepFailed'))
                  return
                }
                produce.mutate({ quantity })
              }}
            >
              {t('mo.produce')}
            </Button>
            <Button variant="secondary" disabled={produce.isPending} onClick={() => produce.mutate({})}>{t('mo.produceAll')}</Button>
          </div>
        </section>
      ) : null}
      {row.moves && row.moves.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl">{t('mo.moves')}</h2>
          <ul className="mt-2 grid gap-2 text-sm">
            {row.moves.map((move) => (
              <li key={move.id} className="rounded-md border border-border bg-card px-3 py-2">
                {move.product.name} · {move.quantity} · {locationLabel(move.locationFrom.type, move.locationFrom.name, t)} → {locationLabel(move.locationTo.type, move.locationTo.name, t)} · {moveStateLabel(move.state, t)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
