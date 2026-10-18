import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select, Textarea } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Product = { id: number; name: string; sku: string }
type User = { role: string }
type Point = { id: number; name: string; trigger: string; checkType: string; operationName: string; product: Product }
type Check = {
  id: number
  status: string
  trigger: string
  operationName: string
  measured: number | null
  overrideReason: string | null
  quantity: number
  product: Product
  point: { name: string; checkType: string; minValue: number | null; maxValue: number | null; checklist: string }
  vendor: { name: string } | null
  alert: { id: number; status: string; quantity: number; heldFrom: string } | null
}
type Dashboard = {
  passRate: number | null
  passed: number
  failed: number
  pending: number
  openAlerts: number
  byProduct: Array<{ productId: number; name: string; pass: number; fail: number; pending: number }>
  byVendor: Array<{ vendorId: number; name: string; pass: number; fail: number; pending: number }>
}
type Alert = {
  id: number
  status: string
  action: string | null
  heldFrom: string
  quantity: number
  value: number
  product: Product
  vendor: { name: string } | null
}

export function QualityPage() {
  const { pathname } = useLocation()
  if (pathname.endsWith('/alerts')) return <AlertsView />
  return <DeskView />
}

function DeskView() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me') })
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const dashboard = useQuery({ queryKey: ['quality-dashboard'], queryFn: () => api<Dashboard>('/api/quality/dashboard') })
  const points = useQuery({ queryKey: ['quality-points'], queryFn: () => api<Point[]>('/api/quality/points') })
  const checks = useQuery({ queryKey: ['quality-checks'], queryFn: () => api<Check[]>('/api/quality/checks') })
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', productId: '', trigger: 'receipt', checkType: 'pass_fail', operationName: '', minValue: '', maxValue: '', checklist: '' })
  const [measure, setMeasure] = useState<Record<number, string>>({})
  const [reason, setReason] = useState<Record<number, string>>({})

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['quality-dashboard'] })
    await queryClient.invalidateQueries({ queryKey: ['quality-points'] })
    await queryClient.invalidateQueries({ queryKey: ['quality-checks'] })
  }
  const savePoint = useMutation({
    mutationFn: () => api('/api/quality/points', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        productId: Number(form.productId),
        trigger: form.trigger,
        checkType: form.checkType,
        operationName: form.operationName,
        minValue: form.minValue === '' ? null : Number(form.minValue),
        maxValue: form.maxValue === '' ? null : Number(form.maxValue),
        checklist: form.checklist,
      }),
    }),
    onSuccess: async () => {
      setError('')
      setForm({ ...form, name: '' })
      await refresh()
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const record = useMutation({
    mutationFn: (input: { id: number; status?: 'pass' | 'fail'; measured?: number; checklist?: string[] }) => api(`/api/quality/checks/${input.id}/record`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
    onSuccess: async () => {
      setError('')
      await refresh()
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const override = useMutation({
    mutationFn: (input: { id: number; reason: string }) => api(`/api/quality/checks/${input.id}/override`, {
      method: 'POST',
      body: JSON.stringify({ reason: input.reason }),
    }),
    onSuccess: async () => {
      setError('')
      await refresh()
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })

  function onPoint(event: FormEvent) {
    event.preventDefault()
    savePoint.mutate()
  }

  const board = dashboard.data
  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('quality.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('quality.lead')}</p>
        </div>
        <Link className="text-sm underline" to="/quality/alerts">{t('quality.alerts')}</Link>
      </div>
      {error ? <Notice message={error} /> : null}
      {dashboard.isLoading ? <p className="text-sm text-muted-foreground">{t('quality.loading')}</p> : null}
      {board ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t('quality.passRate')} value={board.passRate == null ? '—' : `${board.passRate}%`} />
          <Stat label={t('quality.openAlerts')} value={String(board.openAlerts)} />
          <Stat label={t('quality.pending')} value={String(board.pending)} />
        </div>
      ) : null}
      {board ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <CountTable title={t('quality.byProduct')} rows={board.byProduct.map((row) => ({ id: row.productId, name: row.name, pass: row.pass, fail: row.fail, pending: row.pending }))} />
          <CountTable title={t('quality.byVendor')} rows={board.byVendor.map((row) => ({ id: row.vendorId, name: row.name, pass: row.pass, fail: row.fail, pending: row.pending }))} />
        </div>
      ) : null}
      <form className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2" onSubmit={onPoint}>
        <h2 className="font-semibold md:col-span-2">{t('quality.points')}</h2>
        <Field label={t('quality.pointName')}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label={t('quality.product')}>
          <Select value={form.productId} onChange={(event) => setForm({ ...form, productId: event.target.value })} required>
            <option value="">{t('quality.product')}</option>
            {(products.data ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </Select>
        </Field>
        <Field label={t('quality.trigger')}>
          <Select value={form.trigger} onChange={(event) => setForm({ ...form, trigger: event.target.value })}>
            <option value="receipt">{t('quality.trigger.receipt')}</option>
            <option value="operation">{t('quality.trigger.operation')}</option>
            <option value="delivery">{t('quality.trigger.delivery')}</option>
          </Select>
        </Field>
        <Field label={t('quality.type')}>
          <Select value={form.checkType} onChange={(event) => setForm({ ...form, checkType: event.target.value })}>
            <option value="pass_fail">{t('quality.type.pass_fail')}</option>
            <option value="measure">{t('quality.type.measure')}</option>
            <option value="checklist">{t('quality.type.checklist')}</option>
          </Select>
        </Field>
        {form.trigger === 'operation' ? <Field label={t('quality.operation')}><Input value={form.operationName} onChange={(event) => setForm({ ...form, operationName: event.target.value })} /></Field> : null}
        {form.checkType === 'measure' ? (
          <>
            <Field label={t('quality.min')}><Input value={form.minValue} onChange={(event) => setForm({ ...form, minValue: event.target.value })} /></Field>
            <Field label={t('quality.max')}><Input value={form.maxValue} onChange={(event) => setForm({ ...form, maxValue: event.target.value })} /></Field>
          </>
        ) : null}
        {form.checkType === 'checklist' ? <Field label={t('quality.checklist')}><Textarea value={form.checklist} onChange={(event) => setForm({ ...form, checklist: event.target.value })} rows={3} /></Field> : null}
        <div className="md:col-span-2"><Button type="submit">{t('quality.addPoint')}</Button></div>
        <ul className="text-sm text-muted-foreground md:col-span-2">
          {(points.data ?? []).map((point) => <li key={point.id}>{point.product.name} · {point.name}</li>)}
        </ul>
      </form>
      <section className="grid gap-3">
        <h2 className="font-semibold">{t('quality.checks')}</h2>
        {(checks.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t('quality.empty')}</p> : null}
        {(checks.data ?? []).map((check) => (
          <article key={check.id} className="grid gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-medium">{check.product.name}</h3>
              <p className="text-sm text-muted-foreground">{check.point.name} · {check.status}{check.overrideReason ? ` · ${check.overrideReason}` : ''}</p>
            </div>
            {check.alert?.status === 'open' ? <p className="text-sm">{t('quality.quarantine')}: {check.alert.quantity}</p> : null}
            {check.status !== 'pass' && !check.overrideReason ? (
              <div className="flex flex-wrap items-end gap-2">
                {check.point.checkType === 'measure' ? (
                  <Field label={t('quality.measure')}>
                    <Input className="w-28" value={measure[check.id] ?? ''} onChange={(event) => setMeasure({ ...measure, [check.id]: event.target.value })} />
                  </Field>
                ) : null}
                <Button size="sm" onClick={() => record.mutate({
                  id: check.id,
                  status: 'pass',
                  measured: measure[check.id] ? Number(measure[check.id]) : undefined,
                  checklist: check.point.checklist.split('\n').map((line) => line.trim()).filter(Boolean),
                })}>{t('quality.pass')}</Button>
                <Button size="sm" variant="secondary" onClick={() => record.mutate({ id: check.id, status: 'fail', measured: measure[check.id] ? Number(measure[check.id]) : undefined, checklist: [] })}>{t('quality.fail')}</Button>
                {me.data?.role === 'admin' ? (
                  <>
                    <Input className="h-8 w-56" aria-label={t('quality.reason')} value={reason[check.id] ?? ''} onChange={(event) => setReason({ ...reason, [check.id]: event.target.value })} placeholder={t('quality.reason')} />
                    <Button size="sm" variant="secondary" onClick={() => override.mutate({ id: check.id, reason: reason[check.id] ?? '' })}>{t('quality.override')}</Button>
                  </>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  )
}

function AlertsView() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const alerts = useQuery({ queryKey: ['quality-alerts'], queryFn: () => api<Alert[]>('/api/quality/alerts') })
  const [error, setError] = useState('')
  const resolve = useMutation({
    mutationFn: (input: { id: number; action: string }) => api(`/api/quality/alerts/${input.id}/resolve`, { method: 'POST', body: JSON.stringify({ action: input.action }) }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['quality-alerts'] })
      await queryClient.invalidateQueries({ queryKey: ['quality-dashboard'] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm underline" to="/quality">{t('quality.title')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{t('quality.alerts')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('quality.alertsLead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      {(alerts.data ?? []).map((alert) => (
        <article key={alert.id} className="grid gap-3 rounded-lg border border-border bg-card p-4">
          <h2 className="font-medium">{alert.product.name}</h2>
          <p className="text-sm text-muted-foreground">{t('quality.quarantine')}: {alert.quantity} · {alert.status}{alert.vendor ? ` · ${alert.vendor.name}` : ''}</p>
          {alert.status === 'open' ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => resolve.mutate({ id: alert.id, action: 'rework' })}>{t('quality.action.rework')}</Button>
              <Button size="sm" variant="secondary" onClick={() => resolve.mutate({ id: alert.id, action: 'scrap' })}>{t('quality.action.scrap')}</Button>
              <Button size="sm" variant="secondary" onClick={() => resolve.mutate({ id: alert.id, action: 'return_vendor' })}>{t('quality.action.return_vendor')}</Button>
            </div>
          ) : <p className="text-sm">{alert.action}</p>}
        </article>
      ))}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-3xl">{value}</p>
    </div>
  )
}

function CountTable({ title, rows }: { title: string; rows: Array<{ id: number; name: string; pass: number; fail: number; pending: number }> }) {
  const { t } = useI18n()
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t('quality.empty')}</p> : null}
      <ul className="mt-2 grid gap-1 text-sm">
        {rows.map((row) => <li key={row.id}>{row.name}: {row.pass} / {row.fail} / {row.pending}</li>)}
      </ul>
    </section>
  )
}
