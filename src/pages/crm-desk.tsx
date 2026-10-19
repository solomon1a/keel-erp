import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { PageHeader, Panel } from '../components/surface.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

const groups = ['stage', 'user', 'source', 'reason'] as const
type Group = (typeof groups)[number]
const sources = ['website', 'referral', 'fair', 'phone', 'email'] as const
type Source = (typeof sources)[number]

type ActivityRow = {
  id: number
  kind: string
  summary: string
  dueOn: string | null
  done: boolean
  overdue: boolean
  assignee: { id: number; name: string } | null
  lead: { id: number; name: string; user: { id: number; name: string } | null }
}

type ActivityBoard = {
  activities: ActivityRow[]
  leads: Array<{ id: number; name: string }>
  users: Array<{ id: number; name: string }>
}

type AnalysisRow = { key: string; label: string; count: number; open: number; won: number; lost: number; expected: number; conversion: number }
type Analysis = { group: Group; rows: AnalysisRow[]; totals: AnalysisRow }

const selectClass = 'h-10 w-full rounded-md border border-border bg-card px-3 text-sm'

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

function groupLabel(group: Group, t: Translate) {
  switch (group) {
    case 'stage':
      return t('crm.byStage')
    case 'user':
      return t('crm.byUser')
    case 'source':
      return t('crm.bySource')
    case 'reason':
      return t('crm.byReason')
    default: {
      const unexpected: never = group
      return unexpected
    }
  }
}

export function sourceLabel(source: string, t: Translate) {
  switch (source) {
    case 'website':
      return t('crm.source.website')
    case 'referral':
      return t('crm.source.referral')
    case 'fair':
      return t('crm.source.fair')
    case 'phone':
      return t('crm.source.phone')
    case 'email':
      return t('crm.source.email')
    case '':
      return t('crm.none')
    default:
      return source
  }
}

function asSource(value: string): Source | '' {
  switch (value) {
    case 'website':
    case 'referral':
    case 'fair':
    case 'phone':
    case 'email':
      return value
    default:
      return ''
  }
}

