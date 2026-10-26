import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { PageHeader, Panel } from '../components/surface.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { Contact } from '../lib/types.ts'

type SeriesRow = { document: string; prefix: string; padding: number; next: number | null; preview: string }
type PaymentRow = {
  id: number
  name: string
  kind: string
  amount: number
  unapplied: number
  state: string
  partner: { id: number; name: string }
}
type TrialRow = { code: string; name: string; debit: number; credit: number; balance: number }
type Trial = { on: string; rows: TrialRow[]; debit: number; credit: number; balanced: boolean }

function messageOf(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}

export function NumberSeriesPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const series = useQuery({ queryKey: ['number-series'], queryFn: () => api<SeriesRow[]>('/api/number-series') })
  const save = useMutation({
    mutationFn: (row: { document: string; prefix: string; padding: number; next: number }) =>
      api('/api/number-series', { method: 'PUT', body: JSON.stringify(row) }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['number-series'] })
    },
    onError: (reason) => setError(messageOf(reason, t('acct.failed'))),
  })
  return (
    <div className="grid gap-6">
      <PageHeader title={t('acct.numbers')} lead={t('acct.numbersLead')} actions={<Link to="/accounting"><Button variant="outline">{t('nav.accounting')}</Button></Link>} />
      {series.isLoading ? <p className="text-sm text-muted-foreground">{t('acct.loading')}</p> : null}
      {series.isError ? <p className="text-sm text-destructive">{series.error.message}</p> : null}
      {error ? <Notice message={error} /> : null}
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2">{t('acct.document')}</th>
                <th className="px-3 py-2">{t('acct.prefix')}</th>
                <th className="px-3 py-2">{t('acct.padding')}</th>
                <th className="px-3 py-2">{t('acct.next')}</th>
                <th className="px-3 py-2">{t('acct.preview')}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {series.data?.map((row) => (
                <SeriesEditor key={row.document} row={row} saving={save.isPending} onSave={(next) => save.mutate(next)} label={t('acct.saveSeries')} />
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}

function SeriesEditor({ row, onSave, saving, label }: { row: SeriesRow; onSave: (row: { document: string; prefix: string; padding: number; next: number }) => void; saving: boolean; label: string }) {
  const [prefix, setPrefix] = useState(row.prefix)
  const [padding, setPadding] = useState(String(row.padding))
  const [next, setNext] = useState(row.next == null ? '' : String(row.next))
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-3 py-2 font-medium">{row.document}</td>
      <td className="px-3 py-2"><Input value={prefix} onChange={(event) => setPrefix(event.target.value)} /></td>
      <td className="px-3 py-2"><Input type="number" min="1" max="8" value={padding} onChange={(event) => setPadding(event.target.value)} /></td>
      <td className="px-3 py-2"><Input type="number" min="0" value={next} onChange={(event) => setNext(event.target.value)} /></td>
      <td className="px-3 py-2 tabular-nums">{row.preview}</td>
      <td className="px-3 py-2">
        <Button type="button" size="sm" variant="outline" disabled={saving || next === ''} onClick={() => onSave({ document: row.document, prefix, padding: Number(padding), next: Number(next) })}>{label}</Button>
      </td>
    </tr>
  )
}

export function PaymentsPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [kind, setKind] = useState<'customer' | 'vendor'>('customer')
  const [partnerId, setPartnerId] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [method, setMethod] = useState('bank')
  const [memo, setMemo] = useState('')
  const [invoiceId, setInvoiceId] = useState('')
  const [allocateAmount, setAllocateAmount] = useState('')
  const payments = useQuery({ queryKey: ['payments'], queryFn: () => api<PaymentRow[]>('/api/payments') })
  const partners = useQuery({ queryKey: ['contacts'], queryFn: () => api<Contact[]>('/api/contacts') })
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['payments'] })
  }
  const create = useMutation({
    mutationFn: () => api('/api/payments', {
      method: 'POST',
      body: JSON.stringify({ kind, partnerId: Number(partnerId), amount: Number(amount), date, method, memo }),
    }),
    onSuccess: async () => {
      setError('')
      setAmount('')
      await refresh()
    },
    onError: (reason) => setError(messageOf(reason, t('acct.failed'))),
  })
  const post = useMutation({
    mutationFn: (id: number) => api(`/api/payments/${id}/post`, { method: 'POST' }),
    onSuccess: refresh,
    onError: (reason) => setError(messageOf(reason, t('acct.failed'))),
  })
  const allocate = useMutation({
    mutationFn: (id: number) => api(`/api/payments/${id}/allocate`, {
      method: 'POST',
      body: JSON.stringify({ invoiceId: Number(invoiceId), amount: Number(allocateAmount) }),
    }),
    onSuccess: refresh,
    onError: (reason) => setError(messageOf(reason, t('acct.failed'))),
  })
  return (
    <div className="grid gap-6">
      <PageHeader title={t('acct.payments')} lead={t('acct.paymentsLead')} actions={<Link to="/accounting"><Button variant="outline">{t('nav.accounting')}</Button></Link>} />
      {error ? <Notice message={error} /> : null}
      <Panel className="grid gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('acct.method')}>
            <select className="h-10 rounded-md border border-border bg-background px-3" value={kind} onChange={(event) => setKind(event.target.value === 'vendor' ? 'vendor' : 'customer')}>
              <option value="customer">{t('acct.customerPayment')}</option>
              <option value="vendor">{t('acct.vendorPayment')}</option>
            </select>
          </Field>
          <Field label={t('acct.partner')}>
            <select className="h-10 rounded-md border border-border bg-background px-3" value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
              <option value="">{t('common.choose')}</option>
              {partners.data?.map((partner) => <option key={partner.id} value={partner.id}>{partner.name}</option>)}
            </select>
          </Field>
          <Field label={t('acct.amount')}><Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field>
          <Field label={t('acct.asOf')}><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          <Field label={t('acct.method')}><Input value={method} onChange={(event) => setMethod(event.target.value)} /></Field>
          <Field label={t('acct.memo')}><Input value={memo} onChange={(event) => setMemo(event.target.value)} /></Field>
        </div>
        <Button type="button" disabled={create.isPending} onClick={() => create.mutate()}>{create.isPending ? t('common.saving') : t('acct.pay')}</Button>
      </Panel>
      {payments.isLoading ? <p className="text-sm text-muted-foreground">{t('acct.loading')}</p> : null}
      {payments.data && payments.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('acct.empty')}</p> : null}
      <div className="grid gap-3">
        {payments.data?.map((payment) => (
          <Panel key={payment.id} className="grid gap-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold">{payment.name} · {payment.partner.name}</p>
              <p className="tabular-nums">{payment.amount} · {t('acct.unapplied')} {payment.unapplied}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {payment.state === 'draft' ? <Button type="button" size="sm" onClick={() => post.mutate(payment.id)}>{t('acct.postPayment')}</Button> : null}
              {payment.state === 'posted' ? (
                <>
                  <Input className="w-28" placeholder={t('acct.document')} value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)} />
                  <Input className="w-28" placeholder={t('acct.amount')} value={allocateAmount} onChange={(event) => setAllocateAmount(event.target.value)} />
                  <Button type="button" size="sm" variant="outline" onClick={() => allocate.mutate(payment.id)}>{t('acct.allocate')}</Button>
                </>
              ) : null}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  )
}

