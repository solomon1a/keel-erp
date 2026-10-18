import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BaseMoneyLabel } from '../components/base-currency.tsx'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useBaseCurrency, useMoney, useShortDate } from '../lib/format.ts'
import type { User } from '../lib/types.ts'

type SalaryRow = {
  id: number
  name: string
  jobTitle: string | null
  department: { name: string } | null
  salary: { monthlyGross: number } | null
}

type SlipLine = { id: number; label: string; kind: string; amount: number }

type Payslip = {
  id: number
  gross: number
  deduction: number
  net: number
  employee: { id: number; name: string }
  lines: SlipLine[]
}

type Run = {
  id: number
  name: string
  period: string
  state: string
  payslips: Payslip[]
}

type Claim = {
  id: number
  name: string
  merchant: string
  description: string
  receiptRef: string
  amount: number
  spentOn: string
  state: string
  employee: { id: number; name: string }
}

function payState(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('pay.draft')
    case 'posted':
      return t('pay.posted')
    case 'paid':
      return t('pay.paid')
    case 'submitted':
      return t('pay.submitted')
    case 'approved':
      return t('pay.approved')
    case 'reimbursed':
      return t('pay.reimbursed')
    case 'refused':
      return t('pay.refused')
    default:
      return state
  }
}

function Disclaimer() {
  const { t } = useI18n()
  return <p className="rounded-lg border border-border bg-secondary/40 p-3 text-sm text-muted-foreground">{t('pay.disclaimer')}</p>
}

