import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

const stages = ['new', 'qualified', 'proposition', 'won', 'lost'] as const

type Activity = {
  id: number
  kind: string
  summary: string
  dueOn: string | null
  done: boolean
}

type Lead = {
  id: number
  name: string
  contactName: string
  email: string | null
  phone: string | null
  expectedRevenue: number
  stage: string
  orderId: number | null
  user: { id: number; name: string } | null
  contact: { id: number; name: string } | null
  activities: Activity[]
}

function stageKey(stage: string): MessageKey {
  switch (stage) {
    case 'new':
      return 'crm.stage.new'
    case 'qualified':
      return 'crm.stage.qualified'
    case 'proposition':
      return 'crm.stage.proposition'
    case 'won':
      return 'crm.stage.won'
    case 'lost':
      return 'crm.stage.lost'
    default:
      return 'crm.stage.new'
  }
}

function kindLabel(kind: string, t: Translate) {
  switch (kind) {
    case 'call':
      return t('crm.kind.call')
    case 'meeting':
      return t('crm.kind.meeting')
    case 'todo':
      return t('crm.kind.todo')
    default:
      return kind
  }
}

function leadBody(lead: Lead, stage: string) {
  return {
    name: lead.name,
    contactName: lead.contactName,
    email: lead.email ?? '',
    phone: lead.phone ?? '',
    expectedRevenue: lead.expectedRevenue,
    stage,
  }
}

