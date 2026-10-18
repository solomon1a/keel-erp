import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useState } from 'react'
import { Notice } from '../components/field.tsx'
import { RecordTools } from '../components/record-tools.tsx'
import { FapiaoNote, MoneyTotals } from '../components/money-totals.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { fulfillmentStatus, type FulfillmentStatus } from '../domain/trade.ts'
import { locationLabel, moveStateLabel, orderStateLabel, singleTaxRate } from '../i18n/labels.ts'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { appliedRate } from '../domain/money.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { SalesOrder } from '../lib/types.ts'

type Linked = { id: number; name: string; state?: string; amountTotal?: number; residual?: number }

type OrderLinks = {
  fulfillment: FulfillmentStatus
  quotations: Linked[]
  deliveries: Linked[]
  invoices: Linked[]
  creditNotes: Linked[]
  payments: Array<{ id: number; amount: number; invoiceName: string }>
}

function fulfillmentLabel(status: FulfillmentStatus, t: Translate) {
  switch (status) {
    case 'to_deliver_and_bill':
      return t('order.fulfill.to_deliver_and_bill')
    case 'to_bill':
      return t('order.fulfill.to_bill')
    case 'to_deliver':
      return t('order.fulfill.to_deliver')
    case 'completed':
      return t('order.fulfill.completed')
    case 'nothing':
      return t('order.fulfill.nothing')
    default: {
      const unexpected: never = status
      return unexpected
    }
  }
}

