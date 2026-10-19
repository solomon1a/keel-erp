import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Kpi, KpiGrid, PageHeader, Panel } from '../components/surface.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Textarea } from '../components/ui/textarea.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useShortDate } from '../lib/format.ts'
import { slaClockParts } from '../lib/sla-clock.ts'

const stages = ['new', 'progress', 'waiting', 'solved', 'closed'] as const
const priorities = ['low', 'normal', 'high', 'urgent'] as const

type Stage = (typeof stages)[number]
type Priority = (typeof priorities)[number]

type Person = { id: number; name: string; email?: string | null }
type Tag = { id: number; name: string }
type Message = { id: number; authorName: string; body: string; internal: boolean; createdAt: string }
type Policy = { id: number; priority: string; hours: number }

type Ticket = {
  id: number
  number: string
  subject: string
  description: string
  priority: Priority
  stage: Stage
  slaDeadline: string | null
  resolvedAt: string | null
  createdAt: string
  breached: boolean
  remainingMs: number | null
  partner: Person
  team: { id: number; name: string } | null
  assignee: Person | null
  tags: Tag[]
  messages: Message[]
}

type Board = {
  tickets: Ticket[]
  teams: { id: number; name: string }[]
  tags: Tag[]
  policies: Policy[]
  users: Person[]
  customers: Person[]
  open: number
  overdue: number
  slaPercent: number
}

const selectClass = 'h-10 w-full rounded-md border border-border bg-card px-3 text-sm'

function stageLabel(stage: Stage, t: Translate) {
  switch (stage) {
    case 'new':
      return t('hd.stage.new')
    case 'progress':
      return t('hd.stage.progress')
    case 'waiting':
      return t('hd.stage.waiting')
    case 'solved':
      return t('hd.stage.solved')
    case 'closed':
      return t('hd.stage.closed')
    default: {
      const unexpected: never = stage
      return unexpected
    }
  }
}

function priorityLabel(priority: Priority, t: Translate) {
  switch (priority) {
    case 'low':
      return t('hd.priority.low')
    case 'normal':
      return t('hd.priority.normal')
    case 'high':
      return t('hd.priority.high')
    case 'urgent':
      return t('hd.priority.urgent')
    default: {
      const unexpected: never = priority
      return unexpected
    }
  }
}

function asStage(value: string): Stage {
  switch (value) {
    case 'new':
    case 'progress':
    case 'waiting':
    case 'solved':
    case 'closed':
      return value
    default:
      return 'new'
  }
}

function asPriority(value: string): Priority {
  switch (value) {
    case 'low':
    case 'normal':
    case 'high':
    case 'urgent':
      return value
    default:
      return 'normal'
  }
}

function useClock() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

function clockText(ms: number, t: Translate) {
  const parts = slaClockParts(ms)
  switch (parts.tone) {
    case 'overdue':
      return t('hd.overdueClock', { hours: parts.hours, minutes: parts.minutes })
    case 'left':
      switch (parts.style) {
        case 'days':
          return t('hd.leftDays', { days: parts.days, hours: parts.hours })
        case 'hours':
          return t('hd.leftHours', { hours: parts.hours, minutes: parts.minutes })
        default: {
          const unexpected: never = parts
          return unexpected
        }
      }
    default: {
      const unexpected: never = parts
      return unexpected
    }
  }
}

function Countdown({ deadline, resolved, breached, t }: { deadline: string | null; resolved: boolean; breached: boolean; t: Translate }) {
  const now = useClock()
  if (!deadline) return <span className="text-muted-foreground">—</span>
  if (resolved) {
    return <Badge tone={breached ? 'refused' : 'approved'}>{breached ? t('hd.breached') : t('hd.met')}</Badge>
  }
  const ms = new Date(deadline).getTime() - now
  return (
    <span className={ms < 0 ? 'font-semibold text-[#B42323]' : 'font-semibold tabular-nums'}>
      {clockText(ms, t)}
    </span>
  )
}

function tagText(tags: Tag[]) {
  return tags.map((tag) => tag.name).join(', ')
}

