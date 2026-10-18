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

type Method = 'straight_line' | 'declining'
type AssetState = 'open' | 'disposed' | 'sold'
type LineState = 'draft' | 'posted' | 'cancel'

type JournalLine = { debit: number; credit: number; label: string; account: { code: string; name: string } }

type AssetLine = {
  id: number
  date: string
  amount: number
  state: string
  entry: { id: number; name: string; date: string; lines: JournalLine[] } | null
}

type Asset = {
  id: number
  name: string
  purchaseValue: number
  salvageValue: number
  startDate: string
  method: Method
  months: number
  frequency: 'monthly'
  state: string
  bookValue: number
  postedDepreciation: number
  disposalPrice: number | null
  category: { id: number; name: string }
  lines: AssetLine[]
}

type Category = { id: number; name: string }
type BillLine = { id: number; description: string; subtotal: number; invoice: string; vendor: string }

function methodLabel(method: Method, t: (key: 'assets.method.straight_line' | 'assets.method.declining') => string) {
  switch (method) {
    case 'straight_line':
      return t('assets.method.straight_line')
    case 'declining':
      return t('assets.method.declining')
    default: {
      const unexpected: never = method
      return unexpected
    }
  }
}

function stateLabel(state: AssetState, t: (key: 'assets.state.open' | 'assets.state.disposed' | 'assets.state.sold') => string) {
  switch (state) {
    case 'open':
      return t('assets.state.open')
    case 'disposed':
      return t('assets.state.disposed')
    case 'sold':
      return t('assets.state.sold')
    default: {
      const unexpected: never = state
      return unexpected
    }
  }
}

function lineLabel(state: LineState, t: (key: 'assets.draft' | 'assets.posted' | 'assets.cancelled') => string) {
  switch (state) {
    case 'draft':
      return t('assets.draft')
    case 'posted':
      return t('assets.posted')
    case 'cancel':
      return t('assets.cancelled')
    default: {
      const unexpected: never = state
      return unexpected
    }
  }
}

function asMethod(value: string): Method | null {
  switch (value) {
    case 'straight_line':
    case 'declining':
      return value
    default:
      return null
  }
}

function asAssetState(value: string): AssetState {
  switch (value) {
    case 'open':
    case 'disposed':
    case 'sold':
      return value
    default:
      return 'open'
  }
}

function asLineState(value: string): LineState {
  switch (value) {
    case 'draft':
    case 'posted':
    case 'cancel':
      return value
    default:
      return 'draft'
  }
}

export function AssetsPage() {
  const { id } = useParams()
  const assetId = Number(id)
  if (Number.isInteger(assetId) && assetId > 0) return <AssetDetail id={assetId} />
  return <AssetList />
}

