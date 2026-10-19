import { useMutation } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { roundMoney } from '../domain/money.ts'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api, ApiError } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { ManufacturingOrder } from '../lib/types.ts'
import { Badge } from './ui/badge.tsx'
import { Button } from './ui/button.tsx'
import { Input } from './ui/input.tsx'

export type JobCardView = NonNullable<ManufacturingOrder['jobCards']>[number] & {
  order?: { id: number; name: string; state?: string; product?: { name: string } }
}

const statusKey: Record<string, MessageKey> = {
  pending: 'mfg.statusPending',
  running: 'mfg.statusRunning',
  paused: 'mfg.statusPaused',
  open: 'mfg.statusOpen',
  done: 'mfg.statusDone',
}

function statusLabel(status: string, t: (key: MessageKey) => string) {
  const key = statusKey[status]
  return key ? t(key) : status
}

function formatMinutes(minutes: number) {
  if (minutes > 0 && minutes < 1) return '< 1m'
  const whole = Math.max(0, Math.round(minutes))
  const hours = Math.floor(whole / 60)
  const mins = whole % 60
  if (hours <= 0) return `${mins}m`
  return `${hours}h ${mins}m`
}

export function cardMinutes(card: JobCardView) {
  return Math.round(card.logs.reduce((sum, log) => sum + log.minutes, 0) * 100) / 100
}

export function cardCost(card: JobCardView) {
  return roundMoney((cardMinutes(card) / 60) * (card.workstation?.hourRate ?? 0))
}

function FieldLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

export function JobCardBoard({
  cards,
  absorbed = 0,
  onDone,
  onError,
}: {
  cards: JobCardView[]
  absorbed?: number
  onDone: () => Promise<void>
  onError: (message: string) => void
}) {
  const { t } = useI18n()
  const money = useMoney()
  const logged = roundMoney(cards.reduce((sum, card) => sum + cardCost(card), 0))
  const planned = cards.reduce((sum, card) => sum + card.plannedQty, 0)
  const completed = cards.reduce((sum, card) => sum + card.completedQty, 0)
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-serif text-2xl">{t('floor.jobCards')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('mfg.progress')} · {completed} / {planned}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <figure className="rounded-lg border border-border bg-card px-4 py-3">
          <figcaption className="text-sm text-muted-foreground">{t('mfg.loggedCost')}</figcaption>
          <p className="font-serif text-3xl">{money(logged)}</p>
        </figure>
        <figure className="rounded-lg border border-border bg-card px-4 py-3">
          <figcaption className="text-sm text-muted-foreground">{t('mfg.absorbed')}</figcaption>
          <p className="font-serif text-3xl">{money(absorbed)}</p>
        </figure>
      </div>
      <p className="text-sm text-muted-foreground">{t('mfg.costNote')}</p>
      {cards.map((card) => (
        <JobCardPanel key={card.id} card={card} onDone={onDone} onError={onError} />
      ))}
    </section>
  )
}