export function HelpdeskPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const board = useQuery({ queryKey: ['helpdesk'], queryFn: () => api<Board>('/api/helpdesk') })
  const view = params.get('view') === 'kanban' ? 'kanban' : 'list'
  if (board.isLoading) return <p className="text-sm text-muted-foreground">{t('hd.loading')}</p>
  if (board.isError) return <p className="text-sm text-destructive">{board.error.message}</p>
  const data = board.data
  if (!data) return null
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('hd.title')}
        lead={t('hd.lead')}
        actions={
          <>
            <Button variant={view === 'list' ? 'default' : 'outline'} onClick={() => navigate('/helpdesk')}>{t('hd.list')}</Button>
            <Button variant={view === 'kanban' ? 'default' : 'outline'} onClick={() => navigate('/helpdesk?view=kanban')}>{t('hd.kanban')}</Button>
            <Link to="/helpdesk/sla"><Button variant="outline">{t('hd.slaTitle')}</Button></Link>
          </>
        }
      />
      <KpiGrid>
        <Kpi label={t('hd.open')} value={String(data.open)} />
        <Kpi label={t('hd.overdue')} value={String(data.overdue)} />
        <Kpi label={t('hd.sla')} value={`${data.slaPercent}%`} />
      </KpiGrid>
      <NewTicket customers={data.customers} teams={data.teams} users={data.users} />
      {data.tickets.length === 0 ? <EmptyState title={t('hd.empty')} body={t('hd.lead')} /> : null}
      {view === 'kanban' ? <Kanban tickets={data.tickets} /> : <TicketTable tickets={data.tickets} />}
    </div>
  )
}

