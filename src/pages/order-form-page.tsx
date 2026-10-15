import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { lineAmounts, sumLines } from '../domain/money.ts'
import { api, ApiError } from '../lib/api.ts'
import { dateInput, money } from '../lib/format.ts'
import type { Contact, Product, SalesOrder, Tax } from '../lib/types.ts'

type DraftLine = {
  productId: string
  quantity: string
  unitPrice: string
  discount: string
  taxId: string
}

const blankLine = (): DraftLine => ({ productId: '', quantity: '1', unitPrice: '0', discount: '0', taxId: '' })

export function OrderFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [customerId, setCustomerId] = useState('')
  const [validityDate, setValidityDate] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine()])
  const [error, setError] = useState('')

  const customers = useQuery({
    queryKey: ['contacts', 'customers'],
    queryFn: () => api<Contact[]>('/api/contacts?role=customer'),
  })
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: () => api<Tax[]>('/api/taxes') })
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api<SalesOrder>(`/api/orders/${id}`),
    enabled: !isNew,
  })

  useEffect(() => {
    if (!order.data) return
    setCustomerId(String(order.data.customerId))
    setValidityDate(dateInput(order.data.validityDate))
    setLines(
      (order.data.lines ?? []).map((line) => ({
        productId: String(line.productId),
        quantity: String(line.quantity),
        unitPrice: String(line.unitPrice),
        discount: String(line.discount),
        taxId: line.taxId ? String(line.taxId) : '',
      })),
    )
  }, [order.data])

  const preview = useMemo(() => {
    const priced = lines.map((line) => {
      const tax = taxes.data?.find((item) => item.id === Number(line.taxId))
      return lineAmounts({
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitPrice) || 0,
        discount: Number(line.discount) || 0,
        taxRate: tax?.rate ?? 0,
      })
    })
    return sumLines(priced)
  }, [lines, taxes.data])

  const save = useMutation({
    mutationFn: () =>
      api<SalesOrder>(isNew ? '/api/orders' : `/api/orders/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify({
          customerId: Number(customerId),
          validityDate,
          lines: lines.map((line) => ({
            productId: Number(line.productId),
            quantity: Number(line.quantity),
            unitPrice: Number(line.unitPrice),
            discount: Number(line.discount),
            taxId: line.taxId ? Number(line.taxId) : null,
          })),
        }),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      navigate(`/orders/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'Could not save the quotation.'),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">Loading the quotation…</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  if (order.data && !['draft', 'sent'].includes(order.data.state)) {
    return <p className="text-sm">This order is locked. <Link className="underline" to={`/orders/${id}`}>Go back to it.</Link></p>
  }

  const offered = products.data?.filter((product) => product.active) ?? []

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        save.mutate()
      }}
    >
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? 'New quotation' : order.data?.name}</h1>
        <p className="mt-1 text-muted-foreground">Prices start from the catalog. Tax is calculated when you save.</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Customer">
          <select className="h-10 rounded-md border border-border bg-card px-3" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            <option value="">Choose a customer</option>
            {customers.data?.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Valid until">
          <Input type="date" value={validityDate} onChange={(event) => setValidityDate(event.target.value)} />
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">Product</th>
              <th className="px-3 py-3 font-medium">Qty</th>
              <th className="px-3 py-3 font-medium">Price</th>
              <th className="px-3 py-3 font-medium">Discount %</th>
              <th className="px-3 py-3 font-medium">Tax</th>
              <th className="px-3 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={index} className="border-b border-border last:border-0">
                <td className="px-3 py-2">
                  <select
                    className="h-10 w-full rounded-md border border-border bg-background px-2"
                    value={line.productId}
                    onChange={(event) => {
                      const product = offered.find((item) => item.id === Number(event.target.value))
                      const next = [...lines]
                      next[index] = {
                        ...line,
                        productId: event.target.value,
                        unitPrice: product ? String(product.listPrice) : line.unitPrice,
                        taxId: line.taxId || (taxes.data?.[0] ? String(taxes.data[0].id) : ''),
                      }
                      setLines(next)
                    }}
                  >
                    <option value="">Choose</option>
                    {offered.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2"><Input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></td>
                <td className="px-3 py-2"><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: event.target.value })} /></td>
                <td className="px-3 py-2"><Input type="number" min="0" max="100" step="0.01" value={line.discount} onChange={(event) => updateLine(index, { discount: event.target.value })} /></td>
                <td className="px-3 py-2">
                  <select className="h-10 w-full rounded-md border border-border bg-background px-2" value={line.taxId} onChange={(event) => updateLine(index, { taxId: event.target.value })}>
                    <option value="">No tax</option>
                    {taxes.data?.map((tax) => (
                      <option key={tax.id} value={tax.id}>{tax.name} ({tax.rate}%)</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>Remove</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="outline" onClick={() => setLines([...lines, blankLine()])}>Add line</Button>
        <p className="text-sm">
          Untaxed {money(preview.amountUntaxed)} · Tax {money(preview.amountTax)} · <span className="font-semibold">Total {money(preview.amountTotal)}</span>
        </p>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save quotation'}</Button>
        <Link to={isNew ? '/orders' : `/orders/${id}`}><Button variant="outline">Cancel</Button></Link>
      </div>
    </form>
  )

  function updateLine(index: number, patch: Partial<DraftLine>) {
    const next = [...lines]
    next[index] = { ...next[index], ...patch }
    setLines(next)
  }
}
