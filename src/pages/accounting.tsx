import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { LanguageSwitcher } from '../components/language-switcher.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

type Invoice = {
  id: number
  name: string
  moveType: string
  state: string
  invoiceDate: string
  amountUntaxed: number
  amountTax: number
  amountTotal: number
  residual: number
  buyerName: string | null
  buyerTaxId: string | null
  buyerAddress: string | null
  fapiaoNumber: string | null
  fapiaoType: string | null
  fapiaoStatus: string
  partner: { name: string }
  lines: Array<{ id: number; description: string; quantity: number; unitPrice: number; taxRate: number; subtotal: number; taxAmount: number }>
  payments: Array<{ id: number; amount: number; method: string; paidAt: string }>
  salesOrder: { name: string } | null
  purchaseOrder: { name: string } | null
  posOrder: { name: string } | null
}

type LedgerRow = {
  id: number
  debit: number
  credit: number
  label: string
  account: { code: string; name: string }
  entry: { name: string; date: string; journal: { code: string } }
}

function stateLabel(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('acct.state.draft')
    case 'posted':
      return t('acct.state.posted')
    case 'paid':
      return t('acct.state.paid')
    case 'cancel':
      return t('acct.state.cancel')
    default:
      return state
  }
}

function typeLabel(moveType: string, t: Translate) {
  switch (moveType) {
    case 'out_invoice':
      return t('acct.type.out_invoice')
    case 'in_invoice':
      return t('acct.type.in_invoice')
    case 'out_refund':
      return t('acct.type.out_refund')
    case 'in_refund':
      return t('acct.type.in_refund')
    default:
      return moveType
  }
}

