import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ExportButton } from '../components/export-button.tsx'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useShortDate } from '../lib/format.ts'

type Department = { id: number; name: string; _count: { employees: number } }

type Attendance = { id: number; workDate: string; status: string; note: string | null }

type Leave = {
  id: number
  kind: string
  dateFrom: string
  dateTo: string
  state: string
  reason: string | null
}

type Employee = {
  id: number
  name: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  active: boolean
  departmentId: number | null
  department: { id: number; name: string } | null
  attendances: Attendance[]
  leaves: Leave[]
}

function attendanceLabel(status: string, t: Translate) {
  switch (status) {
    case 'present':
      return t('hr.present')
    case 'absent':
      return t('hr.absent')
    case 'late':
      return t('hr.late')
    default:
      return status
  }
}

function leaveKind(kind: string, t: Translate) {
  switch (kind) {
    case 'annual':
      return t('hr.annual')
    case 'sick':
      return t('hr.sick')
    case 'personal':
      return t('hr.personal')
    default:
      return kind
  }
}

function leaveState(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('hr.draft')
    case 'approved':
      return t('hr.approved')
    case 'refused':
      return t('hr.refused')
    default:
      return state
  }
}

function employeeBody(employee: {
  name: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  departmentId: number | null
  active: boolean
}) {
  return {
    name: employee.name,
    email: employee.email ?? '',
    phone: employee.phone ?? '',
    jobTitle: employee.jobTitle ?? '',
    departmentId: employee.departmentId,
    active: employee.active,
  }
}

export function HrPage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [departmentName, setDepartmentName] = useState('')
  const [form, setForm] = useState({ name: '', email: '', phone: '', jobTitle: '', departmentId: '' })
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<Department[]>('/api/departments') })
  const employees = useQuery({ queryKey: ['employees'], queryFn: () => api<Employee[]>('/api/employees') })

  const addDepartment = useMutation({
    mutationFn: () => api('/api/departments', { method: 'POST', body: JSON.stringify({ name: departmentName }) }),
    onSuccess: async () => {
      setDepartmentName('')
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['departments'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hr.failed')),
  })
  const addEmployee = useMutation({
    mutationFn: () =>
      api<Employee>('/api/employees', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          jobTitle: form.jobTitle,
          departmentId: form.departmentId ? Number(form.departmentId) : null,
          active: true,
        }),
      }),
    onSuccess: async (employee) => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['employees'] })
      navigate(`/hr/${employee.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hr.failed')),
  })

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('hr.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('hr.lead')}</p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
          <Link className="text-primary hover:underline" to="/hr/payroll">{t('pay.openPayroll')}</Link>
          <Link className="text-primary hover:underline" to="/hr/expenses">{t('pay.openExpenses')}</Link>
        </div>
      </div>
      {error ? <Notice message={error} /> : null}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="font-serif text-2xl">{t('hr.departments')}</h2>
        <ul className="mt-3 flex flex-wrap gap-2">
          {departments.data?.map((department) => (
            <li key={department.id} className="rounded-md border border-border px-3 py-2 text-sm">
              {department.name}
              <span className="text-muted-foreground"> · {department._count.employees}</span>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            addDepartment.mutate()
          }}
        >
          <Input className="max-w-xs" value={departmentName} onChange={(event) => setDepartmentName(event.target.value)} required placeholder={t('hr.department')} />
          <Button type="submit" disabled={addDepartment.isPending}>{t('hr.newDepartment')}</Button>
        </form>
      </section>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-serif text-2xl">{t('hr.employees')}</h2>
          <ExportButton kind="employees" />
        </div>
        {employees.isLoading ? <p className="text-sm text-muted-foreground">{t('hr.loading')}</p> : null}
        {employees.data && employees.data.length === 0 ? <EmptyState title={t('hr.empty')} body={t('hr.lead')} /> : null}
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {employees.data?.map((employee) => (
                <tr key={employee.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/hr/${employee.id}`}>{employee.name}</Link>
                  </td>
                  <td className="px-4 py-3">{employee.jobTitle}</td>
                  <td className="px-4 py-3">{employee.department?.name ?? t('hr.none')}</td>
                  <td className="px-4 py-3">{employee.active ? t('hr.active') : t('hr.inactive')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-6"
          onSubmit={(event) => {
            event.preventDefault()
            addEmployee.mutate()
          }}
        >
          <Field label={t('hr.name')}>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label={t('hr.job')}>
            <Input value={form.jobTitle} onChange={(event) => setForm({ ...form, jobTitle: event.target.value })} />
          </Field>
          <Field label={t('hr.department')}>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={form.departmentId}
              onChange={(event) => setForm({ ...form, departmentId: event.target.value })}
            >
              <option value="">{t('hr.none')}</option>
              {departments.data?.map((department) => (
                <option key={department.id} value={department.id}>{department.name}</option>
              ))}
            </select>
          </Field>
          <Field label={t('hr.email')}>
            <Input value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label={t('hr.phone')}>
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={addEmployee.isPending} className="w-full">{t('hr.newEmployee')}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}

