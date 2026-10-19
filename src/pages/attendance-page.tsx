import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { PageHeader, Panel } from '../components/surface.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useShortDate } from '../lib/format.ts'

type Person = { id: number; name: string }

type Shift = { id: number; name: string; start: string; end: string; startMinutes: number; endMinutes: number }

type AttendanceRow = {
  id: number
  employeeId: number
  employeeName: string
  workDate: string
  status: string
  note: string | null
  checkIn: string | null
  checkOut: string | null
  workedHours: number | null
  late: boolean
}

type AttendanceBoard = { shift: Shift | null; employees: Person[]; rows: AttendanceRow[] }

type LeaveType = { id: number; name: string; code: string; paid: boolean }
type Balance = {
  id: number
  employeeId: number
  employeeName: string
  leaveTypeId: number
  code: string
  name: string
  year: number
  allocated: number
  used: number
  remaining: number
}
type LeaveRequest = {
  id: number
  kind: string
  dateFrom: string
  dateTo: string
  state: string
  reason: string | null
  employee: Person
}
type LeaveBoard = { year: number; types: LeaveType[]; employees: Person[]; balances: Balance[]; requests: LeaveRequest[] }
type CalendarRow = {
  id: number
  employeeName: string
  kind: string
  state: string
  dateFrom: string
  dateTo: string
}

const selectClass = 'h-10 w-full rounded-md border border-border bg-card px-3 text-sm'

function stamp(date: Date) {
  return date.toISOString().slice(0, 10)
}

function monthAgo() {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - 31)
  return stamp(date)
}

function clock(value: string | null) {
  if (!value) return '—'
  return value.slice(11, 16)
}

function statusLabel(status: string, t: Translate) {
  switch (status) {
    case 'present':
      return t('hr.present')
    case 'late':
      return t('hr.late')
    case 'absent':
      return t('hr.absent')
    default:
      return status
  }
}

function leaveState(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('lv.draft')
    case 'approved':
      return t('lv.approved')
    case 'refused':
      return t('lv.refused')
    default:
      return state
  }
}

