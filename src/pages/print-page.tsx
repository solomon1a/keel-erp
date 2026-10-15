import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Button } from '../components/ui/button.tsx'
import { api } from '../lib/api.ts'
import { money, orderStateLabel, shortDate } from '../lib/format.ts'
import type { SalesOrder } from '../lib/types.ts'

export function PrintPage() {
  const { id } = useParams()
  const order = useQuery({ queryKey: ['order', id], queryFn: () => api<SalesOrder>(`/api/orders/${id}`) })
  if (order.isLoading) return <p className="p-8 text-sm">Preparing the page…</p>
  if (order.isError) return <p className="p-8 text-sm text-destructive">{order.error.message}</p>
  const row = order.data
  if (!row) return null

  return (
    <article className="mx-auto max-w-3xl bg-white px-8 py-10 text-foreground print:px-0">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <p className="text-sm text-muted-foreground">This page is the quotation. Use the browser print dialog to save a PDF.</p>
        <Button onClick={() => window.print()}>Print</Button>
      </div>
      <header className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <p className="font-serif text-3xl">Northline Goods</p>
          <p className="text-sm text-muted-foreground">Portland</p>
        </div>
        <div className="text-right">
          <p className="font-serif text-2xl">{row.name}</p>
          <p className="text-sm">{orderStateLabel[row.state]}</p>
          <p className="text-sm text-muted-foreground">{shortDate(row.dateOrder)}</p>
        </div>
      </header>
      <p className="mt-6">
        <span className="block text-sm text-muted-foreground">Prepared for</span>
        <span className="text-lg font-semibold">{row.customer.name}</span>
        {row.customer.city ? <span className="block text-sm">{row.customer.city}</span> : null}
        {row.customer.email ? <span className="block text-sm">{row.customer.email}</span> : null}
      </p>
      {row.validityDate ? <p className="mt-2 text-sm">Valid until {shortDate(row.validityDate)}.</p> : null}
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">Item</th>
            <th className="py-2">Qty</th>
            <th className="py-2">Price</th>
            <th className="py-2">Amount</th>
          </tr>
        </thead>
        <tbody>
          {row.lines?.map((line, index) => (
            <tr key={line.id ?? index} className="border-b border-border">
              <td className="py-2">{line.description}{line.discount ? ` (${line.discount}% off)` : ''}</td>
              <td className="py-2">{line.quantity}</td>
              <td className="py-2">{money(line.unitPrice)}</td>
              <td className="py-2">{money(line.subtotal + line.taxAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 text-right text-sm">
        Untaxed {money(row.amountUntaxed)}<br />
        Tax {money(row.amountTax)}<br />
        <span className="text-base font-semibold">Total {money(row.amountTotal)}</span>
      </p>
    </article>
  )
}
