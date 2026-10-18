import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { defaultWarehouseId, WarehouseField } from '../components/warehouse-field.tsx'
import { FapiaoNote, MoneyTotals } from '../components/money-totals.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { lineAmounts, sumLines } from '../domain/money.ts'
import { singleTaxRate } from '../i18n/labels.ts'
import { BaseCurrencyNote, BaseMoneyLabel } from '../components/base-currency.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { dateInput, taxIdForCompany } from '../lib/format.ts'
import type { Contact, Product, SalesOrder, Tax, User, Warehouse } from '../lib/types.ts'

type DraftLine = {
  productId: string
  quantity: string
  unitPrice: string
  discount: string
  taxId: string
}

const blankLine = (taxId = ''): DraftLine => ({ productId: '', quantity: '1', unitPrice: '0', discount: '0', taxId })

export function OrderFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [customerId, setCustomerId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [validityDate, setValidityDate] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine()])
  const [error, setError] = useState('')

  const customers = useQuery({
    queryKey: ['contacts', 'customers'],
    queryFn: () => api<Contact[]>('/api/contacts?role=customer'),
  })
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: () => api<Tax[]>('/api/taxes') })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api<SalesOrder>(`/api/orders/${id}`),
    enabled: !isNew,
  })

  const defaultTaxId = taxIdForCompany(taxes.data, me.data?.company.defaultTaxRate)

  useEffect(() => {
    if (!order.data) return
    setCustomerId(String(order.data.customerId))
    setWarehouseId(order.data.warehouseId ? String(order.data.warehouseId) : '')
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

  useEffect(() => {
    if (warehouseId || !warehouses.data) return
    setWarehouseId(defaultWarehouseId(warehouses.data))
  }, [warehouseId, warehouses.data])

  useEffect(() => {
    if (!defaultTaxId) return
    setLines((current) => {
      if (current.some((line) => line.taxId)) return current
      return current.map((line) => ({ ...line, taxId: String(defaultTaxId) }))
    })
  }, [defaultTaxId])

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

  const previewRate = singleTaxRate(
    lines.map((line) => taxes.data?.find((item) => item.id === Number(line.taxId))?.rate ?? null),
  )

  const save = useMutation({
    mutationFn: () =>
      api<SalesOrder>(isNew ? '/api/orders' : `/api/orders/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify({
          customerId: Number(customerId),
          warehouseId: Number(warehouseId),
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
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('quote.saveFailed')),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('quote.loading')}</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  if (order.data && !['draft', 'sent'].includes(order.data.state)) {
    return (
      <p className="text-sm">
        {t('quote.locked')} <Link className="underline" to={`/orders/${id}`}>{t('quote.back')}</Link>
      </p>
    )
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
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? t('quote.new') : order.data?.name}</h1>
        <p className="mt-1 text-muted-foreground">{t('quote.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('quote.customer')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            <option value="">{t('quote.chooseCustomer')}</option>
            {customers.data?.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name}</option>
            ))}
          </select>
        </Field>
        <WarehouseField
          label={t('quote.warehouse')}
          value={warehouseId}
          onChange={setWarehouseId}
          warehouses={warehouses.data}
          choose={t('stock.chooseWarehouse')}
        />
        <Field label={t('quote.valid')}>
          <Input type="date" value={validityDate} onChange={(event) => setValidityDate(event.target.value)} />
        </Field>
      </div>
      <BaseCurrencyNote />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">{t('quote.product')}</th>
              <th className="px-3 py-3 font-medium">{t('order.colQty')}</th>
              <th className="px-3 py-3 font-medium"><BaseMoneyLabel text={t('order.colPrice')} /></th>
              <th className="px-3 py-3 font-medium">{t('quote.discount')}</th>
              <th className="px-3 py-3 font-medium">{t('quote.tax')}</th>
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
                        taxId: line.taxId || (defaultTaxId ? String(defaultTaxId) : ''),
                      }
                      setLines(next)
                    }}
                  >
                    <option value="">{t('common.choose')}</option>
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
                    <option value="">{t('order.noTax')}</option>
                    {taxes.data?.map((tax) => (
                      <option key={tax.id} value={tax.id}>{tax.name} ({tax.rate}%)</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <Button variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>{t('common.remove')}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Button variant="outline" onClick={() => setLines([...lines, blankLine(defaultTaxId ? String(defaultTaxId) : '')])}>{t('quote.addLine')}</Button>
        <MoneyTotals untaxed={preview.amountUntaxed} tax={preview.amountTax} total={preview.amountTotal} rate={previewRate} />
      </div>
      <FapiaoNote />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('quote.save')}</Button>
        <Link to={isNew ? '/orders' : `/orders/${id}`}><Button variant="outline">{t('common.cancel')}</Button></Link>
      </div>
    </form>
  )

  function updateLine(index: number, patch: Partial<DraftLine>) {
    const next = [...lines]
    const current = next[index]
    if (!current) return
    next[index] = { ...current, ...patch }
    setLines(next)
  }
}
