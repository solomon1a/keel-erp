import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { lineAmounts, roundMoney, sumLines } from '../domain/money.ts'
import { payMethodLabel, posOrderLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { PosOrder, User } from '../lib/types.ts'

export function PosOrderPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const order = useQuery({ queryKey: ['pos-order', id], queryFn: () => api<PosOrder>(`/api/pos/orders/${id}`) })
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me') })
  const [quantities, setQuantities] = useState<Record<number, string>>({})
  const [method, setMethod] = useState('cash')
  const [error, setError] = useState('')

  const lines = order.data?.lines ?? []
  const refundPreview = useMemo(() => {
    const priced = lines.flatMap((line) => {
      const quantity = Number(quantities[line.id] || 0)
      if (!(quantity > 0)) return []
      return [lineAmounts({ quantity, unitPrice: line.unitPrice, discount: line.discount, taxRate: line.taxRate })]
    })
    return sumLines(priced)
  }, [lines, quantities])

  const refund = useMutation({
    mutationFn: () =>
      api(`/api/pos/orders/${id}/refund`, {
        method: 'POST',
        body: JSON.stringify({
          lines: lines.flatMap((line) => {
            const quantity = Number(quantities[line.id] || 0)
            return quantity > 0 ? [{ lineId: line.id, quantity }] : []
          }),
          payments: [{ method, amount: refundPreview.amountTotal }],
        }),
      }),
    onSuccess: async () => {
      setError('')
      setQuantities({})
      await queryClient.invalidateQueries({ queryKey: ['pos-order', id] })
      await queryClient.invalidateQueries({ queryKey: ['pos-orders'] })
      await queryClient.invalidateQueries({ queryKey: ['pos-session'] })
      await queryClient.invalidateQueries({ queryKey: ['pos-catalog'] })
      await queryClient.invalidateQueries({ queryKey: ['stock'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pos.failed')),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('pos.loading')}</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  const row = order.data
  if (!row) return null
  const isAdmin = me.data?.role === 'admin'
  const sessionOpen = row.session?.state === 'open'
  const canRefund = isAdmin && sessionOpen && row.state !== 'refunded'

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{shortDate(row.createdAt)} · {row.warehouse?.name}</p>
          <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
          <p className="mt-1">{row.customer?.name ?? t('pos.walkIn')}</p>
        </div>
        <Badge tone={row.state}>{posOrderLabel(row.state, t)}</Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Link to={`/pos/orders/${row.id}/print`} target="_blank"><Button variant="outline">{t('pos.receipt')}</Button></Link>
        <Link to={`/pos/sessions/${row.sessionId}`}><Button variant="outline">{row.session?.name ?? t('pos.session')}</Button></Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('print.item')}</th>
              <th className="px-4 py-3 font-medium">{t('pos.qty')}</th>
              <th className="px-4 py-3 font-medium">{t('pos.total')}</th>
              {canRefund ? <th className="px-4 py-3 font-medium">{t('pos.refundQty')}</th> : null}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const left = roundMoney(line.quantity - line.refundedQty)
              return (
                <tr key={line.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    {line.description}
                    {line.discount ? <span className="block text-muted-foreground">{line.discount}%</span> : null}
                  </td>
                  <td className="px-4 py-3">{line.quantity}{line.refundedQty ? <span className="block text-muted-foreground">{t('pos.refunds')} {line.refundedQty}</span> : null}</td>
                  <td className="px-4 py-3">{money(roundMoney(line.subtotal + line.taxAmount))}</td>
                  {canRefund ? (
                    <td className="px-4 py-3">
                      {left > 0 ? (
                        <Input
                          className="h-11 w-24"
                          type="number"
                          min="0"
                          max={left}
                          step="0.001"
                          value={quantities[line.id] ?? ''}
                          onChange={(event) => setQuantities({ ...quantities, [line.id]: event.target.value })}
                        />
                      ) : null}
                    </td>
                  ) : null}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="text-sm">
        <p>{t('totals.untaxed')} {money(row.amountUntaxed)}</p>
        <p>{t('pos.vat', { rate: lines[0]?.taxRate ?? 13 })} {money(row.amountTax)}</p>
        <p className="text-lg font-semibold">{t('pos.total')} {money(row.amountTotal)}</p>
        {row.amountRefunded ? <p>{t('pos.refunds')} {money(row.amountRefunded)}</p> : null}
      </div>
      <ul className="grid gap-1 text-sm">
        {row.payments?.map((payment, index) => (
          <li key={payment.id ?? index}>
            {payMethodLabel(payment.method, t)} {payment.direction === 'refund' ? t('pos.refunds') : ''} {money(payment.amount)}
            {payment.change ? <span className="text-muted-foreground"> · {t('pos.change')} {money(payment.change)}</span> : null}
          </li>
        ))}
      </ul>
      {canRefund ? (
        <form
          className="grid max-w-md gap-3 rounded-lg border border-border bg-card p-4"
          onSubmit={(event) => {
            event.preventDefault()
            setError('')
            refund.mutate()
          }}
        >
          <h2 className="font-serif text-2xl">{t('pos.refund')}</h2>
          {error ? <Notice message={error} /> : null}
          <label className="grid gap-1 text-sm">
            <span>{t('pos.method')}</span>
            <select className="h-12 rounded-md border border-border bg-background px-3" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="cash">{t('pos.methodCash')}</option>
              <option value="card">{t('pos.methodCard')}</option>
              <option value="wechat">{t('pos.methodWechat')}</option>
              <option value="alipay">{t('pos.methodAlipay')}</option>
            </select>
          </label>
          <p>{t('pos.total')} {money(refundPreview.amountTotal)}</p>
          <Button className="h-12" type="submit" disabled={refund.isPending || refundPreview.amountTotal <= 0}>{t('pos.refundSubmit')}</Button>
        </form>
      ) : row.state === 'refunded' ? null : (
        <p className="text-sm text-muted-foreground">{t('pos.adminRefund')}</p>
      )}
    </div>
  )
}