export function CrmPage() {
  const { t } = useI18n()
  const money = useMoney()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', contactName: '', email: '', phone: '', expectedRevenue: '' })
  const leads = useQuery({ queryKey: ['leads'], queryFn: () => api<Lead[]>('/api/leads') })
  const create = useMutation({
    mutationFn: () =>
      api<Lead>('/api/leads', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          contactName: form.contactName,
          email: form.email,
          phone: form.phone,
          expectedRevenue: form.expectedRevenue === '' ? 0 : Number(form.expectedRevenue),
        }),
      }),
    onSuccess: async (lead) => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['leads'] })
      navigate(`/crm/${lead.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })
  const move = useMutation({
    mutationFn: ({ lead, stage }: { lead: Lead; stage: string }) =>
      api(`/api/leads/${lead.id}`, { method: 'PATCH', body: JSON.stringify(leadBody(lead, stage)) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['leads'] }),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })

  function onCreate(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('crm.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('crm.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <form onSubmit={onCreate} className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6">
        <Field label={t('crm.name')}>
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label={t('crm.contact')}>
          <Input value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} required />
        </Field>
        <Field label={t('crm.email')}>
          <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
        </Field>
        <Field label={t('crm.phone')}>
          <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
        </Field>
        <Field label={t('crm.revenue')}>
          <Input inputMode="decimal" value={form.expectedRevenue} onChange={(event) => setForm({ ...form, expectedRevenue: event.target.value })} />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={create.isPending} className="w-full">
            {create.isPending ? t('crm.saving') : t('crm.new')}
          </Button>
        </div>
      </form>
      {leads.isLoading ? <p className="text-sm text-muted-foreground">{t('crm.loading')}</p> : null}
      {leads.isError ? <p className="text-sm text-destructive">{leads.error.message}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {stages.map((stage) => {
          const column = leads.data?.filter((lead) => lead.stage === stage) ?? []
          return (
            <section key={stage} className="rounded-lg border border-border bg-secondary/40 p-3">
              <h2 className="mb-3 text-sm font-semibold">{t(stageKey(stage))}</h2>
              {column.length === 0 ? <p className="text-xs text-muted-foreground">{t('crm.empty')}</p> : null}
              <div className="grid gap-2">
                {column.map((lead) => {
                  const index = stages.indexOf(stage)
                  const earlier = index > 0 ? stages[index - 1] : null
                  const later = index < stages.length - 1 ? stages[index + 1] : null
                  return (
                    <article key={lead.id} className="rounded-md border border-border bg-card p-3">
                      <Link className="font-semibold hover:underline" to={`/crm/${lead.id}`}>{lead.name}</Link>
                      <p className="mt-1 text-sm text-muted-foreground">{lead.contactName}</p>
                      <p className="text-sm">{money(lead.expectedRevenue)}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {earlier ? (
                          <Button size="sm" variant="outline" onClick={() => move.mutate({ lead, stage: earlier })}>
                            {t(stageKey(earlier))}
                          </Button>
                        ) : null}
                        {later ? (
                          <Button size="sm" variant="outline" onClick={() => move.mutate({ lead, stage: later })}>
                            {t(stageKey(later))}
                          </Button>
                        ) : null}
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function LeadPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const lead = useQuery({ queryKey: ['lead', id], queryFn: () => api<Lead>(`/api/leads/${id}`) })
  const [draft, setDraft] = useState<Lead | null>(null)
  const current = draft ?? lead.data ?? null
  const [activity, setActivity] = useState({ kind: 'call', summary: '', dueOn: '' })

  async function refresh() {
    setError('')
    setDraft(null)
    await queryClient.invalidateQueries({ queryKey: ['lead', id] })
    await queryClient.invalidateQueries({ queryKey: ['leads'] })
  }

  const save = useMutation({
    mutationFn: () => {
      if (!current) throw new Error('missing')
      return api(`/api/leads/${id}`, { method: 'PATCH', body: JSON.stringify(leadBody(current, current.stage)) })
    },
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })
  const add = useMutation({
    mutationFn: () =>
      api(`/api/leads/${id}/activities`, {
        method: 'POST',
        body: JSON.stringify(activity),
      }),
    onSuccess: () => {
      setActivity({ kind: 'call', summary: '', dueOn: '' })
      void refresh()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })
  const done = useMutation({
    mutationFn: (activityId: number) => api(`/api/leads/${id}/activities/${activityId}/done`, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })
  const convert = useMutation({
    mutationFn: () => api<Lead>(`/api/leads/${id}/convert`, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })

  if (lead.isLoading) return <p className="text-sm text-muted-foreground">{t('crm.loading')}</p>
  if (lead.isError) return <p className="text-sm text-destructive">{lead.error.message}</p>
  if (!current) return null

  function onSave(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link className="text-sm font-semibold text-primary" to="/crm">{t('crm.back')}</Link>
          <h1 className="mt-1 font-serif text-4xl tracking-tight">{current.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {t(stageKey(current.stage))} · {money(current.expectedRevenue)}
            {current.user ? ` · ${current.user.name}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          {current.orderId ? (
            <Link to={`/orders/${current.orderId}`}><Button>{t('crm.quotation')}</Button></Link>
          ) : (
            <Button disabled={convert.isPending || current.stage === 'lost'} onClick={() => convert.mutate()}>
              {convert.isPending ? t('crm.converting') : t('crm.convert')}
            </Button>
          )}
        </div>
      </div>
      {error ? <Notice message={error} /> : null}
      <form onSubmit={onSave} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <Field label={t('crm.name')}>
          <Input value={current.name} onChange={(event) => setDraft({ ...current, name: event.target.value })} required />
        </Field>
        <Field label={t('crm.contact')}>
          <Input value={current.contactName} onChange={(event) => setDraft({ ...current, contactName: event.target.value })} required />
        </Field>
        <Field label={t('crm.email')}>
          <Input value={current.email ?? ''} onChange={(event) => setDraft({ ...current, email: event.target.value })} />
        </Field>
        <Field label={t('crm.phone')}>
          <Input value={current.phone ?? ''} onChange={(event) => setDraft({ ...current, phone: event.target.value })} />
        </Field>
        <Field label={t('crm.revenue')}>
          <Input
            inputMode="decimal"
            value={String(current.expectedRevenue)}
            onChange={(event) => setDraft({ ...current, expectedRevenue: Number(event.target.value) })}
          />
        </Field>
        <Field label={t('crm.stage')}>
          <select
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            value={current.stage}
            onChange={(event) => setDraft({ ...current, stage: event.target.value })}
          >
            {stages.map((stage) => (
              <option key={stage} value={stage}>{t(stageKey(stage))}</option>
            ))}
          </select>
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? t('crm.saving') : t('crm.save')}</Button>
        </div>
      </form>
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">{t('crm.activity')}</h2>
        {current.activities.length === 0 ? <EmptyState title={t('crm.noActivity')} body={t('crm.lead')} /> : null}
        <ul className="grid gap-2">
          {current.activities.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-3">
              <span>
                <span className="font-semibold">{kindLabel(item.kind, t)}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">
                  {item.summary}
                  {item.dueOn ? ` · ${shortDate(item.dueOn)}` : ''}
                </span>
              </span>
              {item.done ? (
                <span className="text-sm text-muted-foreground">{t('crm.done')}</span>
              ) : (
                <Button size="sm" variant="outline" onClick={() => done.mutate(item.id)}>{t('crm.open')}</Button>
              )}
            </li>
          ))}
        </ul>
        <form
          className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            add.mutate()
          }}
        >
          <Field label={t('crm.kind')}>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={activity.kind}
              onChange={(event) => setActivity({ ...activity, kind: event.target.value })}
            >
              <option value="call">{t('crm.kind.call')}</option>
              <option value="meeting">{t('crm.kind.meeting')}</option>
              <option value="todo">{t('crm.kind.todo')}</option>
            </select>
          </Field>
          <Field label={t('crm.summary')}>
            <Input value={activity.summary} onChange={(event) => setActivity({ ...activity, summary: event.target.value })} required />
          </Field>
          <Field label={t('crm.due')}>
            <Input type="date" value={activity.dueOn} onChange={(event) => setActivity({ ...activity, dueOn: event.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={add.isPending} className="w-full">{t('crm.add')}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