export function EmployeePage() {
  const { id } = useParams()
  const { t } = useI18n()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const employee = useQuery({ queryKey: ['employee', id], queryFn: () => api<Employee>(`/api/employees/${id}`) })
  const departments = useQuery({ queryKey: ['departments'], queryFn: () => api<Department[]>('/api/departments') })
  const [draft, setDraft] = useState<Employee | null>(null)
  const current = draft ?? employee.data ?? null
  const [day, setDay] = useState({ workDate: '', status: 'present', note: '' })
  const [leave, setLeave] = useState({ kind: 'annual', dateFrom: '', dateTo: '', reason: '' })

  async function refresh() {
    setError('')
    setDraft(null)
    await queryClient.invalidateQueries({ queryKey: ['employee', id] })
    await queryClient.invalidateQueries({ queryKey: ['employees'] })
  }

  const save = useMutation({
    mutationFn: () => {
      if (!current) throw new Error('missing')
      return api(`/api/employees/${id}`, { method: 'PATCH', body: JSON.stringify(employeeBody(current)) })
    },
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hr.failed')),
  })
  const mark = useMutation({
    mutationFn: () => api(`/api/employees/${id}/attendance`, { method: 'POST', body: JSON.stringify(day) }),
    onSuccess: () => {
      setDay({ workDate: '', status: 'present', note: '' })
      void refresh()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hr.failed')),
  })
  const askLeave = useMutation({
    mutationFn: () => api(`/api/employees/${id}/leave`, { method: 'POST', body: JSON.stringify(leave) }),
    onSuccess: () => {
      setLeave({ kind: 'annual', dateFrom: '', dateTo: '', reason: '' })
      void refresh()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hr.failed')),
  })
  const decide = useMutation({
    mutationFn: ({ leaveId, action }: { leaveId: number; action: 'approve' | 'refuse' }) =>
      api(`/api/employees/${id}/leave/${leaveId}/${action}`, { method: 'POST' }),
    onSuccess: () => void refresh(),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('hr.failed')),
  })

  if (employee.isLoading) return <p className="text-sm text-muted-foreground">{t('hr.loading')}</p>
  if (employee.isError) return <p className="text-sm text-destructive">{employee.error.message}</p>
  if (!current) return null

  function onSave(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }

  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm font-semibold text-primary" to="/hr">{t('hr.back')}</Link>
        <h1 className="mt-1 font-serif text-4xl tracking-tight">{current.name}</h1>
        <p className="mt-1 text-muted-foreground">{current.department?.name ?? t('hr.none')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <form onSubmit={onSave} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <Field label={t('hr.name')}>
          <Input value={current.name} onChange={(event) => setDraft({ ...current, name: event.target.value })} required />
        </Field>
        <Field label={t('hr.job')}>
          <Input value={current.jobTitle ?? ''} onChange={(event) => setDraft({ ...current, jobTitle: event.target.value })} />
        </Field>
        <Field label={t('hr.email')}>
          <Input value={current.email ?? ''} onChange={(event) => setDraft({ ...current, email: event.target.value })} />
        </Field>
        <Field label={t('hr.phone')}>
          <Input value={current.phone ?? ''} onChange={(event) => setDraft({ ...current, phone: event.target.value })} />
        </Field>
        <Field label={t('hr.department')}>
          <select
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            value={current.departmentId ?? ''}
            onChange={(event) => setDraft({ ...current, departmentId: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">{t('hr.none')}</option>
            {departments.data?.map((department) => (
              <option key={department.id} value={department.id}>{department.name}</option>
            ))}
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={current.active} onChange={(event) => setDraft({ ...current, active: event.target.checked })} />
          {t('hr.active')}
        </label>
        <div className="md:col-span-2">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? t('hr.saving') : t('hr.save')}</Button>
        </div>
      </form>
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">{t('hr.attendance')}</h2>
        {current.attendances.length === 0 ? <p className="text-sm text-muted-foreground">{t('hr.noAttendance')}</p> : null}
        <ul className="grid gap-2">
          {current.attendances.map((row) => (
            <li key={row.id} className="rounded-md border border-border bg-card px-4 py-3 text-sm">
              <span className="font-semibold">{shortDate(row.workDate)}</span>
              <span className="text-muted-foreground"> · {attendanceLabel(row.status, t)}</span>
              {row.note ? <span className="text-muted-foreground"> · {row.note}</span> : null}
            </li>
          ))}
        </ul>
        <form
          className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault()
            mark.mutate()
          }}
        >
          <Field label={t('hr.date')}>
            <Input type="date" value={day.workDate} onChange={(event) => setDay({ ...day, workDate: event.target.value })} required />
          </Field>
          <Field label={t('hr.status')}>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={day.status}
              onChange={(event) => setDay({ ...day, status: event.target.value })}
            >
              <option value="present">{t('hr.present')}</option>
              <option value="late">{t('hr.late')}</option>
              <option value="absent">{t('hr.absent')}</option>
            </select>
          </Field>
          <Field label={t('hr.note')}>
            <Input value={day.note} onChange={(event) => setDay({ ...day, note: event.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full">{t('hr.mark')}</Button>
          </div>
        </form>
      </section>
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">{t('hr.leave')}</h2>
        {current.leaves.length === 0 ? <p className="text-sm text-muted-foreground">{t('hr.noLeave')}</p> : null}
        <ul className="grid gap-2">
          {current.leaves.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm">
              <span>
                <span className="font-semibold">{leaveKind(row.kind, t)}</span>
                <span className="text-muted-foreground"> · {shortDate(row.dateFrom)} – {shortDate(row.dateTo)} · {leaveState(row.state, t)}</span>
                {row.reason ? <span className="mt-0.5 block text-muted-foreground">{row.reason}</span> : null}
              </span>
              {row.state === 'draft' ? (
                <span className="flex gap-2">
                  <Button size="sm" onClick={() => decide.mutate({ leaveId: row.id, action: 'approve' })}>{t('hr.approve')}</Button>
                  <Button size="sm" variant="outline" onClick={() => decide.mutate({ leaveId: row.id, action: 'refuse' })}>{t('hr.refuse')}</Button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <form
          className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-5"
          onSubmit={(event) => {
            event.preventDefault()
            askLeave.mutate()
          }}
        >
          <Field label={t('hr.kind')}>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
              value={leave.kind}
              onChange={(event) => setLeave({ ...leave, kind: event.target.value })}
            >
              <option value="annual">{t('hr.annual')}</option>
              <option value="sick">{t('hr.sick')}</option>
              <option value="personal">{t('hr.personal')}</option>
            </select>
          </Field>
          <Field label={t('hr.from')}>
            <Input type="date" value={leave.dateFrom} onChange={(event) => setLeave({ ...leave, dateFrom: event.target.value })} required />
          </Field>
          <Field label={t('hr.to')}>
            <Input type="date" value={leave.dateTo} onChange={(event) => setLeave({ ...leave, dateTo: event.target.value })} required />
          </Field>
          <Field label={t('hr.reason')}>
            <Input value={leave.reason} onChange={(event) => setLeave({ ...leave, reason: event.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full">{t('hr.request')}</Button>
          </div>
        </form>
      </section>
    </div>
  )
}
