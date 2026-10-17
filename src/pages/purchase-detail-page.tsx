import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Notice } from '../components/field.tsx'
import { FapiaoNote, MoneyTotals } from '../components/money-totals.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { appliedRate } from '../domain/money.ts'
import { locationLabel, moveStateLabel, purchaseStateLabel, singleTaxRate } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { PurchaseOrder, User } from '../lib/types.ts'

export function PurchaseDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [error, setError] = useState('')
  const [receiveQty, setReceiveQty] = useState<Record<number, string>>({})
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me') })
  const order = useQuery({ queryKey: ['purchase', id], queryFn: () => api<PurchaseOrder>(`/api/purchases/${id}`) })

  useEffect(() => {
    const moves = order.data?.moves ?? []
    const next: Record<number, string> = {}
    for (const move of moves) {
      if (move.state === 'draft') next[move.id] = String(move.quantity)
    }
    setReceiveQty(next)
  }, [order.data])

  const refresh = async () => {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['purchase', id] })
    await queryClient.invalidateQueries({ queryKey: ['purchases'] })
    await queryClient.invalidateQueries({ queryKey: ['stock'] })
    await queryClient.invalidateQueries({ queryKey: ['products'] })
    await queryClient.invalidateQueries({ queryKey: ['desk'] })
  }

  const act = useMutation({
    mutationFn: (action: 'send' | 'confirm' | 'cancel') =>
      api<PurchaseOrder>(`/api/purchases/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('purchase.stepFailed')),
  })

  const receive = useMutation({
    mutationFn: (body: { lines?: Array<{ moveId: number; quantity: number }> }) =>
      api<PurchaseOrder>(`/api/purchases/${id}/receive`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('purchase.stepFailed')),
  })

  const invoice = useMutation({
    mutationFn: () => api<{ id: number }>(`/api/invoices/from/purchase/${id}`, { method: 'POST' }),
    onSuccess: (created) => navigate(`/accounting/${created.id}`),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('acct.failed')),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('purchase.loading')}</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  const row = order.data
  if (!row) return null
  const editable = row.state === 'draft' || row.state === 'sent'
  const draftMoves = (row.moves ?? []).filter((move) => move.state === 'draft')
  const isAdmin = me.data?.role === 'admin'
  const rate = singleTaxRate((row.lines ?? []).map((line) => (line.tax ? appliedRate(line.subtotal, line.taxAmount) : null)))

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{shortDate(row.dateOrder)}</p>
          <h1 className="font-serif text-4xl tracking-tight" data-tour="tour-receive">{row.name}</h1>
          <p className="mt-1">
            <Link className="font-medium hover:underline" to={`/contacts/${row.vendorId}`}>{row.vendor.name}</Link>
          </p>
          {row.warehouse ? <p className="text-sm text-muted-foreground">{t('purchase.warehouse')} · {row.warehouse.name}</p> : null}
        </div>
        <Badge tone={row.state}>{purchaseStateLabel(row.state, t)}</Badge>
      </div>
      {error ? <Notice message={error} /> : null}
      {editable && !isAdmin ? <p className="text-sm text-muted-foreground">{t('purchase.adminOnly')}</p> : null}
      <div className="flex flex-wrap gap-2">
        {editable ? <Link to={`/purchases/${row.id}/edit`}><Button variant="outline">{t('purchase.edit')}</Button></Link> : null}
        {row.state === 'draft' ? (
          <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate('send')}>{t('purchase.markSent')}</Button>
        ) : null}
        {editable && isAdmin ? (
          <Button disabled={act.isPending} onClick={() => act.mutate('confirm')}>{t('purchase.confirm')}</Button>
        ) : null}
        {row.state !== 'done' && row.state !== 'cancel' ? (
          <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate('cancel')}>{t('purchase.cancel')}</Button>
        ) : null}
        <Link to={`/purchases/${row.id}/print`} target="_blank"><Button variant="outline">{t('purchase.print')}</Button></Link>
        {row.state === 'purchase' || row.state === 'done' ? (
          <Button variant="secondary" disabled={invoice.isPending} onClick={() => invoice.mutate()}>{t('acct.createBill')}</Button>
        ) : null}
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('purchase.colItem')}</th>
              <th className="px-4 py-3 font-medium">{t('purchase.colQty')}</th>
              <th className="px-4 py-3 font-medium">{t('purchase.colCost')}</th>
              <th className="px-4 py-3 font-medium">{t('purchase.colTax')}</th>
              <th className="px-4 py-3 font-medium">{t('purchase.colSubtotal')}</th>
            </tr>
          </thead>
          <tbody>
            {row.lines?.map((line, index) => (
              <tr key={line.id ?? index} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <span className="font-medium">{line.description}</span>
                  <span className="block text-muted-foreground">{line.product?.sku}</span>
                </td>
                <td className="px-4 py-3">{line.quantity}</td>
                <td className="px-4 py-3">{money(line.unitCost)}</td>
                <td className="px-4 py-3">
                  {line.tax ? `${line.tax.name} ${appliedRate(line.subtotal, line.taxAmount) ?? line.tax.rate}% · ${money(line.taxAmount)}` : t('purchase.noTax')}
                </td>
                <td className="px-4 py-3">{money(line.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MoneyTotals untaxed={row.amountUntaxed} tax={row.amountTax} total={row.amountTotal} rate={rate} />
      <FapiaoNote />
      {row.state === 'purchase' ? (
        <section className="grid gap-3">
          <h2 className="font-serif text-2xl">{t('purchase.receipt')}</h2>
          {draftMoves.length === 0 ? <p className="text-sm text-muted-foreground">{t('purchase.noGoods')}</p> : null}
          {draftMoves.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('purchase.colItem')}</th>
                    <th className="px-4 py-3 font-medium">{t('purchase.openQty')}</th>
                    <th className="px-4 py-3 font-medium">{t('purchase.receiveQty')}</th>
                  </tr>
                </thead>
                <tbody>
                  {draftMoves.map((move) => (
                    <tr key={move.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        {move.product.name}
                        <span className="block text-muted-foreground">
                          {locationLabel(move.locationFrom.type, move.locationFrom.name, t)} → {locationLabel(move.locationTo.type, move.locationTo.name, t)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{move.quantity}</td>
                      <td className="px-4 py-3">
                        <Input
                          className="max-w-32"
                          type="number"
                          min="0"
                          step="0.001"
                          value={receiveQty[move.id] ?? ''}
                          onChange={(event) => setReceiveQty({ ...receiveQty, [move.id]: event.target.value })}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {draftMoves.length > 0 ? (
              <Button
                data-tour="tour-receive"
                disabled={receive.isPending}
                onClick={() => {
                  const lines = draftMoves
                    .map((move) => ({ moveId: move.id, quantity: Number(receiveQty[move.id]) }))
                    .filter((line) => line.quantity > 0)
                  if (lines.length === 0) {
                    setError(t('purchase.enterQty'))
                    return
                  }
                  setError('')
                  receive.mutate({ lines })
                }}
              >
                {t('purchase.receive')}
              </Button>
            ) : (
              <Button data-tour="tour-receive" disabled={receive.isPending} onClick={() => receive.mutate({})}>{t('purchase.receive')}</Button>
            )}
            {draftMoves.length > 0 ? (
              <Button variant="secondary" disabled={receive.isPending} onClick={() => receive.mutate({})}>
                {t('purchase.receiveAll')}
              </Button>
            ) : null}
          </div>
        </section>
      ) : null}
      {row.moves && row.moves.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl">{t('purchase.receipt')}</h2>
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
