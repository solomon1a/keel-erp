import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { demoPath, demoStepId, demoTarget, type DemoStepId, type DemoTourState } from '../../shared/demo-tour.ts'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api, ApiError } from '../lib/api.ts'
import type { User } from '../lib/types.ts'
import { Button } from './ui/button.tsx'

function titleKey(step: DemoStepId): MessageKey {
  switch (step) {
    case 'lead':
      return 'tour.lead.title'
    case 'confirm':
      return 'tour.confirm.title'
    case 'purchase':
      return 'tour.purchase.title'
    case 'quality':
      return 'tour.quality.title'
    case 'make':
      return 'tour.make.title'
    case 'wastage':
      return 'tour.wastage.title'
    case 'deliver':
      return 'tour.deliver.title'
    case 'bank':
      return 'tour.bank.title'
    case 'books':
      return 'tour.books.title'
    case 'dashboard':
      return 'tour.dashboard.title'
    case 'project':
      return 'tour.project.title'
    case 'bill':
      return 'tour.bill.title'
    case 'profit':
      return 'tour.profit.title'
    default: {
      const unexpected: never = step
      return unexpected
    }
  }
}

function bodyKey(step: DemoStepId): MessageKey {
  switch (step) {
    case 'lead':
      return 'tour.lead.body'
    case 'confirm':
      return 'tour.confirm.body'
    case 'purchase':
      return 'tour.purchase.body'
    case 'quality':
      return 'tour.quality.body'
    case 'make':
      return 'tour.make.body'
    case 'wastage':
      return 'tour.wastage.body'
    case 'deliver':
      return 'tour.deliver.body'
    case 'bank':
      return 'tour.bank.body'
    case 'books':
      return 'tour.books.body'
    case 'dashboard':
      return 'tour.dashboard.body'
    case 'project':
      return 'tour.project.body'
    case 'bill':
      return 'tour.bill.body'
    case 'profit':
      return 'tour.profit.body'
    default: {
      const unexpected: never = step
      return unexpected
    }
  }
}

export function useDemoTour() {
  return useQuery({
    queryKey: ['demo-tour'],
    queryFn: () => api<DemoTourState>('/api/demo-tour'),
    staleTime: 15_000,
  })
}