function AssetList() {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const assets = useQuery({ queryKey: ['assets'], queryFn: () => api<Asset[]>('/api/assets') })
  const categories = useQuery({ queryKey: ['asset-categories'], queryFn: () => api<Category[]>('/api/assets/categories') })
  const bills = useQuery({ queryKey: ['asset-bills'], queryFn: () => api<BillLine[]>('/api/assets/bill-lines') })
  const [form, setForm] = useState({
    name: '',
    purchaseValue: '',
    salvageValue: '0',
    start: '2026-05-31',
    method: 'straight_line' as Method,
    months: '60',
    categoryId: '',
    invoiceLineId: '',
  })
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    const method = asMethod(form.method)
    if (!method) {
      setPending(false)
      return
    }
    try {
      const categoryId = form.categoryId ? Number(form.categoryId) : undefined
      if (form.invoiceLineId) {
        await api('/api/assets/from-bill', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            salvageValue: Number(form.salvageValue),
            start: form.start,
            method,
            months: Number(form.months),
            categoryId,
            invoiceLineId: Number(form.invoiceLineId),
          }),
        })
      } else {
        await api('/api/assets', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            purchaseValue: Number(form.purchaseValue),
            salvageValue: Number(form.salvageValue),
            start: form.start,
            method,
            months: Number(form.months),
            categoryId,
          }),
        })
      }
      setForm({ ...form, name: '', purchaseValue: '', invoiceLineId: '' })
      await queryClient.invalidateQueries({ queryKey: ['assets'] })
      await queryClient.invalidateQueries({ queryKey: ['asset-bills'] })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('assets.failed'))
    } finally {
      setPending(false)
    }
  }

  if (assets.isLoading) return <p className="text-sm text-muted-foreground">{t('assets.loading')}</p>
  if (assets.isError) return <Notice message={assets.error.message} />

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('assets.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('assets.lead')}</p>
      </div>
      <div className="grid gap-3">
        {assets.data?.length === 0 ? <p className="text-sm text-muted-foreground">{t('assets.empty')}</p> : null}
        {assets.data?.map((asset) => (
          <Link key={asset.id} to={`/assets/${asset.id}`} className="grid gap-2 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
            <span>
              <span className="font-serif text-2xl">{asset.name}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{asset.category.name} · {methodLabel(asset.method, t)}</span>
            </span>
            <span className="text-sm">{stateLabel(asAssetState(asset.state), t)}</span>
            <span className="text-sm font-medium">{t('assets.book')} {money(asset.bookValue)}</span>
          </Link>
        ))}
      </div>
      <form className="grid gap-4 rounded-lg border border-border bg-card p-4 lg:grid-cols-2" onSubmit={onSubmit}>
        <h2 className="font-serif text-2xl lg:col-span-2">{t('assets.new')}</h2>
        {error ? <div className="lg:col-span-2"><Notice message={error} /></div> : null}
        <BaseCurrencyNote />
        <Field label={t('common.name')}>
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label={t('assets.category')}>
          <Select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
            <option value="">{categories.data?.[0] ? categories.data[0].name : t('assets.none')}</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </Select>
        </Field>
        <Field label={<BaseMoneyLabel text={t('assets.cost')} />}>
          <Input type="number" min="0" step="0.01" value={form.purchaseValue} disabled={Boolean(form.invoiceLineId)} onChange={(event) => setForm({ ...form, purchaseValue: event.target.value })} required={!form.invoiceLineId} />
        </Field>
        <Field label={<BaseMoneyLabel text={t('assets.salvage')} />}>
          <Input type="number" min="0" step="0.01" value={form.salvageValue} onChange={(event) => setForm({ ...form, salvageValue: event.target.value })} required />
        </Field>
        <Field label={t('assets.start')}>
          <Input type="date" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
        </Field>
        <Field label={t('assets.method')}>
          <Select value={form.method} onChange={(event) => { const method = asMethod(event.target.value); if (method) setForm({ ...form, method }) }}>
            <option value="straight_line">{t('assets.method.straight_line')}</option>
            <option value="declining">{t('assets.method.declining')}</option>
          </Select>
        </Field>
        <Field label={t('assets.months')}>
          <Input type="number" min="1" max="600" value={form.months} onChange={(event) => setForm({ ...form, months: event.target.value })} required />
        </Field>
        <Field label={t('assets.frequency')}>
          <Select value="monthly" onChange={() => undefined}>
            <option value="monthly">{t('assets.monthly')}</option>
          </Select>
        </Field>
        <Field label={t('assets.billLine')}>
          <Select value={form.invoiceLineId} onChange={(event) => setForm({ ...form, invoiceLineId: event.target.value })}>
            <option value="">{t('assets.none')}</option>
            {bills.data?.map((line) => (
              <option key={line.id} value={line.id}>{line.invoice} · {line.description}</option>
            ))}
          </Select>
        </Field>
        <div className="lg:col-span-2">
          <Button type="submit" disabled={pending}>{pending ? t('common.saving') : t('assets.create')}</Button>
        </div>
      </form>
    </div>
  )
}