export function JobCardPanel({
  card,
  onDone,
  onError,
  showOrder = false,
}: {
  card: JobCardView
  onDone: () => Promise<void>
  onError: (message: string) => void
  showOrder?: boolean
}) {
  const { t } = useI18n()
  const money = useMoney()
  const [now, setNow] = useState(() => Date.now())
  const [operator, setOperator] = useState('')
  const [minutes, setMinutes] = useState('30')
  const [note, setNote] = useState('')
  const [completed, setCompleted] = useState(String(card.completedQty))
  const [scrap, setScrap] = useState(String(card.rejectedQty))
  const running = card.logs.find((entry) => entry.startedAt && !entry.endedAt)
  const pct = card.plannedQty > 0 ? Math.min(100, Math.round((card.completedQty / card.plannedQty) * 100)) : 0

  useEffect(() => {
    setCompleted(String(card.completedQty))
    setScrap(String(card.rejectedQty))
  }, [card.completedQty, card.rejectedQty])

  useEffect(() => {
    if (card.status !== 'running') return
    const timer = window.setInterval(() => setNow(Date.now()), 15000)
    return () => window.clearInterval(timer)
  }, [card.status])

  const fail = (reason: unknown) => onError(reason instanceof ApiError ? reason.message : t('mo.stepFailed'))
  const start = useMutation({
    mutationFn: () =>
      api(`/api/job-cards/${card.id}/start`, { method: 'POST', body: JSON.stringify({ operatorName: operator }) }),
    onSuccess: async () => {
      setOperator('')
      await onDone()
    },
    onError: fail,
  })
  const pause = useMutation({
    mutationFn: () => api(`/api/job-cards/${card.id}/pause`, { method: 'POST' }),
    onSuccess: () => onDone(),
    onError: fail,
  })
  const finish = useMutation({
    mutationFn: () =>
      api(`/api/job-cards/${card.id}/finish`, {
        method: 'POST',
        body: JSON.stringify({
          completedQty: Number(completed),
          rejectedQty: Number(scrap) || 0,
          processLoss: card.processLoss,
        }),
      }),
    onSuccess: () => onDone(),
    onError: fail,
  })
  const log = useMutation({
    mutationFn: () =>
      api(`/api/job-cards/${card.id}/log`, {
        method: 'POST',
        body: JSON.stringify({ operatorName: operator, minutes: Number(minutes), note: note || undefined }),
      }),
    onSuccess: async () => {
      setOperator('')
      setNote('')
      await onDone()
    },
    onError: fail,
  })

  const elapsed = running?.startedAt ? Math.max(0, (now - new Date(running.startedAt).getTime()) / 60000) : 0

  return (
    <article className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold">{card.name} · {card.operationName}</p>
          <p className="text-sm text-muted-foreground">
            {card.workstation?.name ?? '—'} · {t('floor.rate')} {card.workstation?.hourRate ?? 0} · {card.completedQty} / {card.plannedQty}
            {card.rejectedQty > 0 ? ` · ${t('mfg.scrapQty')} ${card.rejectedQty}` : ''}
          </p>
          {showOrder && card.order ? (
            <p className="text-sm">
              <Link className="hover:underline" to={`/manufacturing/${card.order.id}`}>{card.order.name}</Link>
              {card.order.product?.name ? ` · ${card.order.product.name}` : ''}
            </p>
          ) : null}
        </div>
        <Badge tone={card.status}>{statusLabel(card.status, t)}</Badge>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-muted-foreground">
        {t('mfg.logged')} {formatMinutes(cardMinutes(card))} · {t('mfg.loggedCost')} {money(cardCost(card))}
        {running ? ` · ${t('mfg.runningSince')} ${running.operatorName} ${formatMinutes(elapsed)}` : ''}
      </p>
      <ul className="grid gap-1 text-sm">
        {card.logs.map((entry) => (
          <li key={entry.id}>
            {entry.operatorName} · {entry.startedAt && !entry.endedAt ? t('mfg.runningSince') : formatMinutes(entry.minutes)}
            {entry.note ? ` · ${entry.note}` : ''}
          </li>
        ))}
      </ul>
      {card.status !== 'done' ? (
        <div className="grid gap-2">
          <div className="keel-actions">
            <Input value={operator} placeholder={t('floor.operator')} aria-label={t('floor.operator')} onChange={(event) => setOperator(event.target.value)} />
            <Button
              variant="default"
              disabled={start.isPending || card.status === 'running' || !operator.trim()}
              onClick={() => start.mutate()}
            >
              {t('mfg.start')}
            </Button>
            <Button variant="outline" disabled={pause.isPending || card.status !== 'running'} onClick={() => pause.mutate()}>
              {t('mfg.pause')}
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <FieldLabel label={t('mfg.doneQty')}>
              <Input type="number" min="0" step="0.001" value={completed} aria-label={t('mfg.doneQty')} onChange={(event) => setCompleted(event.target.value)} />
            </FieldLabel>
            <FieldLabel label={t('mfg.scrapQty')}>
              <Input type="number" min="0" step="0.001" value={scrap} aria-label={t('mfg.scrapQty')} onChange={(event) => setScrap(event.target.value)} />
            </FieldLabel>
          </div>
          <div className="keel-actions">
            <Button variant="secondary" disabled={finish.isPending} onClick={() => finish.mutate()}>{t('mfg.finish')}</Button>
          </div>
          <div className="keel-actions">
            <Input type="number" min="0" step="1" value={minutes} aria-label={t('floor.minutes')} onChange={(event) => setMinutes(event.target.value)} />
            <Input value={note} placeholder={t('desk.note')} aria-label={t('desk.note')} onChange={(event) => setNote(event.target.value)} />
            <Button
              variant="outline"
              disabled={log.isPending}
              onClick={() => {
                if (!operator.trim() || !(Number(minutes) > 0)) {
                  onError(t('mo.stepFailed'))
                  return
                }
                log.mutate()
              }}
            >
              {t('mfg.addTime')}
            </Button>
          </div>
        </div>
      ) : null}
    </article>
  )
}