export function ActivitiesPage() {
  const { t } = useI18n()
  const shortDate = useShortDate()
  const [params, setParams] = useSearchParams()
  const mine = params.get('mine') === '1'
  const overdue = params.get('overdue') === '1'
  const board = useQuery({
    queryKey: ['crm-activities', mine, overdue],
    queryFn: () => api<ActivityBoard>(`/api/crm/activities?mine=${mine ? '1' : '0'}&overdue=${overdue ? '1' : '0'}`),
  })
  if (board.isLoading) return <p className="text-sm text-muted-foreground">{t('crm.loading')}</p>
  if (board.isError) return <p className="text-sm text-destructive">{board.error.message}</p>
  const data = board.data
  if (!data) return null
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('crm.activities')}
        lead={t('crm.activitiesLead')}
        actions={
          <>
            <Button variant={!mine && !overdue ? 'default' : 'outline'} onClick={() => setParams({})}>{t('crm.all')}</Button>
            <Button variant={mine && !overdue ? 'default' : 'outline'} onClick={() => setParams({ mine: '1' })}>{t('crm.mine')}</Button>
            <Button variant={overdue ? 'default' : 'outline'} onClick={() => setParams({ overdue: '1' })}>{t('crm.overdue')}</Button>
          </>
        }
      />
      <ScheduleForm leads={data.leads} users={data.users} />
      {data.activities.length === 0 ? <EmptyState title={t('crm.emptyActivities')} body={t('crm.activitiesLead')} /> : (
        <ul className="grid gap-2">
          {data.activities.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm">
              <span>
                <Link className="font-semibold text-primary" to={`/crm/${row.lead.id}`}>{row.lead.name}</Link>
                <span className="mt-0.5 block text-muted-foreground">
                  {kindLabel(row.kind, t)} · {row.summary}
                  {row.dueOn ? ` · ${shortDate(row.dueOn)}` : ''}
                  {row.assignee ? ` · ${row.assignee.name}` : row.lead.user ? ` · ${row.lead.user.name}` : ''}
                </span>
              </span>
              <span className="flex items-center gap-2">
                {row.overdue ? <Badge tone="refused">{t('crm.overdue')}</Badge> : null}
                {row.done ? <span className="text-muted-foreground">{t('crm.done')}</span> : <DoneButton id={row.id} />}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function DoneButton({ id }: { id: number }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const done = useMutation({
    mutationFn: () => api(`/api/crm/activities/${id}/done`, { method: 'POST' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['crm-activities'] }),
  })
  return <Button size="sm" variant="outline" disabled={done.isPending} onClick={() => done.mutate()}>{t('crm.markDone')}</Button>
}

function ScheduleForm({ leads, users }: { leads: Array<{ id: number; name: string }>; users: Array<{ id: number; name: string }> }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ leadId: '', kind: 'call', summary: '', dueOn: '', assigneeId: '' })
  const [error, setError] = useState('')
  const leadId = form.leadId || (leads[0] ? String(leads[0].id) : '')
  const create = useMutation({
    mutationFn: () => api('/api/crm/activities', {
      method: 'POST',
      body: JSON.stringify({
        leadId: Number(leadId),
        kind: form.kind,
        summary: form.summary,
        dueOn: form.dueOn,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : undefined,
      }),
    }),
    onSuccess: async () => {
      setForm({ ...form, summary: '', dueOn: '' })
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['crm-activities'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })
  if (leads.length === 0) return null
  return (
    <Panel>
      <form
        className="grid gap-3 md:grid-cols-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        {error ? <div className="md:col-span-5"><Notice message={error} /></div> : null}
        <Field label={t('crm.leadName')}>
          <select className={selectClass} value={leadId} onChange={(event) => setForm({ ...form, leadId: event.target.value })}>
            {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name}</option>)}
          </select>
        </Field>
        <Field label={t('crm.kind')}>
          <select className={selectClass} value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            <option value="call">{t('crm.kind.call')}</option>
            <option value="meeting">{t('crm.kind.meeting')}</option>
            <option value="todo">{t('crm.kind.todo')}</option>
          </select>
        </Field>
        <Field label={t('crm.summary')}>
          <Input value={form.summary} required onChange={(event) => setForm({ ...form, summary: event.target.value })} />
        </Field>
        <Field label={t('crm.due')}>
          <Input type="date" value={form.dueOn} onChange={(event) => setForm({ ...form, dueOn: event.target.value })} />
        </Field>
        <Field label={t('crm.assignee')}>
          <select className={selectClass} value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
            <option value="">{t('crm.mine')}</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </Field>
        <div className="md:col-span-5">
          <Button type="submit" disabled={create.isPending}>{t('crm.add')}</Button>
        </div>
      </form>
    </Panel>
  )
}

export function CrmAnalysisPage() {
  const { t } = useI18n()
  const money = useMoney()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requested = params.get('group')
  const group: Group = requested === 'user' || requested === 'source' || requested === 'reason' || requested === 'stage' ? requested : 'stage'
  const report = useQuery({
    queryKey: ['crm-analysis', group],
    queryFn: () => api<Analysis>(`/api/crm/analysis?group=${group}`),
  })
  const rows = report.data?.rows ?? []
  const max = Math.max(...rows.map((row) => Math.abs(row.expected)), 1)
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('crm.analysis')}
        lead={t('crm.analysisLead')}
        actions={
          <>
            {groups.map((item) => (
              <Button key={item} variant={group === item ? 'default' : 'outline'} onClick={() => navigate(`/crm/analysis?group=${item}`)}>
                {groupLabel(item, t)}
              </Button>
            ))}
            <Button variant="outline" onClick={() => { window.location.href = `/api/crm/analysis?group=${group}&format=csv` }}>{t('phase.exportCsv')}</Button>
          </>
        }
      />
      {report.isLoading ? <p className="text-sm text-muted-foreground">{t('crm.loading')}</p> : null}
      {report.isError ? <p className="text-sm text-destructive">{report.error.message}</p> : null}
      {report.data && rows.length === 0 ? <EmptyState title={t('crm.noRows')} body={t('crm.analysisLead')} /> : null}
      {rows.length > 0 ? (
        <Panel>
          <div className="grid gap-2">
            {rows.slice(0, 8).map((row) => (
              <div key={row.key} className="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{group === 'stage' ? stageName(row.label, t) : group === 'source' ? sourceLabel(row.label === 'Unspecified' ? '' : row.label, t) : row.label}</span>
                <span className="h-2 rounded-full bg-secondary">
                  <span className="block h-2 rounded-full bg-[var(--kl-color-primary-fill)]" style={{ width: `${(Math.abs(row.expected) / max) * 100}%` }} />
                </span>
                <span className="tabular-nums">{money(row.expected)}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      {report.data && rows.length > 0 ? (
        <div className="keel-table overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">{groupLabel(group, t)}</th>
                <th className="px-3 py-2 text-right font-medium">{t('crm.count')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('crm.openCount')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('crm.won')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('crm.lost')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('crm.expected')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('crm.conversion')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border">
                  <td className="px-3 py-2">{group === 'stage' ? stageName(row.label, t) : group === 'source' ? sourceLabel(row.label === 'Unspecified' ? '' : row.label, t) : row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.count}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.open}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.won}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.lost}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.expected)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.conversion}%</td>
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2 font-semibold">{t('acct.rowTotal')}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{report.data.totals.count}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{report.data.totals.open}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{report.data.totals.won}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{report.data.totals.lost}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(report.data.totals.expected)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{report.data.totals.conversion}%</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function stageName(stage: string, t: Translate) {
  switch (stage) {
    case 'new':
      return t('crm.stage.new')
    case 'qualified':
      return t('crm.stage.qualified')
    case 'proposition':
      return t('crm.stage.proposition')
    case 'won':
      return t('crm.stage.won')
    case 'lost':
      return t('crm.stage.lost')
    default:
      return stage
  }
}

type Named = { id: number; name: string; _count?: { leads: number } }

export function CrmTagsPage() {
  return <NameList titleKey="crm.tags" leadKey="crm.analysisLead" path="/api/crm/tags" nameLabel="crm.tagName" addLabel="crm.addTag" />
}

export function LostReasonsPage() {
  return <NameList titleKey="crm.lostReasons" leadKey="crm.analysisLead" path="/api/crm/lost-reasons" nameLabel="crm.reasonName" addLabel="crm.addReason" />
}

function NameList({ titleKey, leadKey, path, nameLabel, addLabel }: { titleKey: MessageKey; leadKey: MessageKey; path: string; nameLabel: MessageKey; addLabel: MessageKey }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const rows = useQuery({ queryKey: [path], queryFn: () => api<Named[]>(path) })
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const add = useMutation({
    mutationFn: () => api(path, { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: async () => {
      setName('')
      setError('')
      await queryClient.invalidateQueries({ queryKey: [path] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`${path}/${id}`, { method: 'DELETE' }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: [path] }),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('crm.failed')),
  })
  return (
    <div className="grid gap-6">
      <PageHeader title={t(titleKey)} lead={t(leadKey)} />
      {error ? <Notice message={error} /> : null}
      {rows.isLoading ? <p className="text-sm text-muted-foreground">{t('crm.loading')}</p> : null}
      <ul className="grid gap-2">
        {(rows.data ?? []).map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm">
            <span>{row.name}{row._count ? <span className="text-muted-foreground"> · {t('crm.used')} {row._count.leads}</span> : null}</span>
            <Button size="sm" variant="outline" onClick={() => remove.mutate(row.id)}>{t('crm.remove')}</Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate()
        }}
      >
        <Field label={t(nameLabel)}>
          <Input value={name} required onChange={(event) => setName(event.target.value)} />
        </Field>
        <Button type="submit" disabled={add.isPending}>{t(addLabel)}</Button>
      </form>
    </div>
  )
}

export { asSource, sources }
