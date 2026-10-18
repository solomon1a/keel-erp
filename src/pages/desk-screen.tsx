import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { BarChart } from '../components/bar-chart.tsx'
import { BaseMoneyLabel } from '../components/base-currency.tsx'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { KanbanBoard, KanbanCard, KanbanColumn, PageHeader, Panel, TableFrame, Toolbar } from '../components/surface.tsx'
import { useToast } from '../components/toast.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select, Textarea } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { dateInput, useMoney, useShortDate } from '../lib/format.ts'
import { screenCopy } from '../lib/menu-label.ts'
import type { DeskScreen } from '../../shared/desk-screens.ts'
import { deskListMeta, type DeskGroupBy } from '../../shared/views.ts'

type DeskRow = {
  id: number
  name: string
  state: string
  partner: string
  owner: string
  bucket: string
  amount: number
  notes: string
  recordDate: string
}

type SettingField = { key: string; labelEn: string; labelZh: string; value: string }

type AccountRow = { id: number; code: string; name: string; type: string }

type GroupBy = DeskGroupBy
type DeskPage = { rows: DeskRow[]; total: number; page: number; pageSize: number }
type SavedFilter = { id: number; name: string; query: string; groupBy: string; state: string }
type ChatterRow = { id: number; summary: string; createdAt: string; user: { name: string } | null }

function asPage(data: DeskRow[] | DeskPage | undefined, pageSize: number) {
  if (!data) return { rows: [] as DeskRow[], total: 0, page: 1, pageSize }
  if (Array.isArray(data)) return { rows: data, total: data.length, page: 1, pageSize: data.length || pageSize }
  return data
}
type Layout = 'list' | 'kanban'

function stateText(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('desk.state.draft')
    case 'open':
      return t('desk.state.open')
    case 'done':
      return t('desk.state.done')
    case 'active':
      return t('desk.state.active')
    case 'archived':
      return t('desk.state.archived')
    case 'confirmed':
      return t('desk.state.confirmed')
    case 'to_invoice':
      return t('desk.state.to_invoice')
    case 'invoiced':
      return t('desk.state.invoiced')
    case 'ready':
      return t('desk.state.ready')
    case 'posted':
      return t('desk.state.posted')
    case 'paid':
      return t('desk.state.paid')
    case 'present':
      return t('desk.state.present')
    case 'late':
      return t('desk.state.late')
    case 'absent':
      return t('desk.state.absent')
    case 'waiting':
      return t('desk.state.waiting')
    case 'approved':
      return t('desk.state.approved')
    case 'refused':
      return t('desk.state.refused')
    case 'submitted':
      return t('desk.state.submitted')
    case 'reimbursed':
      return t('desk.state.reimbursed')
    case 'cancel':
      return t('desk.state.cancel')
    case 'running':
      return t('desk.state.running')
    case 'disposed':
      return t('desk.state.disposed')
    case 'scheduled':
      return t('desk.state.scheduled')
    case 'planned':
      return t('desk.state.planned')
    case 'progress':
      return t('desk.state.progress')
    case 'pass':
      return t('desk.state.pass')
    case 'fail':
      return t('desk.state.fail')
    case 'received':
      return t('desk.state.received')
    case 'validated':
      return t('desk.state.validated')
    case 'rejected':
      return t('desk.state.rejected')
    case 'issued':
      return t('desk.state.issued')
    case 'void':
      return t('desk.state.void')
    case 'breached':
      return t('desk.state.breached')
    case 'met':
      return t('desk.state.met')
    case 'to_bill':
      return t('desk.state.to_bill')
    case 'billed':
      return t('desk.state.billed')
    case 'screening':
      return t('desk.state.screening')
    case 'interview':
      return t('desk.state.interview')
    case 'offer':
      return t('desk.state.offer')
    case 'hired':
      return t('desk.state.hired')
    case 'probation':
      return t('desk.state.probation')
    case 'overtime':
      return t('desk.state.overtime')
    case 'awarded':
      return t('desk.state.awarded')
    case 'dept_sales':
      return t('desk.state.dept_sales')
    case 'dept_workshop':
      return t('desk.state.dept_workshop')
    case 'dept_shop':
      return t('desk.state.dept_shop')
    case 'dept_office':
      return t('desk.state.dept_office')
    default:
      return state
  }
}

