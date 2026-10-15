import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { Notice } from '../components/field.tsx'
import { FapiaoNote, MoneyTotals } from '../components/money-totals.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { locationLabel, moveStateLabel, orderStateLabel, singleTaxRate } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { appliedRate } from '../domain/money.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { SalesOrder } from '../lib/types.ts'

export function OrderDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [error, setError] = useState('')
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api<SalesOrder>(`/api/orders/${id}`) })

  const act = useMutation({
    mutationFn: (action: 'send' | 'confirm' | 'deliver' | 'cancel') =>
      api<SalesOrder>(`/api/orders/${id}/${action}`, { method: 'POST' }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['order', id] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      await queryClient.invalidateQueries({ queryKey: ['desk'] })
      await queryClient.invalidateQueries({ queryKey: ['stock'] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('order.stepFailed')),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('order.loading')}</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  const row = order.data
  if (!row) return null
  const hasGoods = (row.moves ?? []).some((move) => move.state === 'draft')
  const editable = row.state === 'draft' || row.state === 'sent'
  const rate = singleTaxRate((row.lines ?? []).map((line) => (line.tax ? appliedRate(line.subtotal, line.taxAmount) : null)))

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{shortDate(row.dateOrder)}</p>
          <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
          <p className="mt-1">
            <Link className="font-medium hover:underline" to={`/contacts/${row.customerId}`}>{row.customer.name}</Link>
            {row.validityDate ? <span className="text-muted-foreground"> · {t('order.validUntil', { date: shortDate(row.validityDate) })}</span> : null}
          </p>
        </div>
        <Badge tone={row.state}>{orderStateLabel(row.state, t)}</Badge>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        {editable ? <Link to={`/orders/${row.id}/edit`}><Button variant="outline">{t('order.edit')}</Button></Link> : null}
        {row.state === 'draft' ? <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate('send')}>{t('order.markSent')}</Button> : null}
        {editable ? <Button disabled={act.isPending} onClick={() => act.mutate('confirm')}>{t('order.confirm')}</Button> : null}
        {row.state === 'sale' ? (
          <Button disabled={act.isPending} onClick={() => act.mutate('deliver')}>
            {hasGoods ? t('order.deliver') : t('order.fulfill')}
          </Button>
        ) : null}
        {row.state !== 'done' && row.state !== 'cancel' ? (
          <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate('cancel')}>{t('order.cancel')}</Button>
        ) : null}
        <Link to={`/orders/${row.id}/print`} target="_blank"><Button variant="outline">{t('order.print')}</Button></Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('order.colItem')}</th>
              <th className="px-4 py-3 font-medium">{t('order.colQty')}</th>
              <th className="px-4 py-3 font-medium">{t('order.colPrice')}</th>
              <th className="px-4 py-3 font-medium">{t('order.colDiscount')}</th>
              <th className="px-4 py-3 font-medium">{t('order.colTax')}</th>
              <th className="px-4 py-3 font-medium">{t('order.colSubtotal')}</th>
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
                <td className="px-4 py-3">{money(line.unitPrice)}</td>
                <td className="px-4 py-3">{line.discount}%</td>
                <td className="px-4 py-3">
                  {line.tax ? `${line.tax.name} ${appliedRate(line.subtotal, line.taxAmount) ?? line.tax.rate}% · ${money(line.taxAmount)}` : t('order.noTax')}
                </td>
                <td className="px-4 py-3">{money(line.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <MoneyTotals untaxed={row.amountUntaxed} tax={row.amountTax} total={row.amountTotal} rate={rate} />
      <FapiaoNote />
      {row.moves && row.moves.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl">{t('order.moves')}</h2>
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
