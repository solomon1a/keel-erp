import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select, Textarea } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

type Match = { id: number; amount: number; invoice: { name: string } | null }
type Line = { id: number; lineDate: string; label: string; amount: number; reference: string; reconciled: number; matches: Match[] }
type Statement = { id: number; name: string; lines: Line[] }
type Locks = { lockDate: string | null; taxLockDate: string | null }
type Account = { id: number; name: string; accountCode: string; currency: string }
type Mapping = { date: string; description: string; amount?: string; debit?: string; credit?: string; reference?: string }

const presets: Record<string, Mapping> = {
  signed: { date: 'date', description: 'description', amount: 'amount', reference: 'reference' },
  debit: { date: 'date', description: 'description', debit: 'debit', credit: 'credit', reference: 'reference' },
  keel: { date: 'date', description: 'label', amount: 'amount' },
}

const sampleCsv = `date,description,amount,reference
2026-10-12,Harbor Clinic receipt INV-S2005,7797,INV-S2005
2026-10-11,Milo Park INV-S2003,15820,INV-S2003
2026-10-10,Qingpu Yarn BILL-S2002,-33900,BILL-S2002
2026-10-09,Lin Xiao shop INV0001,97.18,INV0001
2026-10-08,Cedar & Co payment INV-S2001,35708,INV-S2001
2026-10-07,BANK FEE October,-15,FEE-OCT
2026-10-06,Cash drawer transfer,-500,XFER-06
2026-10-13,Harbor Clinic part payment,1000,INV-S2005
`

function dateInput(value: string | null) {
  if (!value) return ''
  return value.slice(0, 10)
}

function headersOf(csv: string) {
  const first = csv.split(/\r?\n/).find((line) => line.trim().length > 0) ?? ''
  return first.split(',').map((cell) => cell.trim()).filter(Boolean)
}

export function StatementsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const statements = useQuery({ queryKey: ['statements'], queryFn: () => api<Statement[]>('/api/bank/statements') })
  const accounts = useQuery({ queryKey: ['bank-accounts'], queryFn: () => api<Account[]>('/api/bank/accounts') })
  const locks = useQuery({ queryKey: ['locks'], queryFn: () => api<Locks>('/api/accounting/locks') })
  const [name, setName] = useState('October bank')
  const [csv, setCsv] = useState(sampleCsv)
  const [preset, setPreset] = useState('signed')
  const [mapping, setMapping] = useState<Mapping>(presets.signed ?? { date: 'date', description: 'description', amount: 'amount' })
  const [accountId, setAccountId] = useState('')
  const [accountName, setAccountName] = useState('Operating account')
  const [error, setError] = useState('')
  const [preview, setPreview] = useState<Array<{ lineDate: string; label: string; amount: number; reference: string }>>([])
  const [lockDate, setLockDate] = useState<string | null>(null)
  const [taxLockDate, setTaxLockDate] = useState<string | null>(null)
  const headers = useMemo(() => headersOf(csv), [csv])

  const importCsv = useMutation({
    mutationFn: () => api<Statement>('/api/bank/statements', {
      method: 'POST',
      body: JSON.stringify({ name, csv, mapping, bankAccountId: accountId ? Number(accountId) : null }),
    }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['statements'] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const previewCsv = useMutation({
    mutationFn: () => api<{ lines: Array<{ lineDate: string; label: string; amount: number; reference: string }> }>('/api/bank/preview', {
      method: 'POST',
      body: JSON.stringify({ csv, mapping }),
    }),
    onSuccess: (data) => {
      setError('')
      setPreview(data.lines)
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const addAccount = useMutation({
    mutationFn: () => api<Account>('/api/bank/accounts', { method: 'POST', body: JSON.stringify({ name: accountName, accountCode: '1002' }) }),
    onSuccess: async (account) => {
      setAccountId(String(account.id))
      await queryClient.invalidateQueries({ queryKey: ['bank-accounts'] })
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

  function choosePreset(value: string) {
    setPreset(value)
    const next = presets[value]
    if (next) setMapping(next)
  }

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
      <form className="grid max-w-3xl gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); addAccount.mutate() }}>
        <h2 className="font-semibold md:col-span-2">{t('bank.accounts')}</h2>
        <Field label={t('bank.account')}><Input value={accountName} onChange={(event) => setAccountName(event.target.value)} required /></Field>
        <div className="self-end"><Button type="submit">{t('bank.addAccount')}</Button></div>
        <ul className="text-sm text-muted-foreground md:col-span-2">
          {(accounts.data ?? []).map((account) => <li key={account.id}>{account.name} · {account.accountCode} · {account.currency}</li>)}
        </ul>
      </form>
      <form className="grid gap-3 rounded-lg border border-border bg-card p-4" data-tour="tour-bank" onSubmit={onImport}>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t('bank.name')}><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
          <Field label={t('bank.account')}>
            <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              <option value="">{t('bank.account')}</option>
              {(accounts.data ?? []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </Select>
          </Field>
          <Field label={t('bank.preset')}>
            <Select value={preset} onChange={(event) => choosePreset(event.target.value)}>
              <option value="signed">{t('bank.preset.signed')}</option>
              <option value="debit">{t('bank.preset.debit')}</option>
              <option value="keel">{t('bank.preset.keel')}</option>
            </Select>
          </Field>
          <p className="self-end text-sm"><a className="underline" href="/sample-bank.csv" download>{t('bank.download')}</a></p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ColumnSelect label={t('bank.mapDate')} headers={headers} value={mapping.date} onChange={(date) => setMapping({ ...mapping, date })} />
          <ColumnSelect label={t('bank.mapDescription')} headers={headers} value={mapping.description} onChange={(description) => setMapping({ ...mapping, description })} />
          <ColumnSelect label={t('bank.mapAmount')} headers={headers} value={mapping.amount ?? ''} onChange={(amount) => setMapping({ ...mapping, amount })} />
          <ColumnSelect label={t('bank.mapDebit')} headers={headers} value={mapping.debit ?? ''} onChange={(debit) => setMapping({ ...mapping, debit })} />
          <ColumnSelect label={t('bank.mapCredit')} headers={headers} value={mapping.credit ?? ''} onChange={(credit) => setMapping({ ...mapping, credit })} />
          <ColumnSelect label={t('bank.mapReference')} headers={headers} value={mapping.reference ?? ''} onChange={(reference) => setMapping({ ...mapping, reference })} />
        </div>
        <Field label={t('bank.csv')}><Textarea value={csv} onChange={(event) => setCsv(event.target.value)} rows={4} required /></Field>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => previewCsv.mutate()}>{t('bank.preview')}</Button>
          <Button type="submit" disabled={importCsv.isPending}>{t('bank.import')}</Button>
        </div>
        {preview.length > 0 ? (
          <ul className="text-sm">
            {preview.map((line, index) => <li key={`${line.reference}-${index}`}>{shortDate(line.lineDate)} · {line.label} · {money(line.amount)} · {line.reference}</li>)}
          </ul>
        ) : null}
      </form>
      {statements.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      <ul className="grid gap-2">
        {(statements.data ?? []).map((statement) => (
          <li key={statement.id}>
            <Link className="block rounded-lg border border-border bg-card px-4 py-3" to={`/accounting/statements/${statement.id}`}>{statement.name} · {statement.lines.length}</Link>
          </li>
        ))}
      </ul>
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

function ColumnSelect({ label, headers, value, onChange }: { label: string; headers: string[]; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="" />
        {headers.map((header) => <option key={header} value={header}>{header}</option>)}
      </Select>
    </Field>
  )
}
