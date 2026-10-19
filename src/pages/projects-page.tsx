import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type PointerEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { BaseCurrencyNote, BaseMoneyLabel } from '../components/base-currency.tsx'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

type Contact = { id: number; name: string }
type Employee = { id: number; name: string; hourlyRate: number; hourlyCost: number }
type Stage = { id: number; name: string; sequence: number }
type Task = {
  id: number
  name: string
  stageId: number
  deadline: string | null
  startDate: string | null
  endDate: string | null
  assignee: { id: number; name: string } | null
  blockedBy: Array<{ dependsOnId: number }>
}
type Timesheet = {
  id: number
  hours: number
  state: string
  workDate: string
  description: string
  employee: { id: number; name: string; hourlyRate: number; hourlyCost: number }
  task: { id: number; name: string }
  invoice: { id: number; name: string } | null
}
type Milestone = { id: number; name: string; amount: number; state: string }
type Profit = { revenue: number; timesheetCost: number; expenses: number; cost: number; profit: number }
type Project = {
  id: number
  name: string
  billingType: string
  hourlyRate: number
  partner: Contact | null
  stages: Stage[]
  tasks: Task[]
  timesheets: Timesheet[]
  milestones: Milestone[]
  profitability: Profit
}
type ProjectRow = { id: number; name: string; billingType: string; partner: Contact | null }

type View = 'kanban' | 'gantt' | 'time' | 'bill' | 'profit'

export function ProjectsPage() {
  const { id } = useParams()
  if (!id) return <ProjectList />
  return <ProjectDesk projectId={Number(id)} />
}