export function JournalPage() {
  const { t } = useI18n()
  const [error, setError] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [journal, setJournal] = useState('GEN')
  const [lines, setLines] = useState([{ account: '1002', debit: '', credit: '', label: '' }, { account: '6001', debit: '', credit: '', label: '' }])
  const [saved, setSaved] = useState('')
  const post = useMutation({
    mutationFn: () => api<{ name: string }>('/api/journal-entries', {
      method: 'POST',
      body: JSON.stringify({
        date,
        journal,
        lines: lines.map((line) => ({ account: line.account, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0, label: line.label })),
      }),
    }),
    onSuccess: (entry) => {
      setError('')
      setSaved(entry.name)
    },
    onError: (reason) => setError(messageOf(reason, t('acct.unbalanced'))),
  })
  return (
    <div className="grid gap-6">
      <PageHeader title={t('acct.journal')} lead={t('acct.journalLead')} actions={<Link to="/accounting"><Button variant="outline">{t('nav.accounting')}</Button></Link>} />
      {error ? <Notice message={error} /> : null}
      {saved ? <p className="text-sm">{saved}</p> : null}
      <Panel className="grid gap-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('acct.asOf')}><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          <Field label={t('acct.journal')}><Input value={journal} onChange={(event) => setJournal(event.target.value)} /></Field>
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 sm:grid-cols-4">
            <Input aria-label={t('acct.account')} value={line.account} onChange={(event) => setLines(lines.map((row, rowIndex) => rowIndex === index ? { ...row, account: event.target.value } : row))} />
            <Input aria-label={t('acct.debit')} type="number" min="0" step="0.01" value={line.debit} onChange={(event) => setLines(lines.map((row, rowIndex) => rowIndex === index ? { ...row, debit: event.target.value } : row))} />
            <Input aria-label={t('acct.creditCol')} type="number" min="0" step="0.01" value={line.credit} onChange={(event) => setLines(lines.map((row, rowIndex) => rowIndex === index ? { ...row, credit: event.target.value } : row))} />
            <Input aria-label={t('acct.memo')} value={line.label} onChange={(event) => setLines(lines.map((row, rowIndex) => rowIndex === index ? { ...row, label: event.target.value } : row))} />
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setLines([...lines, { account: '', debit: '', credit: '', label: '' }])}>{t('acct.addLine')}</Button>
          <Button type="button" disabled={post.isPending} onClick={() => post.mutate()}>{post.isPending ? t('common.saving') : t('acct.post')}</Button>
        </div>
      </Panel>
    </div>
  )
}

export function TrialBalancePage() {
  const { t } = useI18n()
  const [on, setOn] = useState(new Date().toISOString().slice(0, 10))
  const report = useQuery({ queryKey: ['trial-balance', on], queryFn: () => api<Trial>(`/api/reports/trial-balance?on=${on}`) })
  return (
    <div className="grid gap-6">
      <PageHeader title={t('acct.trial')} lead={t('acct.trialLead')} actions={<Link to="/accounting"><Button variant="outline">{t('nav.accounting')}</Button></Link>} />
      <Field label={t('acct.asOf')}><Input type="date" value={on} onChange={(event) => setOn(event.target.value)} /></Field>
      {report.isLoading ? <p className="text-sm text-muted-foreground">{t('acct.loading')}</p> : null}
      {report.isError ? <p className="text-sm text-destructive">{report.error.message}</p> : null}
      {report.data ? <p className="text-sm">{report.data.balanced ? t('acct.balanced') : t('acct.unbalanced')}</p> : null}
      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-3 py-2">{t('acct.account')}</th>
                <th className="px-3 py-2 text-right">{t('acct.debit')}</th>
                <th className="px-3 py-2 text-right">{t('acct.creditCol')}</th>
              </tr>
            </thead>
            <tbody>
              {report.data?.rows.map((row) => (
                <tr key={row.code} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">{row.code} {row.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.debit}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.credit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  )
}
