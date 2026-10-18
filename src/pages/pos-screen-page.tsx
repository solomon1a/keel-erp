import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { lineAmounts, roundMoney, sumLines } from '../domain/money.ts'
import { payMethodLabel, posSessionLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { BaseCurrencyNote } from '../components/base-currency.tsx'
import { useBaseCurrency, useMoney } from '../lib/format.ts'
import type { Contact, PosCatalog, PosOrder, PosSession, User } from '../lib/types.ts'

type CartLine = { productId: number; name: string; unitPrice: number; quantity: number; discount: number; onHand: number }
type PayRow = { method: 'cash' | 'card' | 'wechat' | 'alipay'; amount: string; tendered: string }

const methods = ['cash', 'card', 'wechat', 'alipay'] as const

function methodKey(method: PayRow['method']) {
  switch (method) {
    case 'cash':
      return 'pos.addCash' as const
    case 'card':
      return 'pos.addCard' as const
    case 'wechat':
      return 'pos.addWechat' as const
    case 'alipay':
      return 'pos.addAlipay' as const
    default: {
      const unexpected: never = method
      return unexpected
    }
  }
}

export function PosScreenPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useI18n()
  const money = useMoney()
  const base = useBaseCurrency()
  const queryClient = useQueryClient()
  const session = useQuery({ queryKey: ['pos-session', id], queryFn: () => api<PosSession>(`/api/pos/sessions/${id}`) })
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me') })
  const catalog = useQuery({
    queryKey: ['pos-catalog', session.data?.warehouseId],
    queryFn: () => api<PosCatalog>(`/api/pos/catalog?warehouseId=${session.data?.warehouseId}`),
    enabled: Boolean(session.data),
  })
  const customers = useQuery({ queryKey: ['contacts', 'customers'], queryFn: () => api<Contact[]>('/api/contacts?role=customer') })
  const [query, setQuery] = useState('')
  const [barcode, setBarcode] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [customerId, setCustomerId] = useState('')
  const [payments, setPayments] = useState<PayRow[]>([])
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')

  const taxRate = me.data?.company.defaultTaxRate ?? 13
  const totals = useMemo(() => {
    const priced = cart.map((line) => lineAmounts({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discount: line.discount,
      taxRate,
    }))
    return sumLines(priced)
  }, [cart, taxRate])
  const paid = roundMoney(payments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))
  const remaining = roundMoney(totals.amountTotal - paid)

  function addProduct(product: PosCatalog['products'][number]) {
    setError('')
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id)
      if (existing) {
        if (existing.quantity + 1 > product.onHand + 0.0001) return current
        return current.map((line) => line.productId === product.id ? { ...line, quantity: line.quantity + 1, onHand: product.onHand } : line)
      }
      if (product.onHand <= 0) return current
      return [...current, { productId: product.id, name: product.name, unitPrice: product.listPrice, quantity: 1, discount: 0, onHand: product.onHand }]
    })
  }

  const sell = useMutation({
    mutationFn: () =>
      api<PosOrder>('/api/pos/orders', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: Number(id),
          customerId: customerId ? Number(customerId) : null,
          lines: cart.map((line) => ({ productId: line.productId, quantity: line.quantity, discount: line.discount })),
          payments: payments.map((row) => ({
            method: row.method,
            amount: Number(row.amount),
            ...(row.method === 'cash' && row.tendered !== '' ? { tendered: Number(row.tendered) } : {}),
          })),
        }),
      }),
    onSuccess: async (order) => {
      setCart([])
      setPayments([])
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['pos-session', id] })
      await queryClient.invalidateQueries({ queryKey: ['pos-catalog'] })
      await queryClient.invalidateQueries({ queryKey: ['pos-orders'] })
      await queryClient.invalidateQueries({ queryKey: ['stock'] })
      navigate(`/pos/orders/${order.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pos.failed')),
  })

  const close = useMutation({
    mutationFn: () =>
      api(`/api/pos/sessions/${id}/close`, {
        method: 'POST',
        body: JSON.stringify({ closingCash: Number(counted), note }),
      }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['pos-session', id] })
      await queryClient.invalidateQueries({ queryKey: ['pos-sessions'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pos.failed')),
  })

  if (session.isLoading || catalog.isLoading) return <p className="text-sm text-muted-foreground">{t('pos.loading')}</p>
  if (session.isError) return <p className="text-sm text-destructive">{session.error.message}</p>
  const row = session.data
  if (!row) return null
  if (row.state !== 'open') {
    return (
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">{row.warehouse.name}</p>
            <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
          </div>
          <span className="text-sm">{posSessionLabel(row.state, t)}</span>
        </div>
        <Summary session={row} />
      </div>
    )
  }

  const needle = query.trim().toLowerCase()
  const products = (catalog.data?.products ?? []).filter((product) => {
    if (categoryId !== 'all' && String(product.categoryId) !== categoryId) return false
    if (!needle) return true
    return product.name.toLowerCase().includes(needle) || product.sku.toLowerCase().includes(needle) || (product.barcode ?? '').includes(needle)
  })

  function addMethod(method: PayRow['method']) {
    const amount = remaining > 0 ? String(remaining) : ''
    setPayments((current) => [...current, { method, amount, tendered: '' }])
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{row.warehouse.name} · {catalog.data?.location.name}</p>
          <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/pos/orders"><Button variant="outline">{t('pos.ordersLink')}</Button></Link>
          <Link to={`/pos/report?warehouseId=${row.warehouseId}`}><Button variant="outline">{t('pos.reportLink')}</Button></Link>
        </div>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <section className="order-2 grid gap-3 lg:order-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input className="h-12 text-base" placeholder={t('pos.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
            <Input
              className="h-12 text-base"
              placeholder={t('pos.barcode')}
              value={barcode}
              onChange={(event) => setBarcode(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                event.preventDefault()
                const code = barcode.trim()
                const product = catalog.data?.products.find((item) => item.barcode === code)
                if (!product) {
                  setError(t('pos.barcodeMiss'))
                  return
                }
                addProduct(product)
                setBarcode('')
              }}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            <Button type="button" className="h-11 shrink-0" variant={categoryId === 'all' ? 'default' : 'outline'} onClick={() => setCategoryId('all')}>{t('pos.all')}</Button>
            {catalog.data?.categories.map((category) => (
              <Button key={category.id} type="button" className="h-11 shrink-0" variant={categoryId === String(category.id) ? 'default' : 'outline'} onClick={() => setCategoryId(String(category.id))}>
                {category.name}
              </Button>
            ))}
          </div>
          {products.length === 0 ? <p className="text-sm text-muted-foreground">{t('pos.catalogEmpty')}</p> : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  className="min-h-24 rounded-lg border border-border bg-card px-3 py-3 text-left hover:bg-secondary disabled:opacity-50"
                  disabled={product.onHand <= 0}
                  onClick={() => addProduct(product)}
                >
                  <span className="block font-semibold break-words">{product.name}</span>
                  <span className="mt-1 block text-sm">{money(product.listPrice)}</span>
                  <span className="block text-xs text-muted-foreground">{t('pos.onHand')} {product.onHand}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <aside className="order-1 grid content-start gap-3 rounded-lg border border-border bg-card p-4 lg:order-2">
          <h2 className="font-serif text-2xl">{t('pos.cart')}</h2>
          {cart.length === 0 ? <p className="text-sm text-muted-foreground">{t('pos.emptyCart')}</p> : null}
          {cart.map((line) => (
            <div key={line.productId} className="grid gap-2 border-b border-border pb-3">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{line.name}</p>
                <button type="button" className="text-sm text-muted-foreground underline" onClick={() => setCart(cart.filter((item) => item.productId !== line.productId))}>{t('pos.remove')}</button>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" className="h-11 w-11" onClick={() => setCart(cart.flatMap((item) => {
                  if (item.productId !== line.productId) return [item]
                  if (item.quantity <= 1) return []
                  return [{ ...item, quantity: Math.round((item.quantity - 1) * 1000) / 1000 }]
                }))}>−</Button>
                <span className="min-w-8 text-center text-lg">{line.quantity}</span>
                <Button type="button" variant="outline" className="h-11 w-11" onClick={() => addProduct({
                  id: line.productId,
                  name: line.name,
                  sku: '',
                  barcode: null,
                  listPrice: line.unitPrice,
                  categoryId: null,
                  categoryName: null,
                  onHand: line.onHand,
                })}>+</Button>
                <Input
                  className="h-11 w-24"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder={t('pos.discount')}
                  aria-label={t('pos.discount')}
                  value={String(line.discount)}
                  onChange={(event) => setCart(cart.map((item) => item.productId === line.productId ? { ...item, discount: Number(event.target.value) || 0 } : item))}
                />
              </div>
            </div>
          ))}
          <Field label={t('pos.customer')}>
            <select className="h-12 rounded-md border border-border bg-background px-3 text-base" value={customerId} onChange={(event) => setCustomerId(event.target.value)}>
              <option value="">{t('pos.walkIn')}</option>
              {customers.data?.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </Field>
          <p className="text-sm text-muted-foreground">{t('totals.untaxed')} {money(totals.amountUntaxed)}</p>
          <p className="text-sm text-muted-foreground">{t('pos.vat', { rate: taxRate })} {money(totals.amountTax)}</p>
          <p className="text-xl font-semibold">{t('pos.total')} {money(totals.amountTotal)}</p>
          <BaseCurrencyNote />
          <div className="grid grid-cols-2 gap-2">
            {methods.map((method) => (
              <Button key={method} type="button" variant="outline" className="h-11" onClick={() => addMethod(method)}>{t(methodKey(method))}</Button>
            ))}
          </div>
          {payments.map((row, index) => (
            <div key={index} className="grid gap-2 rounded-md border border-border p-2">
              <div className="flex items-center justify-between">
                <span className="font-medium">{payMethodLabel(row.method, t)}</span>
                <button type="button" className="text-sm underline" onClick={() => setPayments(payments.filter((_, rowIndex) => rowIndex !== index))}>{t('pos.remove')}</button>
              </div>
              <Input className="h-11" type="number" min="0" step="0.01" aria-label={`${t('pos.amount')} (${base})`} value={row.amount} onChange={(event) => {
                const next = [...payments]
                next[index] = { ...row, amount: event.target.value }
                setPayments(next)
              }} />
              {row.method === 'cash' ? (
                <Input className="h-11" type="number" min="0" step="0.01" placeholder={`${t('pos.tendered')} (${base})`} aria-label={`${t('pos.tendered')} (${base})`} value={row.tendered} onChange={(event) => {
                  const next = [...payments]
                  next[index] = { ...row, tendered: event.target.value }
                  setPayments(next)
                }} />
              ) : null}
              {row.method === 'cash' && Number(row.tendered) > Number(row.amount) ? (
                <p className="text-sm">{t('pos.change')} {money(roundMoney(Number(row.tendered) - Number(row.amount)))}</p>
              ) : null}
            </div>
          ))}
          <p className="text-sm">{t('pos.remaining')} {money(remaining)}</p>
          <Button className="h-12 text-base" disabled={sell.isPending || cart.length === 0 || Math.abs(remaining) > 0.001} onClick={() => sell.mutate()}>
            {sell.isPending ? t('common.saving') : t('pos.checkout')}
          </Button>
          <div className="mt-2 grid gap-2 border-t border-border pt-3">
            <h3 className="font-semibold">{t('pos.close')}</h3>
            <p className="text-sm text-muted-foreground">{t('pos.expected')} {money(row.summary.expectedCash)}</p>
            <Input className="h-11" type="number" min="0" step="0.01" placeholder={`${t('pos.counted')} (${base})`} aria-label={`${t('pos.counted')} (${base})`} value={counted} onChange={(event) => setCounted(event.target.value)} />
            <Input className="h-11" placeholder={t('pos.note')} value={note} onChange={(event) => setNote(event.target.value)} />
            <Button variant="outline" className="h-11" disabled={close.isPending || counted === ''} onClick={() => close.mutate()}>{t('pos.close')}</Button>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Summary({ session }: { session: PosSession }) {
  const { t } = useI18n()
  const money = useMoney()
  const methods = ['cash', 'card', 'wechat', 'alipay'] as const
  return (
    <div className="grid max-w-xl gap-3 rounded-lg border border-border bg-card p-4">
      <h2 className="font-serif text-2xl">{t('pos.summary')}</h2>
      <p>{t('pos.opening')} {money(session.openingCash)}</p>
      <p>{t('pos.sales')} {money(session.summary.salesTotal)}</p>
      <p>{t('pos.refunds')} {money(session.summary.refundTotal)}</p>
      <p>{t('pos.net')} {money(session.summary.net)}</p>
      <p>{t('pos.expected')} {money(session.summary.expectedCash)}</p>
      <p>{t('pos.counted')} {session.closingCash === null ? '—' : money(session.closingCash)}</p>
      <p>{t('pos.difference')} {session.difference === null ? '—' : money(session.difference)}</p>
      <ul className="grid gap-1 text-sm">
        {methods.map((method) => (
          <li key={method}>{payMethodLabel(method, t)} {money(session.summary.payments[method] ?? 0)} · {t('pos.refunds')} {money(session.summary.refunds[method] ?? 0)}</li>
        ))}
      </ul>
      {session.note ? <p className="text-sm text-muted-foreground">{session.note}</p> : null}
    </div>
  )
}
