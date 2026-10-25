import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { defaultWarehouseId, WarehouseField } from '../components/warehouse-field.tsx'
import { FapiaoNote, MoneyTotals } from '../components/money-totals.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { lineAmounts, roundMoney, sumLines } from '../domain/money.ts'
import { computeTaxes } from '../../shared/tax-engine.ts'
import { singleTaxRate } from '../i18n/labels.ts'
import { BaseCurrencyNote, BaseMoneyLabel } from '../components/base-currency.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { quotePrice } from '../lib/quote-price.ts'
import { taxIdForCompany } from '../lib/format.ts'
import type { Contact, Product, PurchaseOrder, Tax, User, Warehouse } from '../lib/types.ts'

type DraftLine = {
  productId: string
  quantity: string
  unitCost: string
  taxId: string
  taxGroupId: string
}

type CompanyTaxRow = {
  id: number
  name: string
  kind: string
  amount: number
  priceInclude: boolean
  compound: boolean
  withholding: boolean
  sequence: number
  active: boolean
}

type TaxGroupRow = { id: number; name: string; lines: Array<{ tax: CompanyTaxRow }> }

const blankLine = (taxId = ''): DraftLine => ({ productId: '', quantity: '1', unitCost: '0', taxId, taxGroupId: '' })

