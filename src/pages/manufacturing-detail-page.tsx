import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Chatter } from '../components/chatter.tsx'
import { Field, Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { locationLabel, manufacturingStateLabel, moveStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api, ApiError } from '../lib/api.ts'
import type { ManufacturingLine, ManufacturingOrder, User } from '../lib/types.ts'

const kindKey: Record<string, MessageKey> = {
  process_loss: 'floor.processLoss',
  scrap: 'floor.scrap',
  rejected: 'floor.rejected',
}

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
  const [wasteProduct, setWasteProduct] = useState('')
  const [wasteQty, setWasteQty] = useState('0.1')
  const [wasteReason, setWasteReason] = useState('')
  const [wasteKind, setWasteKind] = useState<'process_loss' | 'scrap' | 'rejected'>('process_loss')
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
    mutationFn: (action: 'confirm' | 'start' | 'cancel' | 'stop') =>
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

  const wastage = useMutation({
    mutationFn: () =>
      api(`/api/manufacturing/${id}/wastage`, {
        method: 'POST',
        body: JSON.stringify({
          productId: Number(wasteProduct),
          quantity: Number(wasteQty),
          reason: wasteReason,
          kind: wasteKind,
        }),
      }),
    onSuccess: async () => {
      setWasteReason('')
      await refresh()
      await queryClient.invalidateQueries({ queryKey: ['wastage-report'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  const subcontract = useMutation({
    mutationFn: (action: 'send' | 'receive') =>
      api<ManufacturingOrder>(`/api/manufacturing/${id}/subcontract/${action}`, { method: 'POST', body: JSON.stringify({}) }),
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
          <p className="text-sm text-muted-foreground">
            {t('mo.sourceWarehouse')} {row.sourceWarehouse?.name ?? '—'} · {t('mo.destWarehouse')} {row.destWarehouse?.name ?? '—'}
          </p>
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
        {row.state === 'confirmed' || row.state === 'stopped' ? (
          <Button disabled={act.isPending} onClick={() => act.mutate('start')}>{row.state === 'stopped' ? t('floor.resume') : t('mo.start')}</Button>
        ) : null}
        {row.state === 'progress' ? (
          <Button variant="outline" disabled={act.isPending} onClick={() => act.mutate('stop')}>{t('floor.stop')}</Button>
        ) : null}
        {row.purpose === 'subcontract' && row.subcontractState !== 'sent' && row.subcontractState !== 'received' ? (
          <Button variant="outline" disabled={subcontract.isPending} onClick={() => subcontract.mutate('send')}>{t('floor.send')}</Button>
        ) : null}
        {row.purpose === 'subcontract' && row.subcontractState === 'sent' ? (
          <Button variant="outline" disabled={subcontract.isPending} onClick={() => subcontract.mutate('receive')}>{t('floor.receive')}</Button>
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
      <section className="grid gap-2 text-sm">
        <h2 className="font-serif text-2xl">{t('floor.connected')}</h2>
        <ul className="grid gap-1">
          <li><Link className="hover:underline" to={`/boms/${row.bomId}`}>{row.product.name}</Link>{row.bom?.version ? ` · ${t('floor.version')} ${row.bom.version}` : ''}</li>
          {row.salesOrder ? <li><Link className="hover:underline" to={`/orders/${row.salesOrder.id}`}>{row.salesOrder.name}</Link></li> : null}
          {row.materialRequest ? <li>{row.materialRequest.name}</li> : null}
          {row.supplier ? <li>{t('floor.supplier')}: {row.supplier.name}</li> : null}
          {row.wipWarehouse ? <li>WIP · {row.wipWarehouse.name}</li> : null}
          {row.scrapWarehouse ? <li>{t('floor.scrap')} · {row.scrapWarehouse.name}</li> : null}
        </ul>
      </section>
      {(row.jobCards ?? []).length > 0 ? (
        <section className="grid gap-3">
          <h2 className="font-serif text-2xl">{t('floor.jobCards')}</h2>
          {(row.jobCards ?? []).map((card) => (
            <JobCardPanel key={card.id} card={card} onDone={refresh} onError={setError} />
          ))}
        </section>
      ) : null}
      {row.state === 'progress' || row.state === 'stopped' ? (
        <section className="grid max-w-xl gap-3">
          <h2 className="font-serif text-2xl">{t('floor.record')}</h2>
          {(row.wastage ?? []).length > 0 ? (
            <ul className="grid gap-1 text-sm">
              {(row.wastage ?? []).map((entry) => (
                <li key={entry.id}>{kindKey[entry.kind] ? t(kindKey[entry.kind]) : entry.kind} · {entry.quantity} · {entry.reason} · {entry.cost}</li>
              ))}
            </ul>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('manufacturing.colProduct')}>
              <select className="h-10 rounded-md border border-border bg-card px-3" value={wasteProduct} onChange={(event) => setWasteProduct(event.target.value)}>
                <option value="">{t('common.choose')}</option>
                {lines.map((line) => (
                  <option key={line.productId} value={line.productId}>{line.product.name}</option>
                ))}
                <option value={row.productId}>{row.product.name}</option>
              </select>
            </Field>
            <Field label={t('floor.kind')}>
              <select className="h-10 rounded-md border border-border bg-card px-3" value={wasteKind} onChange={(event) => setWasteKind(event.target.value as 'process_loss' | 'scrap' | 'rejected')}>
                <option value="process_loss">{t('floor.processLoss')}</option>
                <option value="scrap">{t('floor.scrap')}</option>
                <option value="rejected">{t('floor.rejected')}</option>
              </select>
            </Field>
            <Field label={t('floor.qty')}>
              <Input type="number" min="0" step="0.001" value={wasteQty} onChange={(event) => setWasteQty(event.target.value)} />
            </Field>
            <Field label={t('floor.reason')}>
              <Input value={wasteReason} onChange={(event) => setWasteReason(event.target.value)} />
            </Field>
          </div>
          <div>
            <Button
              variant="outline"
              disabled={wastage.isPending}
              onClick={() => {
                if (!wasteProduct || !(Number(wasteQty) > 0) || !wasteReason.trim()) {
                  setError(t('mo.stepFailed'))
                  return
                }
                wastage.mutate()
              }}
            >
              {t('floor.record')}
            </Button>
          </div>
        </section>
      ) : null}
      <Chatter model="mrp.order" recordId={row.id} />
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

function JobCardPanel({
  card,
  onDone,
  onError,
}: {
  card: NonNullable<ManufacturingOrder['jobCards']>[number]
  onDone: () => Promise<void>
  onError: (message: string) => void
}) {
  const { t } = useI18n()
  const [operator, setOperator] = useState('')
  const [minutes, setMinutes] = useState('30')
  const [note, setNote] = useState('')
  const [completed, setCompleted] = useState(String(card.completedQty))
  const log = useMutation({
    mutationFn: () =>
      api(`/api/job-cards/${card.id}/log`, {
        method: 'POST',
        body: JSON.stringify({ operatorName: operator, minutes: Number(minutes), note: note || undefined }),
      }),
    onSuccess: async () => {
      setOperator('')
      setNote('')
      await onDone()
    },
    onError: (reason) => onError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })
  const complete = useMutation({
    mutationFn: () =>
      api(`/api/job-cards/${card.id}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completedQty: Number(completed), processLoss: card.processLoss }),
      }),
    onSuccess: () => onDone(),
    onError: (reason) => onError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })
  return (
    <article className="grid gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold">{card.name} · {card.operationName}</p>
          <p className="text-sm text-muted-foreground">
            {card.workstation?.name ?? '—'} · {t('floor.rate')} {card.workstation?.hourRate ?? 0} · {card.completedQty} / {card.plannedQty}
          </p>
        </div>
        <Badge tone={card.status}>{card.status}</Badge>
      </div>
      <ul className="grid gap-1 text-sm">
        {card.logs.map((entry) => (
          <li key={entry.id}>{entry.operatorName} · {entry.minutes} {t('floor.minutes')}{entry.note ? ` · ${entry.note}` : ''}</li>
        ))}
      </ul>
      {card.status !== 'done' ? (
        <div className="grid gap-2 sm:grid-cols-4">
          <Input value={operator} placeholder={t('floor.operator')} aria-label={t('floor.operator')} onChange={(event) => setOperator(event.target.value)} />
          <Input type="number" min="0" step="1" value={minutes} aria-label={t('floor.minutes')} onChange={(event) => setMinutes(event.target.value)} />
          <Input value={note} placeholder={t('desk.note')} aria-label={t('desk.note')} onChange={(event) => setNote(event.target.value)} />
          <Button
            variant="outline"
            disabled={log.isPending}
            onClick={() => {
              if (!operator.trim() || !(Number(minutes) > 0)) {
                onError(t('mo.stepFailed'))
                return
              }
              log.mutate()
            }}
          >
            {t('floor.log')}
          </Button>
          <Input type="number" min="0" step="0.001" value={completed} aria-label={t('floor.complete')} onChange={(event) => setCompleted(event.target.value)} />
          <Button variant="secondary" disabled={complete.isPending} onClick={() => complete.mutate()}>{t('floor.complete')}</Button>
        </div>
      ) : null}
    </article>
  )
}