function useDemoActions() {
  const queryClient = useQueryClient()
  async function refreshPages() {
    await queryClient.invalidateQueries({
      predicate: (query) => query.queryKey[0] !== 'me' && query.queryKey[0] !== 'demo-tour',
    })
  }
  const start = useMutation({
    mutationFn: (restart: boolean) =>
      api<DemoTourState>('/api/demo-tour/start', { method: 'POST', body: JSON.stringify({ restart }) }),
    onSuccess: async (state) => {
      queryClient.setQueryData(['demo-tour'], state)
      await refreshPages()
    },
  })
  const act = useMutation({
    mutationFn: (step: number) =>
      api<DemoTourState>('/api/demo-tour/act', { method: 'POST', body: JSON.stringify({ step }) }),
    onSuccess: async (state) => {
      queryClient.setQueryData(['demo-tour'], state)
      await refreshPages()
    },
  })
  const move = useMutation({
    mutationFn: (body: { step: number; status?: 'active' | 'done' | 'skipped' }) =>
      api<DemoTourState>('/api/demo-tour/step', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (state) => queryClient.setQueryData(['demo-tour'], state),
  })
  const reset = useMutation({
    mutationFn: () => api<DemoTourState>('/api/demo-tour/reset', { method: 'POST' }),
    onSuccess: async (state) => {
      queryClient.setQueryData(['demo-tour'], state)
      await refreshPages()
    },
  })
  return { start, act, move, reset }
}

export function DemoLaunch({ place }: { place: 'launcher' | 'header' | 'menu' }) {
  const { t } = useI18n()
  const tour = useDemoTour()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const { start, reset } = useDemoActions()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  if (!tour.data?.available) return null
  const run = tour.data.run
  const admin = me.data?.role === 'admin'
  const active = run?.status === 'active'
  const label = active ? t('tour.resume') : t('tour.start')
  const busy = start.isPending || reset.isPending
  const begin = () => {
    const restart = Boolean(admin && run && !active)
    start.mutate(restart)
    setOpen(false)
  }
  const restart = () => {
    start.mutate(true)
    setOpen(false)
  }
  const wipe = () => {
    reset.mutate()
    setOpen(false)
  }

  if (place === 'launcher') {
    return (
      <div className="mb-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={begin} disabled={busy}>{label}</Button>
        {admin && run ? <Button variant="secondary" onClick={restart} disabled={busy}>{t('tour.restart')}</Button> : null}
        {admin && run ? <Button variant="outline" onClick={wipe} disabled={busy}>{t('tour.reset')}</Button> : null}
      </div>
    )
  }

  if (place === 'menu') {
    return (
      <div className="mt-3 grid gap-2">
        <button type="button" className="keel-chip w-full justify-start" onClick={begin} disabled={busy}>{label}</button>
        {admin && run ? <button type="button" className="keel-chip w-full justify-start" onClick={restart} disabled={busy}>{t('tour.restart')}</button> : null}
        {admin && run ? <button type="button" className="keel-chip w-full justify-start" onClick={wipe} disabled={busy}>{t('tour.reset')}</button> : null}
      </div>
    )
  }

  return (
    <div className="relative hidden lg:block" ref={ref}>
      <Button size="sm" variant="secondary" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        {label}
      </Button>
      {open ? (
        <div className="keel-menu absolute right-0 z-[60] mt-2 w-56 rounded-3xl p-2">
          <button type="button" className="keel-chip w-full justify-start" onClick={begin}>{label}</button>
          {admin && run ? <button type="button" className="keel-chip mt-1 w-full justify-start" onClick={restart}>{t('tour.restart')}</button> : null}
          {admin && run ? <button type="button" className="keel-chip mt-1 w-full justify-start" onClick={wipe}>{t('tour.reset')}</button> : null}
        </div>
      ) : null}
    </div>
  )
}

function cardStyle(box: DOMRect | null): { top: number; left: number } {
  const margin = 16
  const width = 340
  const height = 240
  if (!box) {
    return { top: Math.max(margin, window.innerHeight - height - margin), left: Math.max(margin, window.innerWidth - width - margin) }
  }
  let top = box.bottom + 12
  let left = Math.min(box.left, window.innerWidth - width - margin)
  left = Math.max(margin, left)
  if (top + height > window.innerHeight - margin) top = Math.max(margin, box.top - height - 12)
  return { top, left }
}

export function DemoTour() {
  const { t } = useI18n()
  const tour = useDemoTour()
  const { act, move } = useDemoActions()
  const navigate = useNavigate()
  const location = useLocation()
  const run = tour.data?.run
  const active = run?.status === 'active'
  const stepId = run ? demoStepId(run.step) : null
  const path = run ? demoPath(run) : ''
  const aimed = useRef('')
  const [box, setBox] = useState<DOMRect | null>(null)
  const [trouble, setTrouble] = useState('')

  useEffect(() => {
    if (!active || !path) return
    if (aimed.current === path) return
    aimed.current = path
    if (location.pathname !== path) navigate(path)
  }, [active, path, location.pathname, navigate])

  useEffect(() => {
    if (!active || !stepId) return
    const target = demoTarget(stepId)
    let timer = 0
    const measure = () => {
      const node = document.querySelector(`[data-tour="${target}"]`)
      setBox(node ? node.getBoundingClientRect() : null)
    }
    const frame = window.requestAnimationFrame(measure)
    timer = window.setInterval(measure, 400)
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearInterval(timer)
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [active, stepId, location.pathname])

  useEffect(() => {
    if (!active || !stepId) return
    const node = document.querySelector(`[data-tour="${demoTarget(stepId)}"]`)
    node?.scrollIntoView({ block: 'center' })
  }, [active, stepId, location.pathname])

  if (!tour.data?.available || !run || !active || !stepId) return null
  const place = cardStyle(box)
  const vars = { product: run.productName || 'the product', material: run.materialName || 'the material' }
  const pending = act.isPending || move.isPending
  const last = run.step >= tour.data.steps.length - 1

  return (
    <>
      {box ? (
        <div
          className="pointer-events-none fixed z-[70] rounded-2xl"
          style={{
            top: box.top - 6,
            left: box.left - 6,
            width: box.width + 12,
            height: box.height + 12,
            boxShadow: '0 0 0 9999px rgba(18, 32, 36, 0.55)',
            outline: '2px solid #0E6B5C',
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 z-[70]" style={{ background: 'rgba(18, 32, 36, 0.55)' }} />
      )}
      <div
        className="keel-tour-card fixed z-[80] p-4"
        style={{ top: place.top, left: place.left }}
        role="dialog"
        aria-labelledby="keel-tour-title"
      >
        <p className="text-xs font-semibold text-[var(--kl-color-primary-700)]">{t('tour.counter', { current: run.step + 1, total: tour.data.steps.length })}</p>
        <h2 id="keel-tour-title" className="mt-1">{t(titleKey(stepId))}</h2>
        <p className="mt-2 text-sm leading-5">{t(bodyKey(stepId), vars)}</p>
        {run.note ? <p className="mt-2 text-sm leading-5">{run.note}</p> : null}
        {trouble ? <p className="mt-2 text-sm text-[#B42323]">{trouble}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" disabled={pending || run.step === 0} onClick={() => { setTrouble(''); move.mutate({ step: run.step - 1 }) }}>
            {t('tour.back')}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => {
              setTrouble('')
              move.mutate(last ? { step: run.step, status: 'done' } : { step: run.step + 1 })
            }}
          >
            {t('tour.next')}
          </Button>
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setTrouble(''); move.mutate({ step: run.step, status: 'skipped' }) }}>
            {t('tour.skip')}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              setTrouble('')
              act.mutate(run.step, {
                onError: (error) => setTrouble(error instanceof ApiError ? error.message : 'The step did not finish.'),
              })
            }}
          >
            {act.isPending ? t('tour.working') : t('tour.do')}
          </Button>
        </div>
      </div>
    </>
  )
}
