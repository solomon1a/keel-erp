import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Textarea } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

type Match = { id: number; amount: number; invoice: { name: string } }
type Line = { id: number; lineDate: string; label: string; amount: number; reconciled: number; matches: Match[] }
type Statement = { id: number; name: string; lines: Line[] }
type Locks = { lockDate: string | null; taxLockDate: string | null }

function dateInput(value: string | null) {
  if (!value) return ''
  return value.slice(0, 10)
}

export function StatementsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const statements = useQuery({ queryKey: ['statements'], queryFn: () => api<Statement[]>('/api/bank/statements') })
  const locks = useQuery({ queryKey: ['locks'], queryFn: () => api<Locks>('/api/accounting/locks') })
  const [name, setName] = useState('April bank')
  const [csv, setCsv] = useState('date,label,amount')
  const [error, setError] = useState('')
  const [drafts, setDrafts] = useState<Record<number, { invoiceId: string; amount: string }>>({})
  const [lockDate, setLockDate] = useState<string | null>(null)
  const [taxLockDate, setTaxLockDate] = useState<string | null>(null)

  const importCsv = useMutation({
    mutationFn: () => api<Statement>('/api/bank/statements', { method: 'POST', body: JSON.stringify({ name, csv }) }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['statements'] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const match = useMutation({
    mutationFn: (input: { lineId: number; invoiceId: number; amount: number }) => api(`/api/bank/lines/${input.lineId}/reconcile`, {
      method: 'POST',
      body: JSON.stringify({ invoiceId: input.invoiceId, amount: input.amount }),
    }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['statements'] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const saveLocks = useMutation({
    mutationFn: () => api<Locks>('/api/accounting/locks', {
      method: 'PUT',
      body: JSON.stringify({
        lockDate: (lockDate ?? dateInput(locks.data?.lockDate ?? null)) || null,
        taxLockDate: (taxLockDate ?? dateInput(locks.data?.taxLockDate ?? null)) || null,
      }),
    }),
    onSuccess: (data) => {
      queryClient.setQueryData(['locks'], data)
      setError('')
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })

  function onImport(event: FormEvent) {
    event.preventDefault()
    importCsv.mutate()
  }

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('bank.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('bank.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <form className="grid max-w-3xl gap-3 rounded-lg border border-border bg-card p-4" onSubmit={onImport}>
        <Field label={t('bank.name')}><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label={t('bank.csv')}><Textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={5} required /></Field>
        <div><Button type="submit" disabled={importCsv.isPending}>{t('bank.import')}</Button></div>
      </form>
      {statements.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {(statements.data ?? []).map((statement) => (
        <section key={statement.id} className="grid gap-2">
          <h2 className="font-semibold">{statement.name}</h2>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 font-medium">{t('desk.date')}</th>
                  <th className="px-4 py-2 font-medium">{t('desk.name')}</th>
                  <th className="px-4 py-2 font-medium">{t('bank.amount')}</th>
                  <th className="px-4 py-2 font-medium">{t('bank.open')}</th>
                  <th className="px-4 py-2 font-medium">{t('bank.reconcile')}</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line) => {
                  const open = Math.round((Math.abs(line.amount) - line.reconciled) * 100) / 100
                  const draft = drafts[line.id] ?? { invoiceId: '', amount: String(open) }
                  return (
                    <tr key={line.id} className="border-t border-border">
                      <td className="px-4 py-2">{shortDate(line.lineDate)}</td>
                      <td className="px-4 py-2">
                        <p>{line.label}</p>
                        <p className="text-muted-foreground">{line.matches.map((row) => row.invoice.name).join(', ')}</p>
                      </td>
                      <td className="px-4 py-2">{money(line.amount)}</td>
                      <td className="px-4 py-2">{money(open)}</td>
                      <td className="px-4 py-2">
                        {open > 0.001 ? (
                          <div className="flex flex-wrap gap-2">
                            <Input className="h-8 w-24" aria-label={t('bank.invoice')} value={draft.invoiceId} onChange={(event) => setDrafts({ ...drafts, [line.id]: { ...draft, invoiceId: event.target.value } })} />
                            <Input className="h-8 w-24" aria-label={t('bank.amount')} value={draft.amount} onChange={(event) => setDrafts({ ...drafts, [line.id]: { ...draft, amount: event.target.value } })} />
                            <Button size="sm" onClick={() => match.mutate({ lineId: line.id, invoiceId: Number(draft.invoiceId), amount: Number(draft.amount) })}>{t('bank.reconcile')}</Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      <form className="grid max-w-lg gap-3 rounded-lg border border-border bg-card p-4" onSubmit={(event) => { event.preventDefault(); saveLocks.mutate() }}>
        <h2 className="font-semibold">{t('bank.lock')}</h2>
        <Field label={t('bank.lock')}>
          <Input type="date" value={lockDate ?? dateInput(locks.data?.lockDate ?? null)} onChange={(event) => setLockDate(event.target.value)} />
        </Field>
        <Field label={t('bank.taxLock')}>
          <Input type="date" value={taxLockDate ?? dateInput(locks.data?.taxLockDate ?? null)} onChange={(event) => setTaxLockDate(event.target.value)} />
        </Field>
        <div><Button type="submit">{t('bank.saveLocks')}</Button></div>
      </form>
    </div>
  )
}