function AssetDetail({ id }: { id: number }) {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const asset = useQuery({ queryKey: ['asset', id], queryFn: () => api<Asset>(`/api/assets/${id}`) })
  const [asOf, setAsOf] = useState('2026-05-31')
  const [price, setPrice] = useState('0')
  const [date, setDate] = useState('2026-05-31')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function run(path: string, body: unknown) {
    setError('')
    setPending(true)
    try {
      await api(path, { method: 'POST', body: JSON.stringify(body) })
      await queryClient.invalidateQueries({ queryKey: ['asset', id] })
      await queryClient.invalidateQueries({ queryKey: ['assets'] })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('assets.failed'))
    } finally {
      setPending(false)
    }
  }

  if (asset.isLoading) return <p className="text-sm text-muted-foreground">{t('assets.loading')}</p>
  if (asset.isError) return <Notice message={asset.error.message} />
  if (!asset.data) return <Notice message={t('assets.failed')} />
  const row = asset.data
  const posted = row.lines.filter((line) => line.state === 'posted')
  const journal = [...posted].reverse().find((line) => line.entry)?.entry ?? null
  const preview = row.lines.filter((line) => line.state !== 'cancel').slice(0, posted.length + 2)
  const hidden = row.lines.filter((line) => line.state !== 'cancel').length - preview.length

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-medium text-primary hover:underline" to="/assets">{t('assets.title')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{row.name}</h1>
        <p className="mt-2 text-muted-foreground">{row.category.name} · {stateLabel(asAssetState(row.state), t)}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="grid gap-4 rounded-lg border border-border bg-card p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">{t('assets.cost')}</dt><dd className="font-medium">{money(row.purchaseValue)}</dd></div>
            <div><dt className="text-muted-foreground">{t('assets.salvage')}</dt><dd className="font-medium">{money(row.salvageValue)}</dd></div>
            <div><dt className="text-muted-foreground">{t('assets.book')}</dt><dd className="font-medium">{money(row.bookValue)}</dd></div>
            <div><dt className="text-muted-foreground">{t('assets.start')}</dt><dd>{row.startDate}</dd></div>
            <div><dt className="text-muted-foreground">{t('assets.method')}</dt><dd>{methodLabel(row.method, t)}</dd></div>
            <div><dt className="text-muted-foreground">{t('assets.months')}</dt><dd>{row.months}</dd></div>
            <div><dt className="text-muted-foreground">{t('assets.frequency')}</dt><dd>{t('assets.monthly')}</dd></div>
          </dl>
          {row.state === 'open' ? (
            <>
              <BaseCurrencyNote />
              <form className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={(event) => { event.preventDefault(); void run(`/api/assets/${id}/post-due`, { asOf }) }}>
                <Field label={t('assets.asOf')}>
                  <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} required />
                </Field>
                <Button type="submit" disabled={pending}>{t('assets.postDue')}</Button>
              </form>
              <form className="grid gap-3 border-t border-border pt-4" onSubmit={(event) => { event.preventDefault(); void run(`/api/assets/${id}/dispose`, { price: Number(price), date }) }}>
                <h2 className="font-serif text-2xl">{t('assets.dispose')}</h2>
                <p className="text-sm text-muted-foreground">{t('assets.scrap')}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={<BaseMoneyLabel text={t('assets.salePrice')} />}>
                    <Input type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} required />
                  </Field>
                  <Field label={t('assets.disposeDate')}>
                    <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                  </Field>
                </div>
                <Button type="submit" variant="secondary" disabled={pending}>{t('assets.dispose')}</Button>
              </form>
            </>
          ) : (
            <p className="text-sm">{t('assets.salePrice')} {money(row.disposalPrice ?? 0)}</p>
          )}
        </section>
        <section className="grid gap-4">
          {journal ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="font-serif text-2xl">{t('assets.journal')} {journal.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{journal.date}</p>
              <table className="mt-3 w-full text-sm">
                <tbody>
                  {journal.lines.map((line) => (
                    <tr key={`${line.account.code}-${line.debit}-${line.credit}`} className="border-t border-border">
                      <td className="py-2">{line.account.code} {line.account.name}</td>
                      <td className="py-2 text-right">{line.debit ? money(line.debit) : ''}</td>
                      <td className="py-2 text-right">{line.credit ? money(line.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-serif text-2xl">{t('assets.schedule')}</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {preview.map((line) => (
                  <tr key={line.id} className="border-t border-border">
                    <td className="py-2">{line.date}</td>
                    <td className="py-2 text-right">{money(line.amount)}</td>
                    <td className="py-2 text-right">{lineLabel(asLineState(line.state), t)}</td>
                    <td className="py-2 text-right">
                      {line.state === 'draft' && row.state === 'open' ? (
                        <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => void run(`/api/assets/${id}/lines/${line.id}/post`, {})}>
                          {t('assets.postLine')}
                        </Button>
                      ) : line.entry?.name ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hidden > 0 ? <p className="mt-2 text-xs text-muted-foreground">{t('assets.later', { count: hidden })}</p> : null}
          </div>
        </section>
      </div>
    </div>
  )
}