export function PayrollPage() {
  const { t } = useI18n()
  const money = useMoney()
  const base = useBaseCurrency()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('2026-05')
  const [grosses, setGrosses] = useState<Record<number, string>>({})
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me') })
  const salaries = useQuery({ queryKey: ['salaries'], queryFn: () => api<SalaryRow[]>('/api/payroll/salaries') })
  const runs = useQuery({ queryKey: ['payroll'], queryFn: () => api<Run[]>('/api/payroll') })
  const admin = me.data?.role === 'admin'

  const saveGross = useMutation({
    mutationFn: (employeeId: number) =>
      api(`/api/payroll/salaries/${employeeId}`, {
        method: 'PUT',
        body: JSON.stringify({ monthlyGross: Number(grosses[employeeId]) }),
      }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['salaries'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pay.failed')),
  })
  const createRun = useMutation({
    mutationFn: () => api('/api/payroll', { method: 'POST', body: JSON.stringify({ period }) }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['payroll'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pay.failed')),
  })

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-primary" to="/hr">{t('hr.back')}</Link>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">{t('pay.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('pay.lead')}</p>
      </div>
      <Disclaimer />
      {error ? <Notice message={error} /> : null}
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">{t('pay.salaries')}</h2>
        {salaries.isLoading ? <p className="text-sm text-muted-foreground">{t('pay.loading')}</p> : null}
        {salaries.isError ? <Notice message={salaries.error.message} /> : null}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {salaries.data?.map((row) => {
                const shown = grosses[row.id] ?? (row.salary ? String(row.salary.monthlyGross) : '')
                return (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-muted-foreground">{row.jobTitle ?? row.department?.name ?? t('hr.none')}</div>
                    </td>
                    <td className="px-4 py-3">
                      {admin ? (
                        <form
                          className="flex flex-wrap items-center gap-2"
                          onSubmit={(event) => {
                            event.preventDefault()
                            saveGross.mutate(row.id)
                          }}
                        >
                          <Input
                            className="max-w-[140px]"
                            inputMode="decimal"
                            value={shown}
                            onChange={(event) => setGrosses({ ...grosses, [row.id]: event.target.value })}
                            required
                            aria-label={`${t('pay.gross')} (${base})`}
                          />
                          <Button type="submit" size="sm" disabled={saveGross.isPending}>{t('pay.saveGross')}</Button>
                        </form>
                      ) : (
                        <span>{row.salary ? money(row.salary.monthlyGross) : t('pay.noSalary')}</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">{t('pay.runs')}</h2>
        {runs.isLoading ? <p className="text-sm text-muted-foreground">{t('pay.loading')}</p> : null}
        {runs.data && runs.data.length === 0 ? <EmptyState title={t('pay.empty')} body={t('pay.lead')} /> : null}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {runs.data?.map((run) => {
                const gross = run.payslips.reduce((sum, slip) => sum + slip.gross, 0)
                const net = run.payslips.reduce((sum, slip) => sum + slip.net, 0)
                return (
                  <tr key={run.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <Link className="font-semibold hover:underline" to={`/hr/payroll/${run.id}`}>{run.name}</Link>
                      <div className="text-muted-foreground">{run.period}</div>
                    </td>
                    <td className="px-4 py-3">{payState(run.state, t)}</td>
                    <td className="px-4 py-3">{money(gross)}</td>
                    <td className="px-4 py-3">{money(net)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            createRun.mutate()
          }}
        >
          <Field label={t('pay.period')}>
            <Input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={createRun.isPending}>{t('pay.create')}</Button>
        </form>
      </section>
    </div>
  )
}

export function PayrollRunPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me') })
  const run = useQuery({ queryKey: ['payroll', id], queryFn: () => api<Run>(`/api/payroll/${id}`) })
  const admin = me.data?.role === 'admin'

  async function refresh() {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['payroll'] })
    await queryClient.invalidateQueries({ queryKey: ['payroll', id] })
  }

  const post = useMutation({
    mutationFn: () => api(`/api/payroll/${id}/post`, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pay.failed')),
  })
  const pay = useMutation({
    mutationFn: () => api(`/api/payroll/${id}/pay`, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pay.failed')),
  })

  if (run.isLoading) return <p className="text-sm text-muted-foreground">{t('pay.loading')}</p>
  if (run.isError) return <Notice message={run.error.message} />
  const row = run.data
  if (!row) return null

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-primary" to="/hr/payroll">{t('pay.back')}</Link>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">{row.name}</h1>
        <p className="mt-1 text-muted-foreground">{row.period} · {payState(row.state, t)}</p>
      </div>
      <Disclaimer />
      {error ? <Notice message={error} /> : null}
      {admin && row.state === 'draft' ? <Button onClick={() => post.mutate()} disabled={post.isPending}>{t('pay.post')}</Button> : null}
      {admin && row.state === 'posted' ? <Button onClick={() => pay.mutate()} disabled={pay.isPending}>{t('pay.pay')}</Button> : null}
      {row.payslips.map((slip) => (
        <section key={slip.id} className="grid gap-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-2xl">{slip.employee.name}</h2>
            <p className="text-sm text-muted-foreground">{t('pay.net')} {money(slip.net)}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <tbody>
                {slip.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="py-2">{line.label}</td>
                    <td className="py-2 text-right">{money(line.amount)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold">{t('pay.deduction')}</td>
                  <td className="py-2 text-right font-semibold">{money(slip.deduction)}</td>
                </tr>
                <tr>
                  <td className="py-2 font-semibold">{t('pay.net')}</td>
                  <td className="py-2 text-right font-semibold">{money(slip.net)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  )
}

export function ExpensesPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ employeeId: '', merchant: '', description: '', receiptRef: '', amount: '', spentOn: '' })
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me') })
  const people = useQuery({ queryKey: ['salaries'], queryFn: () => api<SalaryRow[]>('/api/payroll/salaries') })
  const claims = useQuery({ queryKey: ['expenses'], queryFn: () => api<Claim[]>('/api/expenses') })
  const admin = me.data?.role === 'admin'

  const submit = useMutation({
    mutationFn: () =>
      api('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          employeeId: Number(form.employeeId),
          merchant: form.merchant,
          description: form.description,
          receiptRef: form.receiptRef,
          amount: Number(form.amount),
          spentOn: form.spentOn,
        }),
      }),
    onSuccess: async () => {
      setForm({ employeeId: '', merchant: '', description: '', receiptRef: '', amount: '', spentOn: '' })
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pay.failed')),
  })
  const act = useMutation({
    mutationFn: ({ claimId, action }: { claimId: number; action: 'approve' | 'refuse' | 'reimburse' }) =>
      api(`/api/expenses/${claimId}/${action}`, { method: 'POST' }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pay.failed')),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit.mutate()
  }

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-primary" to="/hr">{t('hr.back')}</Link>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">{t('pay.expenses')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('pay.expenseLead')}</p>
      </div>
      <Disclaimer />
      <p className="text-sm text-muted-foreground">{t('pay.receiptNote')}</p>
      {error ? <Notice message={error} /> : null}
      {claims.isLoading ? <p className="text-sm text-muted-foreground">{t('pay.loading')}</p> : null}
      {claims.isError ? <Notice message={claims.error.message} /> : null}
      {claims.data && claims.data.length === 0 ? <EmptyState title={t('pay.noExpenses')} body={t('pay.expenseLead')} /> : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[720px] text-left text-sm">
          <tbody>
            {claims.data?.map((claim) => (
              <tr key={claim.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-semibold">{claim.name} · {claim.merchant}</div>
                  <div className="text-muted-foreground">{claim.employee.name} · {claim.receiptRef} · {shortDate(claim.spentOn)}</div>
                  <div>{claim.description}</div>
                </td>
                <td className="px-4 py-3">{money(claim.amount)}</td>
                <td className="px-4 py-3">{payState(claim.state, t)}</td>
                <td className="px-4 py-3">
                  {admin && claim.state === 'submitted' ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" onClick={() => act.mutate({ claimId: claim.id, action: 'approve' })}>{t('pay.approve')}</Button>
                      <Button size="sm" variant="outline" onClick={() => act.mutate({ claimId: claim.id, action: 'refuse' })}>{t('pay.refuse')}</Button>
                    </div>
                  ) : null}
                  {admin && claim.state === 'approved' ? (
                    <Button size="sm" onClick={() => act.mutate({ claimId: claim.id, action: 'reimburse' })}>{t('pay.reimburse')}</Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <Field label={t('pay.employee')}>
          <select
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            value={form.employeeId}
            onChange={(event) => setForm({ ...form, employeeId: event.target.value })}
            required
          >
            <option value="">{t('common.choose')}</option>
            {people.data?.map((person) => (
              <option key={person.id} value={person.id}>{person.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('pay.merchant')}>
          <Input value={form.merchant} onChange={(event) => setForm({ ...form, merchant: event.target.value })} required />
        </Field>
        <Field label={t('pay.description')}>
          <Input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} required />
        </Field>
        <Field label={t('pay.receipt')}>
          <Input value={form.receiptRef} onChange={(event) => setForm({ ...form, receiptRef: event.target.value })} required />
        </Field>
        <Field label={<BaseMoneyLabel text={t('pay.amount')} />}>
          <Input inputMode="decimal" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} required />
        </Field>
        <Field label={t('pay.spent')}>
          <Input type="date" value={form.spentOn} onChange={(event) => setForm({ ...form, spentOn: event.target.value })} required />
        </Field>
        <div className="sm:col-span-2">
          <Button type="submit" disabled={submit.isPending}>{t('pay.submit')}</Button>
        </div>
      </form>
    </div>
  )
}