function accountTypeText(type: string, t: Translate) {
  switch (type) {
    case 'asset':
      return t('acct.assets')
    case 'liability':
      return t('acct.liabilities')
    case 'equity':
      return t('acct.equity')
    case 'income':
      return t('acct.income')
    case 'expense':
      return t('acct.expense')
    default:
      return type
  }
}

function groupValue(row: DeskRow, group: GroupBy) {
  switch (group) {
    case 'none':
      return ''
    case 'state':
      return row.state
    case 'partner':
      return row.partner || '—'
    case 'owner':
      return row.owner || '—'
    case 'bucket':
      return row.bucket || '—'
    default: {
      const unexpected: never = group
      return unexpected
    }
  }
}

function groupLabel(group: GroupBy, value: string, t: Translate) {
  if (group === 'state') return stateText(value, t)
  return value
}

export function DeskScreenPage() {
  const { module = '', screen = '' } = useParams()
  const { locale, t } = useI18n()
  const copy = screenCopy(module, screen, locale)
  if (!copy) return <EmptyState title={t('desk.notFound')} body={t('desk.emptyBody')} />
  switch (copy.screen.kind) {
    case 'settings':
      return <SettingsView module={module} title={copy.title} lead={copy.lead} />
    case 'report':
      return <ReportView module={module} screen={screen} title={copy.title} lead={copy.lead} />
    case 'accounts':
      return <AccountsView title={copy.title} lead={copy.lead} />
    case 'list':
      return <ListView module={module} screen={screen} title={copy.title} lead={copy.lead} spec={copy.screen} />
    default: {
      const unexpected: never = copy.screen.kind
      return unexpected
    }
  }
}

export function DeskFormPage() {
  const { module = '', screen = '', id = '' } = useParams()
  const { locale, t } = useI18n()
  const copy = screenCopy(module, screen, locale)
  if (!copy || copy.screen.kind === 'report' || copy.screen.kind === 'settings') {
    return <EmptyState title={t('desk.notFound')} body={t('desk.emptyBody')} />
  }
  if (copy.screen.kind === 'accounts') return <AccountForm title={copy.title} id={id} />
  return <RecordForm module={module} screen={screen} id={id} spec={copy.screen} title={copy.title} />
}

