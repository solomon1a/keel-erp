import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Line = { percent: string; days: string }

type Term = {
  id: number
  name: string
  lines: Array<{ id: number; sequence: number; percent: number; days: number }>
}

function message(reason: unknown, fallback: string) {
  return reason instanceof ApiError ? reason.message : fallback
}

function blankLine(): Line {
  return { percent: '100', days: '0' }
}

export function PaymentTermsPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [lines, setLines] = useState<Line[]>([blankLine()])
  const terms = useQuery({ queryKey: ['payment-terms'], queryFn: () => api<Term[]>('/api/payment-terms') })
  const create = useMutation({
    mutationFn: () => api('/api/payment-terms', {
      method: 'POST',
      body: JSON.stringify({
        name,
        lines: lines.map((line) => ({ percent: Number(line.percent), days: Number(line.days) })),
      }),
    }),
    onSuccess: async () => {
      setName('')
      setLines([blankLine()])
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['payment-terms'] })
    },
    onError: (reason) => setError(message(reason, t('desk.failed'))),
  })

  function onCreate(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('phase.terms')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('phase.termsLead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <form className="grid gap-3 rounded-lg border border-border bg-card p-4" onSubmit={onCreate}>
        <h2 className="font-serif text-2xl">{t('phase.newTerm')}</h2>
        <Field label={t('phase.listName')}>
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <LineEditor lines={lines} onChange={setLines} />
        <div>
          <Button type="submit" disabled={create.isPending}>{t('phase.newTerm')}</Button>
        </div>
      </form>
      {terms.isLoading ? <p className="text-sm text-muted-foreground">{t('order.loading')}</p> : null}
      {terms.isError ? <Notice message={terms.error.message} /> : null}
      {terms.data && terms.data.length === 0 ? <EmptyState title={t('phase.termsEmpty')} body={t('phase.termsLead')} /> : null}
      <div className="grid gap-4">
        {terms.data?.map((term) => (
          <TermCard key={term.id} term={term} onError={setError} />
        ))}
      </div>
    </div>
  )
}

function LineEditor({ lines, onChange }: { lines: Line[]; onChange: (lines: Line[]) => void }) {
  const { t } = useI18n()
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold">{t('phase.lines')}</p>
      {lines.map((line, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label={t('phase.percent')}>
            <Input value={line.percent} onChange={(event) => onChange(lines.map((row, rowIndex) => rowIndex === index ? { ...row, percent: event.target.value } : row))} />
          </Field>
          <Field label={t('phase.days')}>
            <Input value={line.days} onChange={(event) => onChange(lines.map((row, rowIndex) => rowIndex === index ? { ...row, days: event.target.value } : row))} />
          </Field>
          <Button type="button" variant="outline" onClick={() => onChange(lines.filter((_, rowIndex) => rowIndex !== index))} disabled={lines.length === 1}>
            {t('phase.remove')}
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" onClick={() => onChange([...lines, { percent: '', days: '0' }])}>{t('phase.addLine')}</Button>
      </div>
    </div>
  )
}

function TermCard({ term, onError }: { term: Term; onError: (message: string) => void }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [name, setName] = useState(term.name)
  const [lines, setLines] = useState<Line[]>(term.lines.map((line) => ({ percent: String(line.percent), days: String(line.days) })))
  useEffect(() => {
    setName(term.name)
    setLines(term.lines.map((line) => ({ percent: String(line.percent), days: String(line.days) })))
  }, [term])
  const save = useMutation({
    mutationFn: () => api(`/api/payment-terms/${term.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name,
        lines: lines.map((line) => ({ percent: Number(line.percent), days: Number(line.days) })),
      }),
    }),
    onSuccess: async () => {
      onError('')
      await queryClient.invalidateQueries({ queryKey: ['payment-terms'] })
    },
    onError: (reason) => onError(message(reason, t('desk.failed'))),
  })

  return (
    <form className="keel-glass grid gap-3 rounded-[28px] p-5" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
      <Field label={t('phase.listName')}>
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <LineEditor lines={lines} onChange={setLines} />
      <div>
        <Button type="submit" disabled={save.isPending}>{t('phase.saveTerm')}</Button>
      </div>
    </form>
  )
}
