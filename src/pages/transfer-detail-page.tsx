import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { locationLabel, moveStateLabel, transferStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { StockMove } from '../lib/types.ts'

type TransferDetail = {
  id: number
  name: string
  state: string
  step: string | null
  route: { name: string; steps: string } | null
  locationFrom: { name: string; type: string; warehouse: { name: string } | null }
  locationTo: { name: string; type: string; warehouse: { name: string } | null }
  lines: Array<{ id: number; quantity: number; lotName: string | null; product: { name: string; sku: string } }>
  moves: StockMove[]
}

function place(name: string, warehouse: { name: string } | null) {
  return warehouse ? `${warehouse.name} · ${name}` : name
}

export function TransferDetailPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const transfer = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => api<TransferDetail>(`/api/transfers/${id}`),
  })

  const act = useMutation({
    mutationFn: (step: 'ready' | 'done' | 'cancel') => api(`/api/transfers/${id}/${step}`, { method: 'POST' }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['transfer', id] })
      await queryClient.invalidateQueries({ queryKey: ['transfers'] })
      await queryClient.invalidateQueries({ queryKey: ['stock'] })
      await queryClient.invalidateQueries({ queryKey: ['moves'] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      await queryClient.invalidateQueries({ queryKey: ['replenish'] })
      await queryClient.invalidateQueries({ queryKey: ['desk'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('tr.stepFailed')),
  })

  if (transfer.isLoading) return <p className="text-sm text-muted-foreground">{t('tr.loading')}</p>
  if (transfer.isError) return <p className="text-sm text-destructive">{transfer.error.message}</p>
  const row = transfer.data
  if (!row) return null

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {place(row.locationFrom.name, row.locationFrom.warehouse)} → {place(row.locationTo.name, row.locationTo.warehouse)}
          </p>
        </div>
        <Badge tone={row.state}>{transferStateLabel(row.state, t)}</Badge>
        {row.step ? <span className="text-sm text-muted-foreground">{t('tr.step')}: {row.step}</span> : null}
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        {row.state === 'draft' ? <Link to={`/inventory/transfers/${row.id}/edit`}><Button variant="outline">{t('tr.edit')}</Button></Link> : null}
        {row.state === 'draft' ? <Button disabled={act.isPending} onClick={() => act.mutate('ready')}>{t('tr.ready')}</Button> : null}
        {row.state === 'ready' ? (
          <Button disabled={act.isPending} onClick={() => act.mutate('done')}>
            {row.route && row.step && row.route.steps.split(',').at(-1) !== row.step ? t('tr.next') : t('tr.done')}
          </Button>
        ) : null}
        {row.state !== 'done' && row.state !== 'cancel' ? (
          <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate('cancel')}>{t('tr.cancel')}</Button>
        ) : null}
        <Link to="/inventory/transfers"><Button variant="outline">{t('tr.list')}</Button></Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('tr.lines')}</th>
              <th className="px-4 py-3 font-medium">{t('ledger.qty')}</th>
              <th className="px-4 py-3 font-medium">{t('tr.lot')}</th>
            </tr>
          </thead>
          <tbody>
            {row.lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{line.product.name}</td>
                <td className="px-4 py-3">{line.quantity}</td>
                <td className="px-4 py-3">{line.lotName || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {row.moves.length > 0 ? (
        <ul className="grid gap-2 text-sm">
          {row.moves.map((move) => (
            <li key={move.id} className="rounded-md border border-border bg-card px-3 py-2">
              {move.product.name} · {move.quantity} · {locationLabel(move.locationFrom.type, move.locationFrom.name, t)} → {locationLabel(move.locationTo.type, move.locationTo.name, t)}
              <span className="block text-muted-foreground">{moveStateLabel(move.state, t)}{move.lotName ? ` · ${move.lotName}` : ''}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
