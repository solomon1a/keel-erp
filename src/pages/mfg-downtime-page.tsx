import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Station = { id: number; name: string }
type Entry = {
  id: number
  name: string
  date: string
  minutes: number
  reason: string
  state: string
  workstation: Station
}

export function MfgDowntimePage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', workstationId: '', date: '', minutes: '', reason: '', state: 'confirmed' })
  const rows = useQuery({ queryKey: ['mfg-downtime'], queryFn: () => api<Entry[]>('/api/manufacturing/downtime') })
  const stations = useQuery({ queryKey: ['workstations'], queryFn: () => api<Station[]>('/api/workstations') })

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['mfg-downtime'] })
    await queryClient.invalidateQueries({ queryKey: ['workstations'] })
  }

  const create = useMutation({
    mutationFn: () => api<Entry>('/api/manufacturing/downtime', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        workstationId: Number(form.workstationId),
        date: form.date,
        minutes: Number(form.minutes),
        reason: form.reason,
        state: form.state,
      }),
    }),
    onSuccess: async () => {
      setError('')
      setForm({ name: '', workstationId: '', date: '', minutes: '', reason: '', state: 'confirmed' })
      await refresh()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  const confirm = useMutation({
    mutationFn: (id: number) => api(`/api/manufacturing/downtime/${id}/confirm`, { method: 'POST' }),
    onSuccess: async () => {
      setError('')
      await refresh()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('mfg.downtime')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('mfg.downtimeLead')}</p>
        </div>
        <Link to="/manufacturing/workstations"><Button variant="outline">{t('mfg.centers')}</Button></Link>
      </div>
      {error ? <Notice message={error} /> : null}
      {rows.isLoading ? <p className="text-sm text-muted-foreground">{t('manufacturing.loading')}</p> : null}
      {rows.isError ? <p className="text-sm text-destructive">{rows.error.message}</p> : null}
      {rows.data && rows.data.length === 0 ? <EmptyState title={t('mfg.downtimeEmpty')} body={t('mfg.downtimeLead')} /> : null}
      {rows.data && rows.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('mfg.name')}</th>
                <th className="px-4 py-3 font-medium">{t('mfg.center')}</th>
                <th className="px-4 py-3 font-medium">{t('mfg.date')}</th>
                <th className="px-4 py-3 font-medium">{t('mfg.minutes')}</th>
                <th className="px-4 py-3 font-medium">{t('mfg.reason')}</th>
                <th className="px-4 py-3 font-medium">{t('floor.kind')}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.data.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.workstation.name}</td>
                  <td className="px-4 py-3">{row.date.slice(0, 10)}</td>
                  <td className="px-4 py-3">{row.minutes}</td>
                  <td className="px-4 py-3">{row.reason}</td>
                  <td className="px-4 py-3"><Badge tone={row.state}>{row.state === 'confirmed' ? t('mfg.confirmed') : t('mfg.draft')}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    {row.state === 'draft' ? (
                      <Button size="sm" variant="outline" disabled={confirm.isPending} onClick={() => confirm.mutate(row.id)}>{t('mfg.confirm')}</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <h2 className="font-serif text-2xl">{t('mfg.downtimeNew')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('mfg.name')}>
            <Input value={form.name} aria-label={t('mfg.name')} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label={t('mfg.center')}>
            <select className="h-10 w-full rounded-md border border-border bg-card px-3" value={form.workstationId} aria-label={t('mfg.center')} onChange={(event) => setForm({ ...form, workstationId: event.target.value })} required>
              <option value="">{t('mfg.center')}</option>
              {(stations.data ?? []).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
            </select>
          </Field>
          <Field label={t('mfg.date')}>
            <Input type="date" value={form.date} aria-label={t('mfg.date')} onChange={(event) => setForm({ ...form, date: event.target.value })} required />
          </Field>
          <Field label={t('mfg.minutes')}>
            <Input type="number" min="1" step="1" value={form.minutes} aria-label={t('mfg.minutes')} onChange={(event) => setForm({ ...form, minutes: event.target.value })} required />
          </Field>
          <Field label={t('mfg.reason')}>
            <Input value={form.reason} aria-label={t('mfg.reason')} onChange={(event) => setForm({ ...form, reason: event.target.value })} required />
          </Field>
          <Field label={t('floor.kind')}>
            <select className="h-10 w-full rounded-md border border-border bg-card px-3" value={form.state} aria-label={t('floor.kind')} onChange={(event) => setForm({ ...form, state: event.target.value })}>
              <option value="confirmed">{t('mfg.confirmed')}</option>
              <option value="draft">{t('mfg.draft')}</option>
            </select>
          </Field>
        </div>
        <div><Button type="submit" disabled={create.isPending}>{t('mfg.downtimeNew')}</Button></div>
      </form>
    </div>
  )
}