function TicketTable({ tickets }: { tickets: Ticket[] }) {
  const { t } = useI18n()
  const shortDate = useShortDate()
  if (tickets.length === 0) return null
  return (
    <div className="keel-table overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-border text-left text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t('hd.number')}</th>
            <th className="px-3 py-2 font-medium">{t('hd.subject')}</th>
            <th className="px-3 py-2 font-medium">{t('hd.customer')}</th>
            <th className="px-3 py-2 font-medium">{t('hd.stage')}</th>
            <th className="px-3 py-2 font-medium">{t('hd.priority')}</th>
            <th className="px-3 py-2 font-medium">{t('hd.remaining')}</th>
            <th className="px-3 py-2 font-medium">{t('hd.deadline')}</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket) => (
            <tr key={ticket.id} className="border-b border-border">
              <td className="px-3 py-2">
                <Link className="font-semibold text-primary" to={`/helpdesk/${ticket.id}`}>{ticket.number}</Link>
              </td>
              <td className="px-3 py-2">{ticket.subject}</td>
              <td className="px-3 py-2">{ticket.partner.name}</td>
              <td className="px-3 py-2">{stageLabel(ticket.stage, t)}</td>
              <td className="px-3 py-2">{priorityLabel(ticket.priority, t)}</td>
              <td className="px-3 py-2">
                <Countdown deadline={ticket.slaDeadline} resolved={ticket.resolvedAt !== null} breached={ticket.breached} t={t} />
              </td>
              <td className="px-3 py-2 text-muted-foreground">{ticket.slaDeadline ? shortDate(ticket.slaDeadline) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Kanban({ tickets }: { tickets: Ticket[] }) {
  const { t } = useI18n()
  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {stages.map((stage) => {
        const column = tickets.filter((ticket) => ticket.stage === stage)
        return (
          <section key={stage} className="w-72 shrink-0 rounded-lg border border-border bg-card p-3">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">{stageLabel(stage, t)}</h2>
              <span className="text-sm text-muted-foreground">{column.length}</span>
            </header>
            <div className="grid gap-2">
              {column.map((ticket) => (
                <Link key={ticket.id} to={`/helpdesk/${ticket.id}`} className="rounded-md border border-border bg-background p-3 hover:border-primary">
                  <p className="text-xs text-muted-foreground">{ticket.number} · {ticket.partner.name}</p>
                  <p className="mt-1 font-semibold">{ticket.subject}</p>
                  <p className="mt-2 text-xs">
                    {priorityLabel(ticket.priority, t)}
                    {' · '}
                    <Countdown deadline={ticket.slaDeadline} resolved={ticket.resolvedAt !== null} breached={ticket.breached} t={t} />
                  </p>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function NewTicket({ customers, teams, users }: { customers: Person[]; teams: { id: number; name: string }[]; users: Person[] }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ partnerId: '', subject: '', description: '', teamId: '', assigneeId: '', priority: 'normal', tags: '' })
  const create = useMutation({
    mutationFn: () => api<Ticket>('/api/helpdesk', {
      method: 'POST',
      body: JSON.stringify({
        partnerId: Number(form.partnerId),
        subject: form.subject,
        description: form.description,
        teamId: form.teamId ? Number(form.teamId) : null,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
        priority: form.priority,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      }),
    }),
    onSuccess: async (ticket) => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['helpdesk'] })
      navigate(`/helpdesk/${ticket.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hd.failed')),
  })
  function onSubmit(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }
  return (
    <Panel>
      <form className="grid gap-3 md:grid-cols-2" onSubmit={onSubmit}>
        <h2 className="font-serif text-2xl md:col-span-2">{t('hd.new')}</h2>
        {error ? <div className="md:col-span-2"><Notice message={error} /></div> : null}
        <Field label={t('hd.customer')}>
          <select className={selectClass} value={form.partnerId} required onChange={(event) => setForm({ ...form, partnerId: event.target.value })}>
            <option value="">{t('hd.none')}</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </select>
        </Field>
        <Field label={t('hd.subject')}>
          <Input value={form.subject} required onChange={(event) => setForm({ ...form, subject: event.target.value })} />
        </Field>
        <Field label={t('hd.description')}>
          <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
        </Field>
        <div className="grid gap-3">
          <Field label={t('hd.team')}>
            <select className={selectClass} value={form.teamId} onChange={(event) => setForm({ ...form, teamId: event.target.value })}>
              <option value="">{t('hd.none')}</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </Field>
          <Field label={t('hd.assignee')}>
            <select className={selectClass} value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
              <option value="">{t('hd.none')}</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </Field>
        </div>
        <Field label={t('hd.priority')}>
          <select className={selectClass} value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}>
            {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority, t)}</option>)}
          </select>
        </Field>
        <Field label={t('hd.tags')}>
          <Input value={form.tags} placeholder={t('hd.tagsHint')} onChange={(event) => setForm({ ...form, tags: event.target.value })} />
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" disabled={create.isPending}>{create.isPending ? t('hd.saving') : t('hd.create')}</Button>
        </div>
      </form>
    </Panel>
  )
}

export function TicketPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const ticket = useQuery({ queryKey: ['helpdesk', id], queryFn: () => api<Ticket>(`/api/helpdesk/${id}`) })
  const board = useQuery({ queryKey: ['helpdesk'], queryFn: () => api<Board>('/api/helpdesk') })
  const [draft, setDraft] = useState<Ticket | null>(null)
  const [tags, setTags] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const [reply, setReply] = useState({ body: '', internal: false })
  const current = draft ?? ticket.data ?? null

  useEffect(() => {
    if (ticket.data) setTags(tagText(ticket.data.tags))
  }, [ticket.data])

  async function refresh() {
    setDraft(null)
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['helpdesk'] })
    await queryClient.invalidateQueries({ queryKey: ['helpdesk', id] })
  }

  const save = useMutation({
    mutationFn: () => {
      if (!current) throw new Error('missing')
      return api(`/api/helpdesk/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          subject: current.subject,
          description: current.description,
          teamId: current.team?.id ?? null,
          assigneeId: current.assignee?.id ?? null,
          priority: current.priority,
          stage: current.stage,
          tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        }),
      })
    },
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hd.failed')),
  })
  const send = useMutation({
    mutationFn: () => api<{ simulated: boolean; internal: boolean }>(`/api/helpdesk/${id}/messages`, {
      method: 'POST',
      body: JSON.stringify(reply),
    }),
    onSuccess: (result) => {
      setReply({ body: '', internal: false })
      setNote(result.internal ? t('hd.noted') : result.simulated ? t('hd.simulated') : t('hd.noted'))
      void refresh()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hd.failed')),
  })

  if (ticket.isLoading || board.isLoading) return <p className="text-sm text-muted-foreground">{t('hd.loading')}</p>
  if (ticket.isError) return <p className="text-sm text-destructive">{ticket.error.message}</p>
  if (!current || !board.data) return null

  function onSave(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-primary" to="/helpdesk">{t('hd.back')}</Link>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">{current.number}</h1>
        <p className="mt-1 text-muted-foreground">{current.partner.name}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <Panel>
        <form className="grid gap-3 md:grid-cols-2" onSubmit={onSave}>
          <Field label={t('hd.subject')}>
            <Input value={current.subject} required onChange={(event) => setDraft({ ...current, subject: event.target.value })} />
          </Field>
          <Field label={t('hd.stage')}>
            <select className={selectClass} value={current.stage} onChange={(event) => setDraft({ ...current, stage: asStage(event.target.value) })}>
              {stages.map((stage) => <option key={stage} value={stage}>{stageLabel(stage, t)}</option>)}
            </select>
          </Field>
          <Field label={t('hd.description')}>
            <Textarea value={current.description} onChange={(event) => setDraft({ ...current, description: event.target.value })} />
          </Field>
          <div className="grid content-start gap-3">
            <Field label={t('hd.priority')}>
              <select className={selectClass} value={current.priority} onChange={(event) => setDraft({ ...current, priority: asPriority(event.target.value) })}>
                {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabel(priority, t)}</option>)}
              </select>
            </Field>
            <Field label={t('hd.team')}>
              <select
                className={selectClass}
                value={current.team?.id ?? ''}
                onChange={(event) => {
                  const team = board.data?.teams.find((row) => row.id === Number(event.target.value)) ?? null
                  setDraft({ ...current, team })
                }}
              >
                <option value="">{t('hd.none')}</option>
                {board.data.teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
              </select>
            </Field>
            <Field label={t('hd.assignee')}>
              <select
                className={selectClass}
                value={current.assignee?.id ?? ''}
                onChange={(event) => {
                  const assignee = board.data?.users.find((row) => row.id === Number(event.target.value)) ?? null
                  setDraft({ ...current, assignee })
                }}
              >
                <option value="">{t('hd.none')}</option>
                {board.data.users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label={t('hd.tags')}>
            <Input value={tags} placeholder={t('hd.tagsHint')} onChange={(event) => setTags(event.target.value)} />
          </Field>
          <div className="flex flex-col justify-end gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">{t('hd.deadline')}: </span>
              {current.slaDeadline ? shortDate(current.slaDeadline) : '—'}
            </p>
            <p>
              <span className="text-muted-foreground">{t('hd.remaining')}: </span>
              <Countdown deadline={current.slaDeadline} resolved={current.resolvedAt !== null} breached={current.breached} t={t} />
            </p>
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={save.isPending}>{save.isPending ? t('hd.saving') : t('hd.save')}</Button>
          </div>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-serif text-2xl">{t('hd.thread')}</h2>
        {current.messages.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('hd.noMessages')}</p> : null}
        <ul className="mt-3 grid gap-2">
          {current.messages.map((message) => (
            <li key={message.id} className="rounded-md border border-border px-4 py-3 text-sm">
              <p className="font-semibold">
                {message.authorName}
                <span className="font-normal text-muted-foreground"> · {shortDate(message.createdAt)}</span>
                {message.internal ? <span className="font-normal text-muted-foreground"> · {t('hd.internal')}</span> : null}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
            </li>
          ))}
        </ul>
        {note ? <p className="mt-3 text-sm text-muted-foreground">{note}</p> : null}
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            send.mutate()
          }}
        >
          <Field label={t('hd.reply')}>
            <Textarea value={reply.body} required onChange={(event) => setReply({ ...reply, body: event.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={reply.internal} onChange={(event) => setReply({ ...reply, internal: event.target.checked })} />
            {t('hd.internal')}
          </label>
          <div>
            <Button type="submit" disabled={send.isPending}>{t('hd.send')}</Button>
          </div>
        </form>
      </Panel>
    </div>
  )
}

export function SlaPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const board = useQuery({ queryKey: ['helpdesk'], queryFn: () => api<Board>('/api/helpdesk') })
  const [hours, setHours] = useState<Record<string, string>>({})
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!board.data || ready) return
    const next: Record<string, string> = {}
    for (const priority of priorities) {
      const policy = board.data.policies.find((row) => row.priority === priority)
      next[priority] = String(policy?.hours ?? '')
    }
    setHours(next)
    setReady(true)
  }, [board.data, ready])

  const save = useMutation({
    mutationFn: async () => {
      for (const priority of priorities) {
        const value = Number(hours[priority])
        if (!Number.isInteger(value)) continue
        await api('/api/helpdesk/sla', { method: 'POST', body: JSON.stringify({ priority, hours: value }) })
      }
    },
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['helpdesk'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hd.failed')),
  })
  const addTeam = useMutation({
    mutationFn: () => api('/api/helpdesk/teams', { method: 'POST', body: JSON.stringify({ name: teamName }) }),
    onSuccess: async () => {
      setTeamName('')
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['helpdesk'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hd.failed')),
  })

  if (board.isLoading) return <p className="text-sm text-muted-foreground">{t('hd.loading')}</p>
  if (board.isError) return <p className="text-sm text-destructive">{board.error.message}</p>
  if (!board.data) return null

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-primary" to="/helpdesk">{t('hd.back')}</Link>
        <PageHeader title={t('hd.slaTitle')} lead={t('hd.slaLead')} />
      </div>
      {error ? <Notice message={error} /> : null}
      <Panel>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          {priorities.map((priority) => (
            <Field key={priority} label={`${priorityLabel(priority, t)} · ${t('hd.hours')}`}>
              <Input
                type="number"
                min={1}
                max={720}
                value={hours[priority] ?? ''}
                onChange={(event) => setHours({ ...hours, [priority]: event.target.value })}
                required
              />
            </Field>
          ))}
          <div className="md:col-span-2">
            <Button type="submit" disabled={save.isPending}>{save.isPending ? t('hd.saving') : t('hd.save')}</Button>
          </div>
        </form>
      </Panel>
      <Panel>
        <h2 className="font-serif text-2xl">{t('hd.team')}</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {board.data.teams.map((team) => <li key={team.id}>{team.name}</li>)}
        </ul>
        <form
          className="mt-3 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            addTeam.mutate()
          }}
        >
          <Field label={t('hd.teamName')}>
            <Input value={teamName} required onChange={(event) => setTeamName(event.target.value)} />
          </Field>
          <Button type="submit" disabled={addTeam.isPending}>{t('hd.addTeam')}</Button>
        </form>
      </Panel>
    </div>
  )
}
