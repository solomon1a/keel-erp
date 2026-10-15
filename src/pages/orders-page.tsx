import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { api } from '../lib/api.ts'
import { money, orderStateLabel, shortDate } from '../lib/format.ts'
import type { SalesOrder } from '../lib/types.ts'

const filters = [
  ['all', 'All'],
  ['draft', 'Quotations'],
  ['sent', 'Sent'],
  ['sale', 'To deliver'],
  ['done', 'Delivered'],
  ['cancel', 'Cancelled'],
]

export function OrdersPage() {
  const [state, setState] = useState('all')
  const orders = useQuery({
    queryKey: ['orders', state],
    queryFn: () => api<SalesOrder[]>(`/api/orders?state=${state}`),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Orders</h1>
          <p className="mt-1 text-muted-foreground">A quotation becomes a sales order when you confirm it. Delivery then takes goods off the shelf.</p>
        </div>
        <Link to="/orders/new"><Button>New quotation</Button></Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Button key={value} size="sm" variant={state === value ? 'default' : 'outline'} onClick={() => setState(value)}>
            {label}
          </Button>
        ))}
      </div>
      {orders.isLoading ? <p className="text-sm text-muted-foreground">Loading orders…</p> : null}
      {orders.isError ? <p className="text-sm text-destructive">{orders.error.message}</p> : null}
      {orders.data && orders.data.length === 0 ? (
        <EmptyState title="Nothing in this pile" body="Start a quotation, or switch the filter." />
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Number</th>
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">State</th>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {orders.data?.map((order) => (
              <tr key={order.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link className="font-semibold hover:underline" to={`/orders/${order.id}`}>{order.name}</Link>
                </td>
                <td className="px-4 py-3">{order.customer.name}</td>
                <td className="px-4 py-3"><Badge tone={order.state}>{orderStateLabel[order.state] ?? order.state}</Badge></td>
                <td className="px-4 py-3">{shortDate(order.dateOrder)}</td>
                <td className="px-4 py-3">{money(order.amountTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