export function AttendancePage() {
  const { t } = useI18n()
  const shortDate = useShortDate()
  const [params] = useSearchParams()
  const [from, setFrom] = useState(monthAgo())
  const [to, setTo] = useState(stamp(new Date()))
  const board = useQuery({
    queryKey: ['attendance', from, to],
    queryFn: () => api<AttendanceBoard>(`/api/attendance?from=${from}&to=${to}`),
  })
  const lateOnly = params.get('late') === '1'
  const status = params.get('status')
  if (board.isLoading) return <p className="text-sm text-muted-foreground">{t('att.loading')}</p>
  if (board.isError) return <p className="text-sm text-destructive">{board.error.message}</p>
  const data = board.data
  if (!data) return null
  const rows = data.rows.filter((row) => {
    if (lateOnly && !row.late) return false
    if (status && row.status !== status) return false
    return true
  })
  return (
    <div className="grid gap-6">
      <PageHeader title={t('att.title')} lead={t('att.lead')} />
      <ShiftForm shift={data.shift} />
      <PunchBar employees={data.employees} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('att.from')}>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label={t('att.to')}>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>
      {rows.length === 0 ? <EmptyState title={t('att.empty')} body={t('att.lead')} /> : (
        <div className="keel-table overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('att.employee')}</th>
                <th className="px-3 py-2 font-medium">{t('att.date')}</th>
                <th className="px-3 py-2 font-medium">{t('att.in')}</th>
                <th className="px-3 py-2 font-medium">{t('att.out')}</th>
                <th className="px-3 py-2 font-medium">{t('att.hours')}</th>
                <th className="px-3 py-2 font-medium">{t('att.status')}</th>
                <th className="px-3 py-2 font-medium">{t('att.late')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="px-3 py-2">
                    <Link className="font-semibold text-primary" to={`/hr/${row.employeeId}`}>{row.employeeName}</Link>
                  </td>
                  <td className="px-3 py-2">{shortDate(row.workDate)}</td>
                  <td className="px-3 py-2 tabular-nums">{clock(row.checkIn)}</td>
                  <td className="px-3 py-2 tabular-nums">{clock(row.checkOut)}</td>
                  <td className="px-3 py-2 tabular-nums">{row.workedHours ?? '—'}</td>
                  <td className="px-3 py-2">{statusLabel(row.status, t)}{row.note ? ` · ${row.note}` : ''}</td>
                  <td className="px-3 py-2">
                    {row.late ? <Badge tone="refused">{t('att.late')}</Badge> : <span className="text-muted-foreground">{t('att.onTime')}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ShiftForm({ shift }: { shift: Shift | null }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ name: shift?.name ?? 'Day', start: shift?.start ?? '09:00', end: shift?.end ?? '17:30' })
  const [error, setError] = useState('')
  const save = useMutation({
    mutationFn: () => api('/api/attendance/shift', { method: 'PUT', body: JSON.stringify(form) }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('att.failed')),
  })
  return (
    <Panel>
      <form
        className="grid gap-3 md:grid-cols-4"
        onSubmit={(event) => {
          event.preventDefault()
          save.mutate()
        }}
      >
        <h2 className="font-serif text-2xl md:col-span-4">{t('att.shift')}</h2>
        {error ? <div className="md:col-span-4"><Notice message={error} /></div> : null}
        <Field label={t('att.shiftName')}>
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label={t('att.start')}>
          <Input type="time" value={form.start} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
        </Field>
        <Field label={t('att.end')}>
          <Input type="time" value={form.end} onChange={(event) => setForm({ ...form, end: event.target.value })} required />
        </Field>
        <div className="flex items-end">
          <Button type="submit" disabled={save.isPending}>{t('att.saveShift')}</Button>
        </div>
      </form>
    </Panel>
  )
}

export function PunchBar({ employees }: { employees: Person[] }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [employeeId, setEmployeeId] = useState('')
  const [error, setError] = useState('')
  const [note, setNote] = useState('')
  const selected = employeeId || (employees[0] ? String(employees[0].id) : '')
  const punch = useMutation({
    mutationFn: (action: 'in' | 'out') => api<{ workedHours: number | null; late: boolean }>('/api/attendance/punch', {
      method: 'POST',
      body: JSON.stringify({ employeeId: Number(selected), action }),
    }),
    onSuccess: async (row, action) => {
      setError('')
      setNote(action === 'out' ? `${t('att.hours')}: ${row.workedHours ?? '—'}` : row.late ? t('att.late') : t('att.onTime'))
      await queryClient.invalidateQueries({ queryKey: ['attendance'] })
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      await queryClient.invalidateQueries({ queryKey: ['employee'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('att.failed')),
  })
  if (employees.length === 0) return null
  return (
    <Panel>
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('att.employee')}>
          <select className={selectClass} value={selected} onChange={(event) => setEmployeeId(event.target.value)}>
            {employees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </Field>
        <Button onClick={() => punch.mutate('in')} disabled={punch.isPending}>{t('att.checkIn')}</Button>
        <Button variant="outline" onClick={() => punch.mutate('out')} disabled={punch.isPending}>{t('att.checkOut')}</Button>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {error ? <div className="mt-3"><Notice message={error} /></div> : null}
    </Panel>
  )
}

export function LeavePage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const board = useQuery({ queryKey: ['leave'], queryFn: () => api<LeaveBoard>('/api/leave') })
  const view = params.get('view')
  const state = params.get('state')
  if (board.isLoading) return <p className="text-sm text-muted-foreground">{t('att.loading')}</p>
  if (board.isError) return <p className="text-sm text-destructive">{board.error.message}</p>
  const data = board.data
  if (!data) return null
  function open(next: Record<string, string>) {
    setParams(next)
  }
  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('lv.title')}
        lead={t('lv.lead')}
        actions={
          <>
            <Button variant={!view && !state ? 'default' : 'outline'} onClick={() => open({})}>{t('lv.requests')}</Button>
            <Button variant={state === 'draft' ? 'default' : 'outline'} onClick={() => open({ state: 'draft' })}>{t('lv.draft')}</Button>
            <Button variant={view === 'types' ? 'default' : 'outline'} onClick={() => open({ view: 'types' })}>{t('lv.types')}</Button>
            <Button variant={view === 'calendar' ? 'default' : 'outline'} onClick={() => open({ view: 'calendar' })}>{t('lv.calendar')}</Button>
          </>
        }
      />
      {view === 'calendar' ? <LeaveCalendar /> : null}
      {view === 'types' ? <TypeEditor types={data.types} employees={data.employees} year={data.year} /> : null}
      {view !== 'calendar' && view !== 'types' ? (
        <>
          <RequestForm employees={data.employees} types={data.types} />
          <RequestList requests={state ? data.requests.filter((row) => row.state === state) : data.requests} />
        </>
      ) : null}
      <BalanceTable balances={data.balances} />
    </div>
  )
}

function BalanceTable({ balances }: { balances: Balance[] }) {
  const { t } = useI18n()
  if (balances.length === 0) return null
  return (
    <Panel>
      <h2 className="font-serif text-2xl">{t('lv.balances')}</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-2 py-2 font-medium">{t('att.employee')}</th>
              <th className="px-2 py-2 font-medium">{t('lv.kind')}</th>
              <th className="px-2 py-2 font-medium">{t('lv.allocated')}</th>
              <th className="px-2 py-2 font-medium">{t('lv.used')}</th>
              <th className="px-2 py-2 font-medium">{t('lv.remaining')}</th>
            </tr>
          </thead>
          <tbody>
            {balances.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-2 py-2">{row.employeeName}</td>
                <td className="px-2 py-2">{row.name}</td>
                <td className="px-2 py-2 tabular-nums">{row.allocated}</td>
                <td className="px-2 py-2 tabular-nums">{row.used}</td>
                <td className="px-2 py-2 tabular-nums">{row.remaining}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

function RequestList({ requests }: { requests: LeaveRequest[] }) {
  const { t } = useI18n()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: number; action: 'approve' | 'refuse' }) =>
      api(`/api/leave/${id}/${action}`, { method: 'POST' }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['leave'] })
      await queryClient.invalidateQueries({ queryKey: ['leave-calendar'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('att.failed')),
  })
  return (
    <section className="grid gap-2">
      <h2 className="font-serif text-2xl">{t('lv.requests')}</h2>
      {error ? <Notice message={error} /> : null}
      {requests.length === 0 ? <EmptyState title={t('lv.empty')} body={t('lv.lead')} /> : null}
      {requests.map((row) => (
        <article key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm">
          <span>
            <span className="font-semibold">{row.employee.name}</span>
            <span className="text-muted-foreground"> · {row.kind} · {shortDate(row.dateFrom)} – {shortDate(row.dateTo)} · {leaveState(row.state, t)}</span>
            {row.reason ? <span className="mt-0.5 block text-muted-foreground">{row.reason}</span> : null}
          </span>
          {row.state === 'draft' ? (
            <span className="flex gap-2">
              <Button size="sm" onClick={() => decide.mutate({ id: row.id, action: 'approve' })}>{t('lv.approve')}</Button>
              <Button size="sm" variant="outline" onClick={() => decide.mutate({ id: row.id, action: 'refuse' })}>{t('lv.refuse')}</Button>
            </span>
          ) : null}
        </article>
      ))}
    </section>
  )
}

function RequestForm({ employees, types }: { employees: Person[]; types: LeaveType[] }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ employeeId: '', code: types[0]?.code ?? '', dateFrom: '', dateTo: '', reason: '' })
  const [error, setError] = useState('')
  const code = form.code || types[0]?.code || ''
  const employeeId = form.employeeId || (employees[0] ? String(employees[0].id) : '')
  const ask = useMutation({
    mutationFn: () => api('/api/leave/requests', {
      method: 'POST',
      body: JSON.stringify({ ...form, employeeId: Number(employeeId), code }),
    }),
    onSuccess: async () => {
      setError('')
      setForm({ ...form, dateFrom: '', dateTo: '', reason: '' })
      await queryClient.invalidateQueries({ queryKey: ['leave'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('att.failed')),
  })
  if (employees.length === 0 || types.length === 0) return null
  return (
    <Panel>
      <form
        className="grid gap-3 md:grid-cols-5"
        onSubmit={(event: FormEvent) => {
          event.preventDefault()
          ask.mutate()
        }}
      >
        <h2 className="font-serif text-2xl md:col-span-5">{t('lv.request')}</h2>
        {error ? <div className="md:col-span-5"><Notice message={error} /></div> : null}
        <Field label={t('att.employee')}>
          <select className={selectClass} value={employeeId} onChange={(event) => setForm({ ...form, employeeId: event.target.value })}>
            {employees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </Field>
        <Field label={t('lv.kind')}>
          <select className={selectClass} value={code} onChange={(event) => setForm({ ...form, code: event.target.value })}>
            {types.map((type) => <option key={type.id} value={type.code}>{type.name}</option>)}
          </select>
        </Field>
        <Field label={t('att.from')}>
          <Input type="date" value={form.dateFrom} required onChange={(event) => setForm({ ...form, dateFrom: event.target.value })} />
        </Field>
        <Field label={t('att.to')}>
          <Input type="date" value={form.dateTo} required onChange={(event) => setForm({ ...form, dateTo: event.target.value })} />
        </Field>
        <Field label={t('lv.reason')}>
          <Input value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
        </Field>
        <div className="md:col-span-5">
          <Button type="submit" disabled={ask.isPending}>{t('lv.request')}</Button>
        </div>
      </form>
    </Panel>
  )
}

function TypeEditor({ types, employees, year }: { types: LeaveType[]; employees: Person[]; year: number }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [typeForm, setTypeForm] = useState({ name: '', code: '', paid: true })
  const [allocation, setAllocation] = useState({ employeeId: '', leaveTypeId: '', days: '1' })
  const [error, setError] = useState('')
  const employeeId = allocation.employeeId || (employees[0] ? String(employees[0].id) : '')
  const leaveTypeId = allocation.leaveTypeId || (types[0] ? String(types[0].id) : '')
  const addType = useMutation({
    mutationFn: () => api('/api/leave/types', { method: 'POST', body: JSON.stringify(typeForm) }),
    onSuccess: async () => {
      setTypeForm({ name: '', code: '', paid: true })
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['leave'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('att.failed')),
  })
  const allocate = useMutation({
    mutationFn: () => api('/api/leave/allocations', {
      method: 'POST',
      body: JSON.stringify({
        employeeId: Number(employeeId),
        leaveTypeId: Number(leaveTypeId),
        year,
        days: Number(allocation.days),
      }),
    }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['leave'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('att.failed')),
  })
  return (
    <div className="grid gap-4">
      {error ? <Notice message={error} /> : null}
      <Panel>
        <h2 className="font-serif text-2xl">{t('lv.types')}</h2>
        {types.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('lv.noTypes')}</p> : (
          <ul className="mt-2 grid gap-1 text-sm">
            {types.map((type) => (
              <li key={type.id}>{type.name} · {type.code}{type.paid ? ` · ${t('lv.paid')}` : ''}</li>
            ))}
          </ul>
        )}
        <form
          className="mt-3 grid gap-3 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            addType.mutate()
          }}
        >
          <Field label={t('lv.name')}>
            <Input value={typeForm.name} required onChange={(event) => setTypeForm({ ...typeForm, name: event.target.value })} />
          </Field>
          <Field label={t('lv.code')}>
            <Input value={typeForm.code} required onChange={(event) => setTypeForm({ ...typeForm, code: event.target.value })} />
          </Field>
          <label className="flex items-center gap-2 text-sm md:mt-6">
            <input type="checkbox" checked={typeForm.paid} onChange={(event) => setTypeForm({ ...typeForm, paid: event.target.checked })} />
            {t('lv.paid')}
          </label>
          <div className="flex items-end">
            <Button type="submit" disabled={addType.isPending}>{t('lv.addType')}</Button>
          </div>
        </form>
      </Panel>
      {employees.length > 0 && types.length > 0 ? (
        <Panel>
          <form
            className="grid gap-3 md:grid-cols-4"
            onSubmit={(event) => {
              event.preventDefault()
              allocate.mutate()
            }}
          >
            <h2 className="font-serif text-2xl md:col-span-4">{t('lv.allocate')}</h2>
            <Field label={t('att.employee')}>
              <select className={selectClass} value={employeeId} onChange={(event) => setAllocation({ ...allocation, employeeId: event.target.value })}>
                {employees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </Field>
            <Field label={t('lv.kind')}>
              <select className={selectClass} value={leaveTypeId} onChange={(event) => setAllocation({ ...allocation, leaveTypeId: event.target.value })}>
                {types.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
              </select>
            </Field>
            <Field label={t('lv.days')}>
              <Input type="number" min={0} max={366} step="0.5" value={allocation.days} onChange={(event) => setAllocation({ ...allocation, days: event.target.value })} required />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={allocate.isPending}>{t('lv.allocate')}</Button>
            </div>
          </form>
        </Panel>
      ) : null}
    </div>
  )
}

function LeaveCalendar() {
  const { t } = useI18n()
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() }
  })
  const from = stamp(new Date(Date.UTC(cursor.year, cursor.month, 1)))
  const to = stamp(new Date(Date.UTC(cursor.year, cursor.month + 1, 0)))
  const calendar = useQuery({
    queryKey: ['leave-calendar', from, to],
    queryFn: () => api<CalendarRow[]>(`/api/leave/calendar?from=${from}&to=${to}`),
  })
  const first = new Date(Date.UTC(cursor.year, cursor.month, 1))
  const days = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate()
  const lead = first.getUTCDay()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)]
  function shift(by: number) {
    const next = new Date(Date.UTC(cursor.year, cursor.month + by, 1))
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() })
  }
  return (
    <Panel>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-serif text-2xl">{t('lv.calendar')}</h2>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => shift(-1)}>←</Button>
          <span className="text-sm font-semibold">{from.slice(0, 7)}</span>
          <Button variant="outline" size="sm" onClick={() => shift(1)}>→</Button>
        </div>
      </div>
      {calendar.isLoading ? <p className="text-sm text-muted-foreground">{t('att.loading')}</p> : null}
      {calendar.isError ? <p className="text-sm text-destructive">{calendar.error.message}</p> : null}
      <div className="grid grid-cols-7 gap-1 text-xs">
        {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((label) => (
          <div key={label} className="px-1 py-1 text-muted-foreground">{label}</div>
        ))}
        {cells.map((day, index) => {
          const key = day ? stamp(new Date(Date.UTC(cursor.year, cursor.month, day))) : `pad-${index}`
          const hits = day && calendar.data
            ? calendar.data.filter((row) => row.dateFrom.slice(0, 10) <= key && row.dateTo.slice(0, 10) >= key)
            : []
          return (
            <div key={key} className="min-h-16 rounded-md border border-border p-1">
              <p className="font-semibold">{day ?? ''}</p>
              {hits.map((hit) => (
                <p key={hit.id} className="truncate text-[11px] text-muted-foreground">{hit.employeeName}</p>
              ))}
            </div>
          )
        })}
      </div>
    </Panel>
  )
}