const filters = [
  ['', 'acct.all'],
  ['out_invoice', 'acct.out'],
  ['in_invoice', 'acct.in'],
  ['out_refund', 'acct.refund'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

export function AccountingPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [moveType, setMoveType] = useState('')
  const invoices = useQuery({
    queryKey: ['invoices', moveType],
    queryFn: () => api<Invoice[]>(`/api/invoices${moveType ? `?moveType=${moveType}` : ''}`),
  })
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('acct.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('acct.lead')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/accounting/ledger"><Button variant="outline">{t('acct.ledger')}</Button></Link>
          <Link to="/accounting/reports"><Button variant="outline">{t('acct.reports')}</Button></Link>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Button key={value || 'all'} size="sm" variant={moveType === value ? 'secondary' : 'outline'} onClick={() => setMoveType(value)}>
            {t(label)}
          </Button>
        ))}
      </div>
      {invoices.isLoading ? <p className="text-sm text-muted-foreground">{t('acct.loading')}</p> : null}
      {invoices.isError ? <p className="text-sm text-destructive">{invoices.error.message}</p> : null}
      {invoices.data && invoices.data.length === 0 ? <EmptyState title={t('acct.empty')} body={t('acct.lead')} /> : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <tbody>
            {invoices.data?.map((invoice) => (
              <tr key={invoice.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3"><Link className="font-semibold hover:underline" to={`/accounting/${invoice.id}`}>{invoice.name}</Link></td>
                <td className="px-4 py-3">{typeLabel(invoice.moveType, t)}</td>
                <td className="px-4 py-3">{invoice.partner.name}</td>
                <td className="px-4 py-3">{stateLabel(invoice.state, t)}</td>
                <td className="px-4 py-3">{shortDate(invoice.invoiceDate)}</td>
                <td className="px-4 py-3">{money(invoice.amountTotal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function InvoicePage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [payAmount, setPayAmount] = useState('')
  const [method, setMethod] = useState('bank')
  const invoice = useQuery({ queryKey: ['invoice', id], queryFn: () => api<Invoice>(`/api/invoices/${id}`) })
  const [fapiao, setFapiao] = useState<{ buyerName: string; buyerTaxId: string; buyerAddress: string; fapiaoNumber: string; fapiaoType: string } | null>(null)
  const form = fapiao ?? {
    buyerName: invoice.data?.buyerName ?? '',
    buyerTaxId: invoice.data?.buyerTaxId ?? '',
    buyerAddress: invoice.data?.buyerAddress ?? '',
    fapiaoNumber: invoice.data?.fapiaoNumber ?? '',
    fapiaoType: invoice.data?.fapiaoType ?? 'electronic',
  }
  const refresh = async () => {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['invoice', id] })
    await queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }
  const act = useMutation({
    mutationFn: (path: string) => api<Invoice>(path, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('acct.failed')),
  })
  const save = useMutation({
    mutationFn: () =>
      api(`/api/invoices/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          buyerName: form.buyerName,
          buyerTaxId: form.buyerTaxId,
          buyerAddress: form.buyerAddress,
          fapiaoNumber: form.fapiaoNumber,
          fapiaoType: form.fapiaoType || null,
        }),
      }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('acct.failed')),
  })
  const pay = useMutation({
    mutationFn: () =>
      api(`/api/invoices/${id}/pay`, {
        method: 'POST',
        body: JSON.stringify({ amount: Number(payAmount), method }),
      }),
    onSuccess: () => {
      setPayAmount('')
      void refresh()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('acct.failed')),
  })
  if (invoice.isLoading) return <p className="text-sm text-muted-foreground">{t('acct.loading')}</p>
  if (invoice.isError) return <p className="text-sm text-destructive">{invoice.error.message}</p>
  const row = invoice.data
  if (!row) return null
  const source = row.salesOrder?.name ?? row.purchaseOrder?.name ?? row.posOrder?.name
  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-primary" to="/accounting">{t('acct.title')}</Link>
        <h1 className="font-serif text-4xl tracking-tight">{row.name}</h1>
        <p className="mt-1 text-muted-foreground">{typeLabel(row.moveType, t)} · {row.partner.name} · {stateLabel(row.state, t)}{source ? ` · ${source}` : ''}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <p className="rounded-md border border-accent/40 bg-card px-4 py-3 text-sm">{t('acct.notSubmitted')}</p>
      <div className="flex flex-wrap gap-2">
        {row.state === 'draft' ? <Button disabled={act.isPending} onClick={() => act.mutate(`/api/invoices/${row.id}/post`)}>{t('acct.post')}</Button> : null}
        {row.state === 'draft' ? <Button variant="destructive" disabled={act.isPending} onClick={() => act.mutate(`/api/invoices/${row.id}/cancel`)}>{t('acct.cancel')}</Button> : null}
        {row.state === 'posted' || row.state === 'paid' ? (
          <Button variant="secondary" disabled={act.isPending} onClick={() => act.mutate(`/api/invoices/${row.id}/credit`)}>{t('acct.credit')}</Button>
        ) : null}
        <Link to={`/accounting/${row.id}/print`} target="_blank"><Button variant="outline">{t('acct.print')}</Button></Link>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <tbody>
            {row.lines.map((line) => (
              <tr key={line.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{line.description}</td>
                <td className="px-4 py-3">{line.quantity}</td>
                <td className="px-4 py-3">{money(line.subtotal)}</td>
                <td className="px-4 py-3">{money(line.taxAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>{t('acct.residual')} {money(row.residual)} / {money(row.amountTotal)}</p>
      {row.state === 'posted' && row.residual > 0 ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event: FormEvent) => {
            event.preventDefault()
            pay.mutate()
          }}
        >
          <Field label={t('acct.amount')}><Input type="number" min="0" step="0.01" value={payAmount} onChange={(event) => setPayAmount(event.target.value)} required /></Field>
          <Field label={t('acct.method')}>
            <select className="h-10 rounded-md border border-border bg-card px-3" value={method} onChange={(event) => setMethod(event.target.value)}>
              <option value="bank">{t('acct.bank')}</option>
              <option value="cash">{t('acct.cash')}</option>
              <option value="wechat">{t('shop.wechat')}</option>
              <option value="alipay">{t('shop.alipay')}</option>
              <option value="card">{t('shop.card')}</option>
            </select>
          </Field>
          <Button type="submit" disabled={pay.isPending}>{t('acct.pay')}</Button>
        </form>
      ) : null}
      <form
        className="grid max-w-xl gap-3"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <Field label={t('acct.buyer')}><Input value={form.buyerName} onChange={(event) => setFapiao({ ...form, buyerName: event.target.value })} /></Field>
        <Field label={t('acct.taxId')}><Input value={form.buyerTaxId} onChange={(event) => setFapiao({ ...form, buyerTaxId: event.target.value })} /></Field>
        <Field label={t('acct.address')}><Input value={form.buyerAddress} onChange={(event) => setFapiao({ ...form, buyerAddress: event.target.value })} /></Field>
        <Field label={t('acct.fapiaoNo')}><Input value={form.fapiaoNumber} onChange={(event) => setFapiao({ ...form, fapiaoNumber: event.target.value })} /></Field>
        <Field label={t('acct.fapiaoType')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={form.fapiaoType} onChange={(event) => setFapiao({ ...form, fapiaoType: event.target.value })}>
            <option value="electronic">{t('acct.electronic')}</option>
            <option value="special">{t('acct.special')}</option>
            <option value="general">{t('acct.general')}</option>
          </select>
        </Field>
        <Button type="submit" variant="outline" disabled={save.isPending}>{t('acct.saveFapiao')}</Button>
      </form>
    </div>
  )
}

export function LedgerPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [account, setAccount] = useState('')
  const rows = useQuery({
    queryKey: ['ledger', account],
    queryFn: () => api<LedgerRow[]>(`/api/ledger${account ? `?account=${account}` : ''}`),
  })
  return (
    <div className="grid gap-4">
      <h1 className="font-serif text-4xl tracking-tight">{t('acct.ledger')}</h1>
      <Field label={t('acct.ledger')}>
        <Input value={account} placeholder="1122" onChange={(event) => setAccount(event.target.value.trim())} />
      </Field>
      {rows.isLoading ? <p className="text-sm text-muted-foreground">{t('acct.loading')}</p> : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <tbody>
            {rows.data?.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">{shortDate(row.entry.date)}</td>
                <td className="px-4 py-3">{row.entry.name}</td>
                <td className="px-4 py-3">{row.account.code} {row.account.name}</td>
                <td className="px-4 py-3">{row.label}</td>
                <td className="px-4 py-3">{money(row.debit)}</td>
                <td className="px-4 py-3">{money(row.credit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function ReportsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const pnl = useQuery({ queryKey: ['pnl'], queryFn: () => api<{ income: number; expense: number; profit: number; accounts: Array<{ code: string; name: string; amount: number }> }>('/api/reports/pnl') })
  const balance = useQuery({ queryKey: ['balance'], queryFn: () => api<{ assets: number; liabilities: number; equity: number; accounts: Array<{ code: string; name: string; amount: number }> }>('/api/reports/balance') })
  const vat = useQuery({ queryKey: ['vat'], queryFn: () => api<{ output: number; input: number; payable: number }>('/api/reports/vat') })
  if (pnl.isLoading || balance.isLoading || vat.isLoading) return <p className="text-sm text-muted-foreground">{t('acct.loading')}</p>
  return (
    <div className="grid gap-8">
      <h1 className="font-serif text-4xl tracking-tight">{t('acct.reports')}</h1>
      <section className="grid gap-2">
        <h2 className="font-serif text-2xl">{t('acct.pnl')}</h2>
        <p>{t('acct.income')} {money(pnl.data?.income ?? 0)}</p>
        <p>{t('acct.expense')} {money(pnl.data?.expense ?? 0)}</p>
        <p className="font-semibold">{t('acct.profit')} {money(pnl.data?.profit ?? 0)}</p>
      </section>
      <section className="grid gap-2">
        <h2 className="font-serif text-2xl">{t('acct.balance')}</h2>
        <p>{t('acct.assets')} {money(balance.data?.assets ?? 0)}</p>
        <p>{t('acct.liabilities')} {money(balance.data?.liabilities ?? 0)}</p>
        <p>{t('acct.equity')} {money(balance.data?.equity ?? 0)}</p>
        <ul className="text-sm text-muted-foreground">
          {balance.data?.accounts.map((row) => <li key={row.code}>{row.code} {row.name} {money(row.amount)}</li>)}
        </ul>
      </section>
      <section className="grid gap-2">
        <h2 className="font-serif text-2xl">{t('acct.vat')}</h2>
        <p>{t('acct.output')} {money(vat.data?.output ?? 0)}</p>
        <p>{t('acct.input')} {money(vat.data?.input ?? 0)}</p>
        <p className="font-semibold">{t('acct.payable')} {money(vat.data?.payable ?? 0)}</p>
        <p className="text-sm text-muted-foreground">{t('acct.notSubmitted')}</p>
      </section>
    </div>
  )
}

export function InvoicePrintPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const invoice = useQuery({ queryKey: ['invoice', id], queryFn: () => api<Invoice>(`/api/invoices/${id}`) })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<{ name: string; city: string }>('/api/settings') })
  if (invoice.isLoading) return <p className="p-8 text-sm">{t('acct.loading')}</p>
  const row = invoice.data
  if (!row) return null
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-black print:p-0">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm">{settings.data?.name}</p>
          <h1 className="font-serif text-3xl">{typeLabel(row.moveType, t)} {row.name}</h1>
        </div>
        <LanguageSwitcher />
      </div>
      <p className="mb-4 border border-black px-3 py-2 text-sm">{t('acct.notSubmitted')}</p>
      <p>{t('acct.buyer')}: {row.buyerName}</p>
      <p>{t('acct.taxId')}: {row.buyerTaxId || '—'}</p>
      <p>{t('acct.address')}: {row.buyerAddress || '—'}</p>
      <p>{t('acct.fapiaoType')}: {row.fapiaoType || '—'}</p>
      <p>{t('acct.fapiaoNo')}: {row.fapiaoNumber || '—'}</p>
      <table className="mt-4 w-full text-left text-sm">
        <tbody>
          {row.lines.map((line) => (
            <tr key={line.id} className="border-t border-black">
              <td className="py-2">{line.description}</td>
              <td>{line.quantity}</td>
              <td>{money(line.subtotal)}</td>
              <td>{money(line.taxAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-4 font-semibold">{money(row.amountTotal)}</p>
    </div>
  )
}