export function PurchaseFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = !id
  const seededNeed = useRef(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [vendorId, setVendorId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine()])
  const [error, setError] = useState('')

  const vendors = useQuery({
    queryKey: ['vendors', ''],
    queryFn: () => api<Contact[]>('/api/contacts?role=supplier'),
  })
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const taxes = useQuery({ queryKey: ['taxes'], queryFn: () => api<Tax[]>('/api/taxes') })
  const groups = useQuery({ queryKey: ['tax-groups'], queryFn: () => api<{ groups: TaxGroupRow[] }>('/api/taxes/company') })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const order = useQuery({
    queryKey: ['purchase', id],
    queryFn: () => api<PurchaseOrder>(`/api/purchases/${id}`),
    enabled: !isNew,
  })

  const defaultTaxId = taxIdForCompany(taxes.data, me.data?.company.defaultTaxRate)

  useEffect(() => {
    if (!order.data) return
    setVendorId(String(order.data.vendorId))
    setWarehouseId(order.data.warehouseId ? String(order.data.warehouseId) : '')
    setLines(
      (order.data.lines ?? []).map((line) => ({
        productId: String(line.productId),
        quantity: String(line.quantity),
        unitCost: String(line.unitCost),
        taxId: line.taxId ? String(line.taxId) : '',
        taxGroupId: line.taxGroupId ? String(line.taxGroupId) : '',
      })),
    )
  }, [order.data])

  useEffect(() => {
    if (!isNew || seededNeed.current || !products.data || !defaultTaxId) return
    const need = params.get('need')
    if (!need) return
    const next = need.split(',').flatMap((part) => {
      const [idText, qtyText] = part.split(':')
      const productId = Number(idText)
      const quantity = Number(qtyText)
      const product = products.data?.find((item) => item.id === productId)
      if (!product || !(quantity > 0)) return []
      return [{ productId: String(productId), quantity: String(quantity), unitCost: String(product.costPrice), taxId: String(defaultTaxId), taxGroupId: '' }]
    })
    if (next.length === 0) return
    seededNeed.current = true
    setLines(next)
  }, [defaultTaxId, isNew, params, products.data])

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
      const group = groups.data?.groups.find((item) => item.id === Number(line.taxGroupId))
      const base = roundMoney((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))
      if (group) {
        const result = computeTaxes(base, Number(line.quantity) || 0, group.lines.filter((item) => item.tax.active).map((item) => ({
          id: item.tax.id,
          name: item.tax.name,
          kind: item.tax.kind === 'fixed' ? 'fixed' as const : 'percent' as const,
          amount: item.tax.amount,
          priceInclude: item.tax.priceInclude,
          compound: item.tax.compound,
          withholding: item.tax.withholding,
          sequence: item.tax.sequence,
        })))
        return { subtotal: result.net, taxAmount: result.added, total: result.total }
      }
      const tax = taxes.data?.find((item) => item.id === Number(line.taxId))
      return lineAmounts({
        quantity: Number(line.quantity) || 0,
        unitPrice: Number(line.unitCost) || 0,
        discount: 0,
        taxRate: tax?.rate ?? 0,
      })
    })
    const totals = sumLines(priced.map((line) => ({ subtotal: line.subtotal, taxAmount: line.taxAmount })))
    const due = roundMoney(priced.reduce((sum, line) => sum + line.total, 0))
    return { ...totals, amountTotal: lines.some((line) => line.taxGroupId) ? due : totals.amountTotal }
  }, [lines, taxes.data, groups.data])

  const previewRate = singleTaxRate(
    lines.map((line) => taxes.data?.find((item) => item.id === Number(line.taxId))?.rate ?? null),
  )

  const save = useMutation({
    mutationFn: () =>
      api<PurchaseOrder>(isNew ? '/api/purchases' : `/api/purchases/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify({
          vendorId: Number(vendorId),
          warehouseId: Number(warehouseId),
          lines: lines.map((line) => ({
            productId: Number(line.productId),
            quantity: Number(line.quantity),
            unitCost: Number(line.unitCost),
            taxId: line.taxGroupId ? null : line.taxId ? Number(line.taxId) : null,
            taxGroupId: line.taxGroupId ? Number(line.taxGroupId) : null,
          })),
        }),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['purchases'] })
      navigate(`/purchases/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('purchase.saveFailed')),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('purchase.loading')}</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  if (order.data && !['draft', 'sent'].includes(order.data.state)) {
    return (
      <p className="text-sm">
        {t('purchase.locked')} <Link className="underline" to={`/purchases/${id}`}>{t('purchase.back')}</Link>
      </p>
    )
  }

  const offered = products.data?.filter((product) => product.active && product.purchasable) ?? []

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
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? t('purchase.newTitle') : order.data?.name}</h1>
        <p className="mt-1 text-muted-foreground">{t('purchase.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
      <Field label={t('purchase.vendor')}>
        <select className="h-10 max-w-md rounded-md border border-border bg-card px-3" value={vendorId} onChange={(event) => setVendorId(event.target.value)} required>
          <option value="">{t('purchase.chooseVendor')}</option>
          {vendors.data?.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
          ))}
        </select>
      </Field>
      <WarehouseField
        label={t('purchase.warehouse')}
        value={warehouseId}
        onChange={setWarehouseId}
        warehouses={warehouses.data}
        choose={t('stock.chooseWarehouse')}
      />
      </div>
      <BaseCurrencyNote />
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">{t('purchase.product')}</th>
              <th className="px-3 py-3 font-medium">{t('purchase.colQty')}</th>
              <th className="px-3 py-3 font-medium"><BaseMoneyLabel text={t('purchase.cost')} /></th>
              <th className="px-3 py-3 font-medium">{t('purchase.tax')}</th>
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
                      const productId = event.target.value
                      const product = offered.find((item) => item.id === Number(productId))
                      const next = [...lines]
                      next[index] = {
                        ...line,
                        productId,
                        unitCost: product ? String(product.costPrice) : line.unitCost,
                        taxId: line.taxId || (defaultTaxId ? String(defaultTaxId) : ''),
                      }
                      setLines(next)
                      if (product) void applyQuote(index, product.id, Number(line.quantity) || 1, next)
                    }}
                  >
                    <option value="">{t('common.choose')}</option>
                    {offered.map((product) => (
                      <option key={product.id} value={product.id}>{product.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2"><Input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => {
                  updateLine(index, { quantity: event.target.value })
                  if (line.productId) void applyQuote(index, Number(line.productId), Number(event.target.value) || 1)
                }} /></td>
                <td className="px-3 py-2"><Input type="number" min="0" step="0.01" value={line.unitCost} onChange={(event) => updateLine(index, { unitCost: event.target.value })} /></td>
                <td className="px-3 py-2">
                  <div className="grid gap-1">
                    <select className="h-10 w-full rounded-md border border-border bg-background px-2" value={line.taxId} onChange={(event) => updateLine(index, { taxId: event.target.value, taxGroupId: '' })}>
                      <option value="">{t('purchase.noTax')}</option>
                      {taxes.data?.map((tax) => (
                        <option key={tax.id} value={tax.id}>{tax.name} ({tax.rate}%)</option>
                      ))}
                    </select>
                    <select className="h-10 w-full rounded-md border border-border bg-background px-2" aria-label={t('acct.taxTemplate')} value={line.taxGroupId} onChange={(event) => updateLine(index, { taxGroupId: event.target.value, taxId: event.target.value ? '' : line.taxId })}>
                      <option value="">{t('acct.taxTemplate')}</option>
                      {groups.data?.groups.map((group) => (
                        <option key={group.id} value={group.id}>{group.name}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>{t('common.remove')}</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Button type="button" variant="outline" onClick={() => setLines([...lines, blankLine(defaultTaxId ? String(defaultTaxId) : '')])}>{t('purchase.addLine')}</Button>
        <MoneyTotals untaxed={preview.amountUntaxed} tax={preview.amountTax} total={preview.amountTotal} rate={previewRate} />
      </div>
      <FapiaoNote />
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('purchase.save')}</Button>
        <Link to={isNew ? '/purchases' : `/purchases/${id}`}><Button type="button" variant="outline">{t('common.cancel')}</Button></Link>
      </div>
    </form>
  )

  function applyQuote(index: number, productId: number, quantity: number, base?: DraftLine[]) {
    void quotePrice({
      side: 'purchase',
      productId,
      quantity,
      vendorId: vendorId ? Number(vendorId) : null,
    }).then((quote) => {
      setLines((current) => {
        const source = base ?? current
        const row = source[index]
        if (!row || Number(row.productId) !== productId) return current
        const next = [...source]
        next[index] = { ...row, unitCost: String(quote.unitPrice) }
        return next
      })
    }).catch(() => undefined)
  }

  function updateLine(index: number, patch: Partial<DraftLine>) {
    const next = [...lines]
    const current = next[index]
    if (!current) return
    next[index] = { ...current, ...patch }
    setLines(next)
  }
}