function ListView({ module, screen, title, lead, spec }: { module: string; screen: string; title: string; lead: string; spec: DeskScreen }) {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [state, setState] = useState('all')
  const [group, setGroup] = useState<GroupBy>('none')
  const [layout, setLayout] = useState<Layout>(spec.kanban ? 'kanban' : 'list')
  const [page, setPage] = useState(1)
  const [filterName, setFilterName] = useState('')
  const rows = useQuery({
    queryKey: ['desk-records', module, screen, q, state, page],
    queryFn: () => api<DeskRow[] | DeskPage>(`/api/desk-records?module=${encodeURIComponent(module)}&screen=${encodeURIComponent(screen)}&q=${encodeURIComponent(q)}&state=${encodeURIComponent(state)}&page=${page}&pageSize=${deskListMeta.pageSize}`),
  })
  const saved = useQuery({
    queryKey: ['saved-filters', deskListMeta.model, module, screen],
    queryFn: () => api<SavedFilter[]>(`/api/saved-filters?model=${encodeURIComponent(`${module}.${screen}`)}`),
  })
  const pageData = asPage(rows.data, deskListMeta.pageSize)
  const saveFilter = useMutation({
    mutationFn: () => api('/api/saved-filters', {
      method: 'POST',
      body: JSON.stringify({ model: `${module}.${screen}`, name: filterName, query: q, groupBy: group, state }),
    }),
    onSuccess: async () => {
      setFilterName('')
      await queryClient.invalidateQueries({ queryKey: ['saved-filters', deskListMeta.model, module, screen] })
    },
  })
  const groups = useMemo(() => {
    const data = pageData.rows
    if (group === 'none') return [{ key: '', rows: data }]
    const map = new Map<string, DeskRow[]>()
    for (const row of data) {
      const key = groupValue(row, group)
      map.set(key, [...(map.get(key) ?? []), row])
    }
    return [...map.entries()].map(([key, grouped]) => ({ key, rows: grouped }))
  }, [pageData.rows, group])

  return (
    <div className="grid gap-5">
      <PageHeader title={title} lead={lead} actions={<Link to={`/app/${module}/${screen}/new`}><Button>{t('desk.new')}</Button></Link>} />
      <Toolbar>
        <Input className="w-full sm:w-56" value={q} placeholder={t('desk.search')} aria-label={t('desk.search')} onChange={(event) => setQ(event.target.value)} />
        <Button size="sm" variant={state === 'all' ? 'secondary' : 'outline'} onClick={() => setState('all')}>{t('purchases.filterAll')}</Button>
        {spec.states.map((value) => (
          <Button key={value} size="sm" variant={state === value ? 'secondary' : 'outline'} onClick={() => setState(value)}>
            {stateText(value, t)}
          </Button>
        ))}
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          {t('desk.group')}
          <Select className="h-7 w-auto" value={group} onChange={(event) => setGroup(event.target.value as GroupBy)}>
            <option value="none">{t('desk.group.none')}</option>
            <option value="state">{t('desk.group.state')}</option>
            <option value="partner">{t('desk.group.partner')}</option>
            <option value="owner">{t('desk.group.owner')}</option>
            <option value="bucket">{t('desk.group.bucket')}</option>
          </Select>
        </label>
        {spec.kanban ? (
          <div className="keel-segment">
            <Button size="sm" variant={layout === 'list' ? 'secondary' : 'ghost'} onClick={() => setLayout('list')}>{t('desk.list')}</Button>
            <Button size="sm" variant={layout === 'kanban' ? 'secondary' : 'ghost'} onClick={() => setLayout('kanban')}>{t('desk.kanban')}</Button>
          </div>
        ) : null}
        <Select
          className="h-7 w-auto"
          aria-label={t('desk.savedFilters')}
          value=""
          onChange={(event) => {
            const picked = saved.data?.find((row) => String(row.id) === event.target.value)
            if (!picked) return
            setQ(picked.query)
            setState(picked.state)
            setGroup(picked.groupBy as GroupBy)
            setPage(1)
          }}
        >
          <option value="">{t('desk.savedFilters')}</option>
          {(saved.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
        </Select>
        <Input className="w-full sm:w-40" value={filterName} placeholder={t('desk.filterName')} aria-label={t('desk.filterName')} onChange={(event) => setFilterName(event.target.value)} />
        <Button size="sm" variant="outline" disabled={!filterName.trim() || saveFilter.isPending} onClick={() => saveFilter.mutate()}>{t('desk.saveFilter')}</Button>
      </Toolbar>
      {rows.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {rows.isError ? <p className="text-sm text-destructive">{rows.error.message}</p> : null}
      {rows.data && pageData.rows.length === 0 ? (
        <EmptyState title={t('desk.emptyTitle')} body={t('desk.emptyBody')} action={{ to: `/app/${module}/${screen}/new`, label: t('desk.new') }} />
      ) : null}
      {layout === 'kanban' && spec.kanban && pageData.rows.length > 0 ? (
        <KanbanBoard>
          {(state === 'all' ? spec.states : [state]).map((column, index) => (
            <KanbanColumn key={column} title={stateText(column, t)} tint={index % 5}>
              {pageData.rows.filter((row) => row.state === column).map((row) => (
                <KanbanCard key={row.id} onClick={() => navigate(`/app/${module}/${screen}/${row.id}`)}>
                  <p className="font-semibold">{row.name}</p>
                  <p className="text-sm text-muted-foreground">{row.partner || row.owner || '—'}</p>
                  <p className="text-sm tabular-nums">{money(row.amount)}</p>
                </KanbanCard>
              ))}
            </KanbanColumn>
          ))}
        </KanbanBoard>
      ) : null}
      {layout === 'list' && pageData.rows.length > 0 ? groups.map((section) => (
        <TableFrame key={section.key || 'all'}>
          {section.key ? <h2 className="border-b border-border px-4 py-2 text-sm font-semibold">{groupLabel(group, section.key, t)}</h2> : null}
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('desk.name')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.partner')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.owner')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.state')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.date')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {section.rows.map((row) => (
                <tr key={row.id} className="record-row border-b border-border last:border-0" onClick={() => navigate(`/app/${module}/${screen}/${row.id}`)}>
                  <td className="px-4 py-3"><Link className="font-semibold hover:underline" to={`/app/${module}/${screen}/${row.id}`}>{row.name}</Link></td>
                  <td className="px-4 py-3">{row.partner || '—'}</td>
                  <td className="px-4 py-3">{row.owner || '—'}</td>
                  <td className="px-4 py-3"><Badge tone={row.state}>{stateText(row.state, t)}</Badge></td>
                  <td className="px-4 py-3">{shortDate(row.recordDate)}</td>
                  <td className="px-4 py-3">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      )) : null}
      {pageData.total > pageData.pageSize ? (
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>{t('desk.prev')}</Button>
          <span className="text-sm text-muted-foreground">{t('desk.page', { page })}</span>
          <Button size="sm" variant="outline" disabled={page * pageData.pageSize >= pageData.total} onClick={() => setPage((current) => current + 1)}>{t('desk.next')}</Button>
        </div>
      ) : null}
    </div>
  )
}

function RecordForm({ module, screen, id, spec, title }: { module: string; screen: string; id: string; spec: DeskScreen; title: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const creating = id === 'new' || id === ''
  const existing = useQuery({
    queryKey: ['desk-record', id],
    queryFn: () => api<DeskRow>(`/api/desk-records/${id}`),
    enabled: !creating,
  })
  const [draft, setDraft] = useState<Partial<DeskRow> | null>(null)
  useEffect(() => {
    setDraft(null)
  }, [id])
  const source = draft ?? existing.data ?? {
    name: '',
    state: spec.states[0] ?? 'draft',
    partner: '',
    owner: '',
    bucket: '',
    amount: 0,
    notes: '',
    recordDate: new Date().toISOString(),
  }
  const save = useMutation({
    mutationFn: () => api<DeskRow>(creating ? '/api/desk-records' : `/api/desk-records/${id}`, {
      method: creating ? 'POST' : 'PATCH',
      body: JSON.stringify({
        module,
        screen,
        name: source.name,
        state: source.state,
        partner: source.partner,
        owner: source.owner,
        bucket: source.bucket,
        amount: Number(source.amount) || 0,
        notes: source.notes,
        recordDate: dateInput(source.recordDate) || undefined,
      }),
    }),
    onSuccess: async (row) => {
      toast(t('desk.saved'))
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey: ['desk-records', module, screen] })
      navigate(`/app/${module}/${screen}/${row.id}`)
    },
  })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }
  if (!creating && existing.isLoading) return <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p>
  if (!creating && existing.isError) return <p className="text-sm text-destructive">{existing.error.message}</p>
  return (
    <form className="grid max-w-3xl gap-5" onSubmit={onSubmit}>
      <PageHeader
        title={creating ? t('desk.new') : (source.name || title)}
        lead={title}
        actions={<Link className="keel-back" to={`/app/${module}/${screen}`}>{t('desk.back')}</Link>}
      />
      {save.isError ? <Notice message={save.error instanceof ApiError ? save.error.message : t('desk.failed')} /> : null}
      <Panel className="grid gap-4 md:grid-cols-2">
        <Field label={t('desk.name')}><Input value={source.name ?? ''} onChange={(event) => setDraft({ ...source, name: event.target.value })} required /></Field>
        <Field label={t('desk.state')}>
          <Select value={source.state ?? ''} onChange={(event) => setDraft({ ...source, state: event.target.value })}>
            {(spec.states.length > 0 ? spec.states : [source.state ?? 'draft']).map((value) => (
              <option key={value} value={value}>{stateText(value ?? '', t)}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('desk.partner')}><Input value={source.partner ?? ''} onChange={(event) => setDraft({ ...source, partner: event.target.value })} /></Field>
        <Field label={t('desk.owner')}><Input value={source.owner ?? ''} onChange={(event) => setDraft({ ...source, owner: event.target.value })} /></Field>
        <Field label={t('desk.bucket')}><Input value={source.bucket ?? ''} onChange={(event) => setDraft({ ...source, bucket: event.target.value })} /></Field>
        <Field label={<BaseMoneyLabel text={t('desk.amount')} />}><Input type="number" step="0.01" value={source.amount ?? 0} onChange={(event) => setDraft({ ...source, amount: Number(event.target.value) })} /></Field>
        <Field label={t('desk.date')}><Input type="date" value={dateInput(source.recordDate)} onChange={(event) => setDraft({ ...source, recordDate: event.target.value })} /></Field>
        <div className="md:col-span-2">
          <Field label={t('desk.notes')}><Textarea value={source.notes ?? ''} onChange={(event) => setDraft({ ...source, notes: event.target.value })} /></Field>
        </div>
      </Panel>
      <div><Button type="submit" disabled={save.isPending}>{t('desk.save')}</Button></div>
      {!creating ? <Chatter model="desk.record" recordId={Number(id)} /> : null}
    </form>
  )
}

function Chatter({ model, recordId }: { model: string; recordId: number }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const log = useQuery({
    queryKey: ['chatter', model, recordId],
    queryFn: () => api<ChatterRow[]>(`/api/chatter?model=${encodeURIComponent(model)}&recordId=${recordId}`),
    enabled: recordId > 0,
  })
  const add = useMutation({
    mutationFn: () => api('/api/chatter', { method: 'POST', body: JSON.stringify({ model, recordId, summary: note }) }),
    onSuccess: async () => {
      setNote('')
      await queryClient.invalidateQueries({ queryKey: ['chatter', model, recordId] })
    },
  })
  return (
    <Panel className="grid gap-3">
      <h2 className="font-semibold">{t('desk.chatter')}</h2>
      <ul className="grid gap-2 text-sm">
        {(log.data ?? []).map((row) => (
          <li key={row.id}>
            <span className="text-muted-foreground">{row.user?.name ? `${row.user.name}: ` : ''}</span>
            {row.summary}
          </li>
        ))}
      </ul>
      <Field label={t('desk.note')}>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div><Button type="button" variant="outline" disabled={!note.trim() || add.isPending} onClick={() => add.mutate()}>{t('desk.addNote')}</Button></div>
    </Panel>
  )
}

function ReportView({ module, screen, title, lead }: { module: string; screen: string; title: string; lead: string }) {
  const { t } = useI18n()
  const money = useMoney()
  const rows = useQuery({
    queryKey: ['desk-records', module, screen, '', 'all'],
    queryFn: () => api<DeskRow[]>(`/api/desk-records?module=${encodeURIComponent(module)}&screen=${encodeURIComponent(screen)}`),
  })
  const chart = useMemo(() => {
    const totals = new Map<string, number>()
    for (const row of rows.data ?? []) {
      const key = row.bucket || row.name
      totals.set(key, (totals.get(key) ?? 0) + row.amount)
    }
    return [...totals.entries()].map(([label, value]) => ({ label, value, display: money(value) }))
  }, [rows.data, money])
  return (
    <div className="grid gap-5">
      <PageHeader title={title} lead={lead} />
      {rows.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {rows.isError ? <p className="text-sm text-destructive">{rows.error.message}</p> : null}
      {chart.length > 0 ? (
        <Panel>
          <BarChart rows={chart} />
        </Panel>
      ) : null}
      {rows.data && rows.data.length > 0 ? (
        <TableFrame>
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('desk.name')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.bucket')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.data.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-semibold">{row.name}</td>
                  <td className="px-4 py-3">{row.bucket || '—'}</td>
                  <td className="px-4 py-3">{money(row.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      ) : null}
    </div>
  )
}

function SettingsView({ module, title, lead }: { module: string; title: string; lead: string }) {
  const { locale, t } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['module-settings', module],
    queryFn: () => api<SettingField[]>(`/api/module-settings?module=${encodeURIComponent(module)}`),
  })
  const [draft, setDraft] = useState<SettingField[] | null>(null)
  const fields = draft ?? settings.data ?? []
  const save = useMutation({
    mutationFn: () => api('/api/module-settings', {
      method: 'PUT',
      body: JSON.stringify({ module, values: fields.map((field) => ({ key: field.key, value: field.value })) }),
    }),
    onSuccess: async () => {
      toast(t('desk.settingsSaved'))
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey: ['module-settings', module] })
    },
  })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }
  return (
    <form className="grid max-w-2xl gap-5" onSubmit={onSubmit}>
      <PageHeader title={title} lead={lead} />
      {settings.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {settings.isError ? <p className="text-sm text-destructive">{settings.error.message}</p> : null}
      {save.isError ? <Notice message={save.error instanceof ApiError ? save.error.message : t('desk.failed')} /> : null}
      <Panel className="grid gap-4">
        {fields.map((field) => (
          <Field key={field.key} label={locale === 'zh' ? field.labelZh : field.labelEn}>
            <Input value={field.value} onChange={(event) => setDraft(fields.map((row) => row.key === field.key ? { ...row, value: event.target.value } : row))} />
          </Field>
        ))}
      </Panel>
      <div><Button type="submit" disabled={save.isPending || fields.length === 0}>{t('desk.save')}</Button></div>
    </form>
  )
}

function AccountsView({ title, lead }: { title: string; lead: string }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<AccountRow[]>('/api/accounts') })
  const filtered = (accounts.data ?? []).filter((row) => {
    const hay = `${row.code} ${row.name} ${row.type}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })
  return (
    <div className="grid gap-5">
      <PageHeader title={title} lead={lead} />
      <Toolbar>
        <Input className="w-full sm:w-56" value={q} placeholder={t('desk.search')} aria-label={t('desk.search')} onChange={(event) => setQ(event.target.value)} />
      </Toolbar>
      {accounts.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {accounts.isError ? <p className="text-sm text-destructive">{accounts.error.message}</p> : null}
      {accounts.data && filtered.length === 0 ? <EmptyState title={t('desk.emptyTitle')} body={t('desk.emptyBody')} /> : null}
      {filtered.length > 0 ? (
        <TableFrame>
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('desk.name')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.bucket')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/app/accounting/accounts/${row.id}`}>{row.code} {row.name}</Link>
                  </td>
                  <td className="px-4 py-3">{accountTypeText(row.type, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      ) : null}
    </div>
  )
}

function AccountForm({ title, id }: { title: string; id: string }) {
  const { t } = useI18n()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<AccountRow[]>('/api/accounts') })
  const row = accounts.data?.find((account) => String(account.id) === id)
  if (accounts.isLoading) return <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p>
  if (!row) return <EmptyState title={t('desk.notFound')} body={t('desk.emptyBody')} />
  return (
    <div className="grid max-w-2xl gap-5">
      <PageHeader
        title={`${row.code} ${row.name}`}
        lead={title}
        actions={<Link className="keel-back" to="/app/accounting/accounts">{t('desk.back')}</Link>}
      />
      <Panel className="grid gap-4 md:grid-cols-2">
        <Field label={t('desk.name')}><Input value={row.name} readOnly /></Field>
        <Field label={t('desk.bucket')}><Input value={accountTypeText(row.type, t)} readOnly /></Field>
        <Field label={t('desk.state')}><Input value={row.code} readOnly /></Field>
      </Panel>
    </div>
  )
}