function ProjectList() {
  const { t } = useI18n()
  const [params] = useSearchParams()
  const asked = params.get('view')
  const view = asked === 'kanban' || asked === 'gantt' || asked === 'time' || asked === 'bill' || asked === 'profit' ? asked : ''
  const queryClient = useQueryClient()
  const projects = useQuery({ queryKey: ['projects'], queryFn: () => api<ProjectRow[]>('/api/projects') })
  const customers = useQuery({ queryKey: ['customers'], queryFn: () => api<Contact[]>('/api/contacts?role=customer') })
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', partnerId: '', billingType: 'time', hourlyRate: '120' })
  const create = useMutation({
    mutationFn: () => api('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        partnerId: form.partnerId ? Number(form.partnerId) : null,
        billingType: form.billingType,
        hourlyRate: Number(form.hourlyRate) || 0,
      }),
    }),
    onSuccess: async () => {
      setError('')
      setForm({ ...form, name: '' })
      await queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('projects.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('projects.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <form className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
        <Field label={t('projects.name')}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label={t('projects.customer')}>
          <Select value={form.partnerId} onChange={(event) => setForm({ ...form, partnerId: event.target.value })}>
            <option value="">{t('projects.customer')}</option>
            {(customers.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
          </Select>
        </Field>
        <Field label={t('projects.billing')}>
          <Select value={form.billingType} onChange={(event) => setForm({ ...form, billingType: event.target.value })}>
            <option value="time">{t('projects.billing.time')}</option>
            <option value="fixed">{t('projects.billing.fixed')}</option>
          </Select>
        </Field>
        <Field label={<BaseMoneyLabel text={t('projects.rate')} />}><Input value={form.hourlyRate} onChange={(event) => setForm({ ...form, hourlyRate: event.target.value })} /></Field>
        <div><Button type="submit">{t('projects.new')}</Button></div>
      </form>
      {projects.isLoading ? <p className="text-sm text-muted-foreground">{t('projects.loading')}</p> : null}
      {(projects.data ?? []).length === 0 && !projects.isLoading ? <p className="text-sm text-muted-foreground">{t('projects.empty')}</p> : null}
      <ul className="grid gap-2">
        {(projects.data ?? []).map((project) => (
          <li key={project.id}>
            <Link className="block rounded-lg border border-border bg-card px-4 py-3" to={`/projects/${project.id}${view ? `?view=${view}` : ''}`}>{project.name} · {project.partner?.name ?? ''}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function ProjectDesk({ projectId }: { projectId: number }) {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const project = useQuery({ queryKey: ['project', projectId], queryFn: () => api<Project>(`/api/projects/${projectId}`) })
  const employees = useQuery({ queryKey: ['employees'], queryFn: () => api<Employee[]>('/api/employees') })
  const [params] = useSearchParams()
  const asked = params.get('view')
  const fromQuery: View | null = asked === 'kanban' || asked === 'gantt' || asked === 'time' || asked === 'bill' || asked === 'profit' ? asked : null
  const [view, setView] = useState<View>(fromQuery ?? 'kanban')
  useEffect(() => {
    if (fromQuery) setView(fromQuery)
  }, [fromQuery])
  const [error, setError] = useState('')
  const [task, setTask] = useState({ name: '', assigneeId: '', startDate: '', endDate: '', dependsOnId: '' })
  const [sheet, setSheet] = useState({ taskId: '', employeeId: '', workDate: '2026-10-12', hours: '4' })
  const [milestone, setMilestone] = useState({ name: '', amount: '' })
  const [invoiceName, setInvoiceName] = useState('')
  const row = project.data

  async function saved() {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['project', projectId] })
  }
  const fail = (caught: unknown) => setError(caught instanceof ApiError ? caught.message : t('desk.failed'))
  const addTask = useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/tasks`, {
      method: 'POST',
      body: JSON.stringify({
        name: task.name,
        assigneeId: task.assigneeId ? Number(task.assigneeId) : null,
        startDate: task.startDate || null,
        endDate: task.endDate || null,
        dependsOnId: task.dependsOnId ? Number(task.dependsOnId) : null,
      }),
    }),
    onSuccess: async () => {
      setTask({ ...task, name: '' })
      await saved()
    },
    onError: fail,
  })
  const moveTask = useMutation({
    mutationFn: (input: { id: number; stageId?: number; startDate?: string; endDate?: string }) => api(`/api/projects/tasks/${input.id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),
    onSuccess: saved,
    onError: fail,
  })
  const addSheet = useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/timesheets`, {
      method: 'POST',
      body: JSON.stringify({ taskId: Number(sheet.taskId), employeeId: Number(sheet.employeeId), workDate: sheet.workDate, hours: Number(sheet.hours) }),
    }),
    onSuccess: saved,
    onError: fail,
  })
  const approveSheet = useMutation({
    mutationFn: (id: number) => api(`/api/projects/timesheets/${id}/approve`, { method: 'POST' }),
    onSuccess: saved,
    onError: fail,
  })
  const addMilestone = useMutation({
    mutationFn: () => api(`/api/projects/${projectId}/milestones`, { method: 'POST', body: JSON.stringify({ name: milestone.name, amount: Number(milestone.amount) }) }),
    onSuccess: saved,
    onError: fail,
  })
  const approveMilestone = useMutation({
    mutationFn: (id: number) => api(`/api/projects/milestones/${id}/approve`, { method: 'POST' }),
    onSuccess: saved,
    onError: fail,
  })
  const invoice = useMutation({
    mutationFn: () => api<{ name: string }>(`/api/projects/${projectId}/invoice`, { method: 'POST' }),
    onSuccess: async (created) => {
      setInvoiceName(created.name)
      await saved()
    },
    onError: fail,
  })

  if (project.isLoading || !row) return <p className="text-sm text-muted-foreground">{t('projects.loading')}</p>
  const views: View[] = ['kanban', 'gantt', 'time', 'bill', 'profit']
  const viewLabel: Record<View, string> = {
    kanban: t('projects.kanban'),
    gantt: t('projects.gantt'),
    time: t('projects.timesheets'),
    bill: t('projects.billingTab'),
    profit: t('projects.profit'),
  }
  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm underline" to="/projects">{t('projects.back')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{row.name}</h1>
        <p className="mt-1 text-muted-foreground">{row.partner?.name} · {row.billingType === 'fixed' ? t('projects.billing.fixed') : t('projects.billing.time')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="flex flex-wrap gap-2">
        {views.map((item) => (
          <Button key={item} type="button" size="sm" variant={view === item ? 'default' : 'secondary'} onClick={() => setView(item)}>{viewLabel[item]}</Button>
        ))}
      </div>
      {view === 'kanban' ? (
        <div className="flex gap-3 overflow-x-auto pb-2" data-tour="tour-project">
          {row.stages.map((stage) => (
            <div
              key={stage.id}
              className="w-72 shrink-0 rounded-lg border border-border bg-card p-2"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const id = Number(event.dataTransfer.getData('text/plain'))
                if (id) moveTask.mutate({ id, stageId: stage.id })
              }}
            >
              <h2 className="px-2 py-1 text-sm font-semibold">{stage.name}</h2>
              {row.tasks.filter((item) => item.stageId === stage.id).map((item) => (
                <article key={item.id} draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(item.id))} className="mb-2 cursor-grab rounded-lg border border-border bg-[var(--kl-color-semantic-surface)] p-3">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.assignee?.name}</p>
                </article>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {view === 'gantt' ? <Gantt tasks={row.tasks} onMove={(id, startDate, endDate) => moveTask.mutate({ id, startDate, endDate })} /> : null}
      {view === 'time' || view === 'kanban' ? (
        <form className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-3" onSubmit={(event) => { event.preventDefault(); addTask.mutate() }}>
          <Field label={t('projects.task')}><Input value={task.name} onChange={(event) => setTask({ ...task, name: event.target.value })} required /></Field>
          <Field label={t('projects.assignee')}>
            <Select value={task.assigneeId} onChange={(event) => setTask({ ...task, assigneeId: event.target.value })}>
              <option value="">{t('projects.assignee')}</option>
              {(employees.data ?? []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </Select>
          </Field>
          <Field label={t('projects.depends')}>
            <Select value={task.dependsOnId} onChange={(event) => setTask({ ...task, dependsOnId: event.target.value })}>
              <option value="">{t('projects.depends')}</option>
              {row.tasks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </Select>
          </Field>
          <Field label={t('projects.start')}><Input type="date" value={task.startDate} onChange={(event) => setTask({ ...task, startDate: event.target.value })} /></Field>
          <Field label={t('projects.end')}><Input type="date" value={task.endDate} onChange={(event) => setTask({ ...task, endDate: event.target.value })} /></Field>
          <div className="self-end"><Button type="submit">{t('projects.addTask')}</Button></div>
        </form>
      ) : null}
      {view === 'time' ? (
        <div className="grid gap-4">
          <form className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); addSheet.mutate() }}>
            <Field label={t('projects.task')}>
              <Select value={sheet.taskId} onChange={(event) => setSheet({ ...sheet, taskId: event.target.value })} required>
                <option value="">{t('projects.task')}</option>
                {row.tasks.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </Select>
            </Field>
            <Field label={t('projects.assignee')}>
              <Select value={sheet.employeeId} onChange={(event) => setSheet({ ...sheet, employeeId: event.target.value })} required>
                <option value="">{t('projects.assignee')}</option>
                {(employees.data ?? []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </Select>
            </Field>
            <Field label={t('desk.date')}><Input type="date" value={sheet.workDate} onChange={(event) => setSheet({ ...sheet, workDate: event.target.value })} required /></Field>
            <Field label={t('projects.hours')}><Input value={sheet.hours} onChange={(event) => setSheet({ ...sheet, hours: event.target.value })} required /></Field>
            <div><Button type="submit">{t('projects.timesheets')}</Button></div>
          </form>
          <TimesheetTable rows={row.timesheets} onApprove={(id) => approveSheet.mutate(id)} />
        </div>
      ) : null}
      {view === 'bill' ? (
        <div className="grid gap-4">
          <BaseCurrencyNote />
          <p className="text-sm text-muted-foreground">{t('projects.unbilled')}</p>
          {row.billingType === 'time' ? <TimesheetTable rows={row.timesheets.filter((item) => item.state === 'approved' || item.state === 'invoiced')} onApprove={(id) => approveSheet.mutate(id)} /> : null}
          {row.billingType === 'fixed' ? (
            <form className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2" onSubmit={(event: FormEvent) => { event.preventDefault(); addMilestone.mutate() }}>
              <Field label={t('projects.milestone')}><Input value={milestone.name} onChange={(event) => setMilestone({ ...milestone, name: event.target.value })} required /></Field>
              <Field label={<BaseMoneyLabel text={t('projects.milestoneAmount')} />}><Input value={milestone.amount} onChange={(event) => setMilestone({ ...milestone, amount: event.target.value })} required /></Field>
              <div><Button type="submit">{t('projects.addMilestone')}</Button></div>
              <ul className="text-sm md:col-span-2">
                {row.milestones.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 border-t border-border py-2">
                    <span>{item.name} · {money(item.amount)} · {item.state}</span>
                    {item.state === 'open' ? <Button size="sm" type="button" onClick={() => approveMilestone.mutate(item.id)}>{t('projects.approve')}</Button> : null}
                  </li>
                ))}
              </ul>
            </form>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button data-tour="tour-bill" onClick={() => invoice.mutate()} disabled={invoice.isPending}>{t('projects.invoice')}</Button>
            {invoiceName ? <p className="text-sm">{invoiceName}</p> : null}
          </div>
        </div>
      ) : null}
      {view === 'profit' ? <ProfitCard profit={row.profitability} /> : null}
    </div>
  )
}

function TimesheetTable({ rows, onApprove }: { rows: Timesheet[]; onApprove: (id: number) => void }) {
  const { t } = useI18n()
  const shortDate = useShortDate()
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t('desk.date')}</th>
            <th className="px-4 py-2 font-medium">{t('projects.task')}</th>
            <th className="px-4 py-2 font-medium">{t('projects.assignee')}</th>
            <th className="px-4 py-2 font-medium">{t('projects.hours')}</th>
            <th className="px-4 py-2 font-medium">{t('desk.state')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id} className="border-t border-border">
              <td className="px-4 py-2">{shortDate(item.workDate)}</td>
              <td className="px-4 py-2">{item.task.name}</td>
              <td className="px-4 py-2">{item.employee.name}</td>
              <td className="px-4 py-2">{item.hours}</td>
              <td className="px-4 py-2">
                {item.state}{item.invoice ? ` · ${item.invoice.name}` : ''}
                {item.state === 'draft' ? <Button className="ml-2" size="sm" type="button" onClick={() => onApprove(item.id)}>{t('projects.approve')}</Button> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ProfitCard({ profit }: { profit: Profit }) {
  const { t } = useI18n()
  const money = useMoney()
  const rows = [
    [t('projects.revenue'), profit.revenue],
    [t('projects.cost'), profit.timesheetCost],
    [t('projects.expenses'), profit.expenses],
    [t('projects.margin'), profit.profit],
  ] as const
  return (
    <section className="grid max-w-lg gap-2 rounded-lg border border-border bg-card p-4" data-tour="tour-margin">
      <h2 className="font-semibold">{t('projects.profit')}</h2>
      <BaseCurrencyNote />
      {rows.map(([label, value]) => (
        <p key={label} className="flex justify-between text-sm"><span>{label}</span><span>{money(value)}</span></p>
      ))}
    </section>
  )
}

function dayNumber(value: string) {
  return Math.floor(new Date(value).getTime() / 86400000)
}

function Gantt({ tasks, onMove }: { tasks: Task[]; onMove: (id: number, start: string, end: string) => void }) {
  const { t } = useI18n()
  const dated = tasks.filter((task) => task.startDate && task.endDate)
  if (dated.length === 0) return <p className="text-sm text-muted-foreground">{t('projects.gantt')}</p>
  const start = Math.min(...dated.map((task) => dayNumber(task.startDate ?? '')))
  const end = Math.max(...dated.map((task) => dayNumber(task.endDate ?? '')))
  const span = Math.max(1, end - start)
  const dayWidth = 28
  const labelWidth = 180
  const width = labelWidth + (span + 1) * dayWidth
  const height = dated.length * 42 + 16
  const byId = new Map(dated.map((task, index) => [task.id, { task, index }]))
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card p-3">
      <svg width={width} height={height} role="img" aria-label={t('projects.gantt')}>
        {dated.flatMap((task) => task.blockedBy.map((link) => {
          const from = byId.get(link.dependsOnId)
          const to = byId.get(task.id)
          if (!from || !to || !from.task.endDate || !to.task.startDate) return null
          const x1 = labelWidth + (dayNumber(from.task.endDate) - start + 1) * dayWidth
          const y1 = 16 + from.index * 42 + 14
          const x2 = labelWidth + (dayNumber(to.task.startDate) - start) * dayWidth
          const y2 = 16 + to.index * 42 + 14
          return <path key={`${task.id}-${link.dependsOnId}`} d={`M ${x1} ${y1} C ${x1 + 16} ${y1}, ${x2 - 16} ${y2}, ${x2} ${y2}`} fill="none" stroke="currentColor" strokeWidth="1.5" />
        }))}
      </svg>
      <div className="relative" style={{ width, height, marginTop: -height }}>
        {dated.map((task, index) => {
          const left = labelWidth + (dayNumber(task.startDate ?? '') - start) * dayWidth
          const bar = Math.max(dayWidth, (dayNumber(task.endDate ?? '') - dayNumber(task.startDate ?? '') + 1) * dayWidth)
          return (
            <div key={task.id} className="absolute flex items-center" style={{ top: 12 + index * 42, left: 0, width }}>
              <p className="w-[180px] truncate pr-2 text-sm">{task.name}</p>
              <button
                type="button"
                className="absolute h-7 cursor-ew-resize rounded-md bg-[var(--kl-color-primary-fill)] text-left text-xs text-white"
                style={{ left, width: bar }}
                onPointerDown={(event) => startDrag(event, task, onMove)}
              >
                <span className="px-2">{task.assignee?.name}</span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function startDrag(event: PointerEvent<HTMLButtonElement>, task: Task, onMove: (id: number, start: string, end: string) => void) {
  if (!task.startDate || !task.endDate) return
  const origin = event.clientX
  const start = task.startDate.slice(0, 10)
  const end = task.endDate.slice(0, 10)
  const target = event.currentTarget
  target.setPointerCapture(event.pointerId)
  const finish = (up: PointerEvent) => {
    const days = Math.round((up.clientX - origin) / 28)
    target.removeEventListener('pointerup', finish as unknown as EventListener)
    if (days === 0) return
    onMove(task.id, shiftDay(start, days), shiftDay(end, days))
  }
  target.addEventListener('pointerup', finish as unknown as EventListener)
}

function shiftDay(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
