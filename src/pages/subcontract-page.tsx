import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BaseCurrencyNote, BaseMoneyLabel } from '../components/base-currency.tsx'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'

type Order = {
  id: number
  name: string
  state: string
  quantity: number
  received: number
  fee: number
  vendor: { id: number; name: string }
  product: { id: number; name: string; sku: string }
  location: { id: number; name: string }
  lines: Array<{ id: number; productId: number; name: string; sku: string; perUnit: number; sent: number; consumed: number; onHand: number }>
  stock: Array<{ productId: number; name: string; sku: string; quantity: number }>
  receipts: Array<{ id: number; quantity: number; componentCost: number; fee: number; date: string }>
}

type Stock = Array<{ id: number; name: string; vendor: { name: string } | null; lines: Array<{ name: string; sku: string; quantity: number }> }>
type Vendor = { id: number; name: string; isSupplier?: boolean }
type Bom = { id: number; active: boolean; product: { id: number; name: string; sku: string } }

export function SubcontractPage() {
  const { id } = useParams()
  const orderId = Number(id)
  if (Number.isInteger(orderId) && orderId > 0) return <SubcontractDetail id={orderId} />
  return <SubcontractList />
}

function SubcontractList() {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const orders = useQuery({ queryKey: ['subcontracts'], queryFn: () => api<Order[]>('/api/subcontracting') })
  const stock = useQuery({ queryKey: ['subcontract-stock'], queryFn: () => api<Stock>('/api/subcontracting/stock') })
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: () => api<Vendor[]>('/api/contacts?role=supplier') })
  const boms = useQuery({ queryKey: ['boms'], queryFn: () => api<Bom[]>('/api/boms') })
  const [form, setForm] = useState({ vendorId: '', bomId: '', quantity: '1', fee: '0' })
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const activeBoms = boms.data?.filter((bom) => bom.active) ?? []
  const chosen = activeBoms.find((bom) => String(bom.id) === form.bomId)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!chosen) return
    setError('')
    setPending(true)
    try {
      await api('/api/subcontracting', {
        method: 'POST',
        body: JSON.stringify({
          vendorId: Number(form.vendorId),
          productId: chosen.product.id,
          bomId: chosen.id,
          quantity: Number(form.quantity),
          fee: Number(form.fee),
        }),
      })
      setForm({ ...form, quantity: '1', fee: '0' })
      await queryClient.invalidateQueries({ queryKey: ['subcontracts'] })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('sub.failed'))
    } finally {
      setPending(false)
    }
  }

  if (orders.isLoading) return <p className="text-sm text-muted-foreground">{t('sub.loading')}</p>
  if (orders.isError) return <Notice message={orders.error.message} />

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
      <div className="grid gap-6">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('sub.title')}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t('sub.lead')}</p>
        </div>
        {orders.data?.length === 0 ? <p className="text-sm text-muted-foreground">{t('sub.empty')}</p> : null}
        <div className="grid gap-3">
          {orders.data?.map((order) => (
            <Link key={order.id} to={`/subcontracting/${order.id}`} className="grid gap-1 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_auto]">
              <span>
                <span className="font-serif text-2xl">{order.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{order.vendor.name} · {order.product.name}</span>
              </span>
              <span className="text-sm">{order.received} / {order.quantity} · {money(order.fee)}</span>
            </Link>
          ))}
        </div>
        <form className="grid gap-4 rounded-lg border border-border bg-card p-4" onSubmit={onSubmit}>
          <h2 className="font-serif text-2xl">{t('sub.new')}</h2>
          {error ? <Notice message={error} /> : null}
          <BaseCurrencyNote />
          <Field label={t('sub.vendor')}>
            <Select value={form.vendorId} required onChange={(event) => setForm({ ...form, vendorId: event.target.value })}>
              <option value="">{t('assets.none')}</option>
              {vendors.data?.map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
            </Select>
          </Field>
          <Field label={t('sub.bom')}>
            <Select value={form.bomId} required onChange={(event) => setForm({ ...form, bomId: event.target.value })}>
              <option value="">{t('assets.none')}</option>
              {activeBoms.map((bom) => <option key={bom.id} value={bom.id}>{bom.product.name}</option>)}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('sub.qty')}>
              <Input type="number" min="0.001" step="0.001" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
            </Field>
            <Field label={<BaseMoneyLabel text={t('sub.fee')} />}>
              <Input type="number" min="0" step="0.01" value={form.fee} onChange={(event) => setForm({ ...form, fee: event.target.value })} required />
            </Field>
          </div>
          <Button type="submit" disabled={pending || !form.vendorId || !chosen}>{pending ? t('common.saving') : t('sub.create')}</Button>
        </form>
      </div>
      <StockCard stock={stock.data} />
    </div>
  )
}

function StockCard({ stock }: { stock: Stock | undefined }) {
  const { t } = useI18n()
  return (
    <aside className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-serif text-2xl">{t('sub.stock')}</h2>
      <div className="mt-3 grid gap-4">
        {stock?.map((location) => (
          <div key={location.id}>
            <p className="font-medium">{location.vendor?.name ?? location.name}</p>
            {location.lines.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : null}
            {location.lines.map((line) => (
              <p key={line.sku} className="text-sm text-muted-foreground">{line.name} · {line.quantity}</p>
            ))}
          </div>
        ))}
      </div>
    </aside>
  )
}