export function OrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [error, setError] = useState('')
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api<SalesOrder>(`/api/orders/${id}`) })
  const links = useQuery({
    queryKey: ['order-links', id],
    queryFn: () => api<OrderLinks>(`/api/orders/${id}/links`),
    enabled: Boolean(id),
  })

  const refresh = async () => {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['order', id] })
    await queryClient.invalidateQueries({ queryKey: ['order-links', id] })
    await queryClient.invalidateQueries({ queryKey: ['orders'] })
    await queryClient.invalidateQueries({ queryKey: ['desk'] })
    await queryClient.invalidateQueries({ queryKey: ['stock'] })
    await queryClient.invalidateQueries({ queryKey: ['products'] })
  }

  const act = useMutation({
    mutationFn: (action: 'send' | 'confirm' | 'deliver' | 'cancel') =>
      api<SalesOrder>(`/api/orders/${id}/${action}`, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('order.stepFailed')),
  })

  const invoice = useMutation({
    mutationFn: (lines: Array<{ lineId: number; quantity: number }> | undefined) =>
      api<{ id: number }>(`/api/invoices/from/sales/${id}`, {
        method: 'POST',
        body: lines ? JSON.stringify({ lines }) : undefined,
      }),
    onSuccess: (created) => navigate(`/accounting/${created.id}`),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('acct.failed')),
  })

  const partial = useMutation({
    mutationFn: (lines: Array<{ lineId: number; quantity: number }>) =>
      api(`/api/orders/${id}/deliver-partial`, { method: 'POST', body: JSON.stringify({ lines }) }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('order.stepFailed')),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('order.loading')}</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  const row = order.data
  if (!row) return null
  const hasGoods = (row.moves ?? []).some((move) => move.state === 'draft')
  const editable = row.state === 'draft' || row.state === 'sent'
  const rate = singleTaxRate((row.lines ?? []).map((line) => (line.tax ? appliedRate(line.subtotal, line.taxAmount) : null)))
  const fulfillment = links.data?.fulfillment ?? fulfillmentStatus(
    (row.lines ?? []).map((line) => ({
      quantity: line.quantity,
      qtyDelivered: line.qtyDelivered ?? 0,
      qtyInvoiced: line.qtyInvoiced ?? 0,
    })),
  )
  const openLines = (kind: 'deliver' | 'bill') =>
    (row.lines ?? []).flatMap((line) => {
      if (!line.id) return []
      if (kind === 'deliver' && line.product?.type !== 'product') return []
      const done = kind === 'deliver' ? line.qtyDelivered ?? 0 : line.qtyInvoiced ?? 0
      const left = line.quantity - done
      if (left <= 0.0001) return []
      const typed = qtys[`${kind}-${line.id}`]
      const quantity = typed === undefined || typed === '' ? left : Number(typed)
      if (!Number.isFinite(quantity) || quantity <= 0) return []
      return [{ lineId: line.id, quantity }]
    })

  const groups: Array<{ title: string; rows: Linked[]; href: (item: Linked) => string }> = [
    { title: t('menu.quotations'), rows: links.data?.quotations ?? [], href: () => `/orders/${row.id}` },
    { title: t('order.moves'), rows: links.data?.deliveries ?? [], href: () => `/orders/${row.id}` },
    { title: t('acct.create'), rows: links.data?.invoices ?? [], href: (item) => `/accounting/${item.id}` },
    { title: t('acct.credit'), rows: links.data?.creditNotes ?? [], href: (item) => `/accounting/${item.id}` },
  ]

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
          {row.warehouse ? <p className="text-sm text-muted-foreground">{t('quote.warehouse')} · {row.warehouse.name}</p> : null}
          {row.origin === 'shop' ? (
            <p className="text-sm text-muted-foreground">
              {t('order.shopOrigin')} · {t('order.shopPayment')} · {row.paymentMethod ?? ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={row.state}>{orderStateLabel(row.state, t)}</Badge>
          {row.state === 'sale' || row.state === 'done' ? (
            <span className="keel-chip keel-chip-active">{fulfillmentLabel(fulfillment, t)}</span>
          ) : null}
        </div>
      </div>
      {error ? <Notice message={error} /> : null}
      <RecordTools model="sale.order" recordId={row.id} />
      <div className="flex flex-wrap gap-2" data-tour="tour-deliver">
        {editable ? <Link to={`/orders/${row.id}/edit`}><Button variant="outline">{t('order.edit')}</Button></Link> : null}
        {row.state === 'draft' ? <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate('send')}>{t('order.markSent')}</Button> : null}
        {editable ? <Button data-tour="tour-confirm" disabled={act.isPending} onClick={() => act.mutate('confirm')}>{t('order.confirm')}</Button> : null}
        {row.state === 'sale' ? (
          <Button data-tour="tour-deliver" disabled={act.isPending} onClick={() => act.mutate('deliver')}>
            {hasGoods ? t('order.deliver') : t('order.fulfill')}
          </Button>
        ) : null}
        {row.state === 'sale' && openLines('deliver').length > 0 ? (
          <Button variant="secondary" disabled={partial.isPending} onClick={() => partial.mutate(openLines('deliver'))}>{t('order.deliverRemaining')}</Button>
        ) : null}
        {row.state !== 'done' && row.state !== 'cancel' ? (
          <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate('cancel')}>{t('order.cancel')}</Button>
        ) : null}
        <Link to={`/orders/${row.id}/print`} target="_blank"><Button variant="outline">{t('order.print')}</Button></Link>
        {row.state === 'sale' || row.state === 'done' ? (
          <Button variant="secondary" disabled={invoice.isPending} onClick={() => invoice.mutate(openLines('bill').length ? openLines('bill') : undefined)}>{t('order.invoiceRemaining')}</Button>
        ) : null}
      </div>
      <div className="keel-glass overflow-x-auto rounded-[28px]">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('order.colItem')}</th>
              <th className="px-4 py-3 font-medium">{t('order.colQty')}</th>
              <th className="px-4 py-3 font-medium">{t('order.delivered')}</th>
              <th className="px-4 py-3 font-medium">{t('order.invoiced')}</th>
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
                <td className="px-4 py-3">
                  <span>{line.qtyDelivered ?? 0}</span>
                  {row.state === 'sale' && line.product?.type === 'product' && (line.qtyDelivered ?? 0) + 0.0001 < line.quantity && line.id ? (
                    <Input
                      className="mt-1 h-8 w-20"
                      type="number"
                      min="0"
                      step="1"
                      aria-label={t('order.partialQty')}
                      value={qtys[`deliver-${line.id}`] ?? ''}
                      placeholder={String(line.quantity - (line.qtyDelivered ?? 0))}
                      onChange={(event) => setQtys((current) => ({ ...current, [`deliver-${line.id}`]: event.target.value }))}
                    />
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  <span>{line.qtyInvoiced ?? 0}</span>
                  {(row.state === 'sale' || row.state === 'done') && (line.qtyInvoiced ?? 0) + 0.0001 < line.quantity && line.id ? (
                    <Input
                      className="mt-1 h-8 w-20"
                      type="number"
                      min="0"
                      step="1"
                      aria-label={t('order.partialQty')}
                      value={qtys[`bill-${line.id}`] ?? ''}
                      placeholder={String(line.quantity - (line.qtyInvoiced ?? 0))}
                      onChange={(event) => setQtys((current) => ({ ...current, [`bill-${line.id}`]: event.target.value }))}
                    />
                  ) : null}
                </td>
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
      <section className="keel-glass rounded-[28px] p-5">
        <h2 className="font-serif text-2xl">{t('order.connected')}</h2>
        {links.isLoading ? <p className="mt-2 text-sm text-muted-foreground">{t('order.loading')}</p> : null}
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-sm text-muted-foreground">{group.title}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {group.rows.length === 0 ? <span className="text-sm text-muted-foreground">—</span> : null}
                {group.rows.map((item) => (
                  <Link key={item.id} className="keel-chip" to={group.href(item)}>{item.name}</Link>
                ))}
              </div>
            </div>
          ))}
          <div>
            <p className="text-sm text-muted-foreground">{t('acct.pay')}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(links.data?.payments.length ?? 0) === 0 ? <span className="text-sm text-muted-foreground">—</span> : null}
              {links.data?.payments.map((payment) => (
                <span key={payment.id} className="keel-chip">{payment.invoiceName} · {money(payment.amount)}</span>
              ))}
            </div>
          </div>
        </div>
      </section>
      {row.moves && row.moves.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl">{t('order.moves')}</h2>
          <ul className="mt-2 grid gap-2 text-sm">
            {row.moves.map((move) => (
              <li key={move.id} className="keel-glass rounded-2xl px-3 py-2">
                {move.product.name} · {move.quantity} · {locationLabel(move.locationFrom.type, move.locationFrom.name, t)} → {locationLabel(move.locationTo.type, move.locationTo.name, t)} · {moveStateLabel(move.state, t)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
