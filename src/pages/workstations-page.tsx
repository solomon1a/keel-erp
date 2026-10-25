import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Field, Notice } from '../components/field.tsx'
import { PageHeader, Panel } from '../components/surface.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api, ApiError } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import { cn } from '../lib/utils.ts'

type Station = {
  id: number
  name: string
  hourRate: number
  capacityHours: number
  startMinutes: number
  endMinutes: number
  workingDays: string
  efficiency: number
  jobCardCount: number
  availability: number | null
  performance: number | null
  quality: number | null
  oee: number | null
  loggedMinutes: number
  downtimeMinutes?: number
}

const dayKeys = ['mfg.day1', 'mfg.day2', 'mfg.day3', 'mfg.day4', 'mfg.day5', 'mfg.day6', 'mfg.day7'] as const satisfies ReadonlyArray<MessageKey>

function clock(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function fromClock(value: string) {
  const [hours, mins] = value.split(':').map((part) => Number(part))
  if (!Number.isInteger(hours) || !Number.isInteger(mins)) return null
  return hours * 60 + mins
}

function percent(value: number | null) {
  return value == null ? '—' : `${value}%`
}

const blank = {
  id: 0,
  name: '',
  hourRate: '60',
  capacityHours: '8',
  start: '09:00',
  end: '17:00',
  efficiency: '100',
  days: [1, 2, 3, 4, 5],
}

export function WorkstationsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(blank)
  const [error, setError] = useState('')
  const stations = useQuery({ queryKey: ['workstations'], queryFn: () => api<Station[]>('/api/workstations') })
  const save = useMutation({
    mutationFn: () => {
      const startMinutes = fromClock(form.start)
      const endMinutes = fromClock(form.end)
      if (startMinutes == null || endMinutes == null || form.days.length === 0) throw new ApiError(t('mo.stepFailed'), 400)
      const body = {
        name: form.name.trim(),
        hourRate: Number(form.hourRate),
        capacityHours: Number(form.capacityHours),
        startMinutes,
        endMinutes,
        workingDays: [...form.days].sort((a, b) => a - b).join(','),
        efficiency: Number(form.efficiency),
      }
      const path = form.id ? `/api/workstations/${form.id}` : '/api/workstations'
      return api(path, { method: form.id ? 'PUT' : 'POST', body: JSON.stringify(body) })
    },
    onSuccess: async () => {
      setError('')
      setForm(blank)
      await queryClient.invalidateQueries({ queryKey: ['workstations'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  if (stations.isLoading) return <p className="text-sm text-muted-foreground">{t('mfg.loading')}</p>
  if (stations.isError) return <p className="text-sm text-destructive">{stations.error.message}</p>
  const rows = stations.data ?? []

  return (
    <div className="grid gap-6" data-screen="workstations">
      <PageHeader
        title={t('mfg.centers')}
        lead={t('mfg.centersLead')}
        actions={
          <Button variant="outline" onClick={() => { setForm(blank); setError('') }}>{t('mfg.newCenter')}</Button>
        }
      />
      {error ? <Notice message={error} /> : null}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('mfg.emptyCenters')}</p> : null}
      <div className="grid gap-3 lg:grid-cols-2">
        {rows.map((station) => (
          <article key={station.id} className="grid gap-3 rounded-lg border border-border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-serif text-2xl">{station.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {t('mfg.calendar')} {clock(station.startMinutes)}–{clock(station.endMinutes)} · {t('mfg.capacity')} {station.capacityHours}h · {station.jobCardCount} {t('mfg.cards')}
                </p>
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setError('')
                  setForm({
                    id: station.id,
                    name: station.name,
                    hourRate: String(station.hourRate),
                    capacityHours: String(station.capacityHours),
                    start: clock(station.startMinutes),
                    end: clock(station.endMinutes),
                    efficiency: String(station.efficiency),
                    days: station.workingDays.split(',').map((part) => Number(part)).filter((day) => day >= 1 && day <= 7),
                  })
                }}
              >
                {t('mfg.edit')}
              </Button>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-muted-foreground">{t('mfg.perHour')}</dt>
                <dd className="font-semibold">{money(station.hourRate)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('mfg.efficiency')}</dt>
                <dd className="font-semibold">{station.efficiency}%</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('mfg.oee')}</dt>
                <dd className="font-semibold">{percent(station.oee)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('mfg.workingDays')}</dt>
                <dd className="font-semibold">{station.workingDays.split(',').map((part) => {
                  const key = dayKeys[Number(part) - 1]
                  return key ? t(key) : part
                }).join(' ')}</dd>
              </div>
            </dl>
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">{t('mfg.availability')}</dt>
                <dd>{percent(station.availability)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('mfg.performance')}</dt>
                <dd>{percent(station.performance)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">{t('mfg.quality')}</dt>
                <dd>{percent(station.quality)}</dd>
              </div>
            </dl>
            <p className="text-sm text-muted-foreground">{station.oee == null ? t('mfg.noOee') : t('mfg.oeeHint')}</p>
            {(station.downtimeMinutes ?? 0) > 0 ? (
              <p className="text-sm text-muted-foreground">{t('mfg.downtimeMinutes')}: {station.downtimeMinutes}</p>
            ) : null}
          </article>
        ))}
      </div>
      <Panel>
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            save.mutate()
          }}
        >
          <h2 className="font-serif text-2xl">{form.id ? t('mfg.edit') : t('mfg.newCenter')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('mfg.name')}>
              <Input value={form.name} aria-label={t('mfg.name')} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </Field>
            <Field label={t('mfg.perHour')}>
              <Input type="number" min="0" step="0.01" value={form.hourRate} aria-label={t('mfg.perHour')} onChange={(event) => setForm({ ...form, hourRate: event.target.value })} required />
            </Field>
            <Field label={t('mfg.dayHours')}>
              <Input type="number" min="0.5" max="24" step="0.5" value={form.capacityHours} aria-label={t('mfg.dayHours')} onChange={(event) => setForm({ ...form, capacityHours: event.target.value })} required />
            </Field>
            <Field label={t('mfg.efficiency')}>
              <Input type="number" min="1" max="200" step="1" value={form.efficiency} aria-label={t('mfg.efficiency')} onChange={(event) => setForm({ ...form, efficiency: event.target.value })} required />
            </Field>
            <Field label={t('mfg.shiftStart')}>
              <Input type="time" value={form.start} aria-label={t('mfg.shiftStart')} onChange={(event) => setForm({ ...form, start: event.target.value })} required />
            </Field>
            <Field label={t('mfg.shiftEnd')}>
              <Input type="time" value={form.end} aria-label={t('mfg.shiftEnd')} onChange={(event) => setForm({ ...form, end: event.target.value })} required />
            </Field>
          </div>
          <fieldset className="grid gap-2">
            <legend className="text-sm text-muted-foreground">{t('mfg.workingDays')}</legend>
            <div className="flex flex-wrap gap-2">
              {dayKeys.map((key, index) => {
                const day = index + 1
                const on = form.days.includes(day)
                return (
                  <button
                    key={key}
                    type="button"
                    className={cn('keel-chip', on && 'keel-chip-active')}
                    aria-pressed={on}
                    onClick={() => setForm({ ...form, days: on ? form.days.filter((item) => item !== day) : [...form.days, day] })}
                  >
                    {t(key)}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <div className="keel-actions">
            <Button type="submit" disabled={save.isPending}>{t('mfg.save')}</Button>
          </div>
        </form>
      </Panel>
    </div>
  )
}
