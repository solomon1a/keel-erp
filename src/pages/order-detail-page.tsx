import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { api, ApiError } from '../lib/api.ts'
import { money, orderStateLabel, shortDate } from '../lib/format.ts'
import type { SalesOrder } from '../lib/types.ts'

export function OrderDetailPage() {
  const { id } = useParams()
  const queryClient = useQueryClient()
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
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'That step failed.'),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">Loading the order…</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  const row = order.data
  if (!row) return null
  const hasGoods = (row.moves ?? []).some((move) => move.state === 'draft')
  const editable = row.state === 'draft' || row.state === 'sent'

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{shortDate(row.dateOrder)}</p>
          <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
          <p className="mt-1">
            <Link className="font-medium hover:underline" to={`/contacts/${row.customerId}`}>{row.customer.name}</Link>
            {row.validityDate ? <span className="text-muted-foreground"> · valid until {shortDate(row.validityDate)}</span> : null}
          </p>
        </div>
        <Badge tone={row.state}>{orderStateLabel[row.state] ?? row.state}</Badge>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        {editable ? <Link to={`/orders/${row.id}/edit`}><Button variant="outline">Edit</Button></Link> : null}
        {row.state === 'draft' ? <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate('send')}>Mark sent</Button> : null}
        {editable ? <Button disabled={act.isPending} onClick={() => act.mutate('confirm')}>Confirm order</Button> : null}
        {row.state === 'sale' ? (
          <Button disabled={act.isPending} onClick={() => act.mutate('deliver')}>
            {hasGoods ? 'Validate delivery' : 'Mark fulfilled'}
          </Button>
        ) : null}
        {row.state !== 'done' && row.state !== 'cancel' ? (
          <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate('cancel')}>Cancel</Button>
        ) : null}
        <Link to={`/orders/${row.id}/print`} target="_blank"><Button variant="outline">Print quotation</Button></Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Item</th>
              <th className="px-4 py-3 font-medium">Qty</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">Discount</th>
              <th className="px-4 py-3 font-medium">Tax</th>
              <th className="px-4 py-3 font-medium">Subtotal</th>
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
                <td className="px-4 py-3">{line.tax ? `${line.tax.name} ${money(line.taxAmount)}` : '—'}</td>
                <td className="px-4 py-3">{money(line.subtotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-right text-sm">
        Untaxed {money(row.amountUntaxed)} · Tax {money(row.amountTax)} · <span className="text-base font-semibold">Total {money(row.amountTotal)}</span>
      </p>
      {row.moves && row.moves.length > 0 ? (
        <section>
          <h2 className="font-serif text-2xl">Delivery moves</h2>
          <ul className="mt-2 grid gap-2 text-sm">
            {row.moves.map((move) => (
              <li key={move.id} className="rounded-md border border-border bg-card px-3 py-2">
                {move.product.name} · {move.quantity} · {move.locationFrom.name} → {move.locationTo.name} · {move.state}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