function SubcontractDetail({ id }: { id: number }) {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const order = useQuery({ queryKey: ['subcontract', id], queryFn: () => api<Order>(`/api/subcontracting/${id}`) })
  const stock = useQuery({ queryKey: ['subcontract-stock'], queryFn: () => api<Stock>('/api/subcontracting/stock') })
  const [send, setSend] = useState<Record<number, string>>({})
  const [receive, setReceive] = useState('1')
  const [date, setDate] = useState('2026-05-18')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const open = order.data?.state === 'confirmed' || order.data?.state === 'progress'

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ['subcontract', id] })
    await queryClient.invalidateQueries({ queryKey: ['subcontracts'] })
    await queryClient.invalidateQueries({ queryKey: ['subcontract-stock'] })
  }

  async function onSend(event: FormEvent) {
    event.preventDefault()
    if (!order.data) return
    setError('')
    setPending(true)
    try {
      await api(`/api/subcontracting/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({
          date,
          lines: order.data.lines.map((line) => ({ productId: line.productId, quantity: Number(send[line.productId] || 0) })),
        }),
      })
      setSend({})
      await refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('sub.failed'))
    } finally {
      setPending(false)
    }
  }

  async function onReceive(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      await api(`/api/subcontracting/${id}/receive`, {
        method: 'POST',
        body: JSON.stringify({ date, quantity: Number(receive) }),
      })
      await refresh()
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('sub.failed'))
    } finally {
      setPending(false)
    }
  }

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('sub.loading')}</p>
  if (order.isError) return <Notice message={order.error.message} />
  if (!order.data) return <Notice message={t('sub.failed')} />
  const row = order.data

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-medium text-primary hover:underline" to="/subcontracting">{t('sub.title')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{row.name}</h1>
        <p className="mt-2 text-muted-foreground">{row.vendor.name} · {row.product.name} · {row.state}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.8fr)]">
        <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="text-muted-foreground">{t('sub.ordered')}</dt><dd>{row.quantity}</dd></div>
            <div><dt className="text-muted-foreground">{t('sub.received')}</dt><dd>{row.received}</dd></div>
            <div><dt className="text-muted-foreground">{t('sub.fee')}</dt><dd>{money(row.fee)}</dd></div>
            <div><dt className="text-muted-foreground">{t('sub.stock')}</dt><dd>{row.location.name}</dd></div>
          </dl>
          <form className="grid gap-3" onSubmit={onSend}>
            <h2 className="font-serif text-2xl">{t('sub.send')}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="py-1 font-medium">{t('sub.component')}</th>
                  <th className="py-1 font-medium">{t('sub.sent')}</th>
                  <th className="py-1 font-medium">{t('sub.consumed')}</th>
                  <th className="py-1 font-medium">{t('sub.onHand')}</th>
                  <th className="py-1 font-medium">{t('sub.sendQty')}</th>
                </tr>
              </thead>
              <tbody>
                {row.lines.map((line) => (
                  <tr key={line.id} className="border-t border-border">
                    <td className="py-2">{line.name}</td>
                    <td>{line.sent}</td>
                    <td>{line.consumed}</td>
                    <td>{line.onHand}</td>
                    <td className="py-2">
                      <Input className="h-9" type="number" min="0" step="0.001" value={send[line.productId] ?? ''} disabled={!open} onChange={(event) => setSend({ ...send, [line.productId]: event.target.value })} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {open ? (
              <div className="flex flex-wrap items-end gap-3">
                <Field label={t('sub.date')}>
                  <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                </Field>
                <Button type="submit" disabled={pending}>{t('sub.send')}</Button>
              </div>
            ) : null}
          </form>
          {open ? (
            <form className="grid gap-3 border-t border-border pt-4 sm:grid-cols-[10rem_10rem_auto] sm:items-end" onSubmit={onReceive}>
              <h2 className="font-serif text-2xl sm:col-span-3">{t('sub.receive')}</h2>
              <Field label={t('sub.receiveQty')}>
                <Input type="number" min="0.001" step="0.001" value={receive} onChange={(event) => setReceive(event.target.value)} required />
              </Field>
              <Field label={t('sub.date')}>
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              </Field>
              <Button type="submit" variant="secondary" disabled={pending}>{t('sub.receive')}</Button>
            </form>
          ) : null}
          <div>
            <h2 className="font-serif text-2xl">{t('sub.receipts')}</h2>
            {row.receipts.map((receipt) => (
              <p key={receipt.id} className="mt-1 text-sm text-muted-foreground">
                {receipt.date} · {receipt.quantity} · {money(receipt.componentCost + receipt.fee)}
              </p>
            ))}
          </div>
        </section>
        <StockCard stock={stock.data?.filter((location) => location.id === row.location.id)} />
      </div>
    </div>
  )
}
