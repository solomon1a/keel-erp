import { useQuery } from '@tanstack/react-query'
import { ArrowUpRight, ChevronDown, Circle, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { KeelMark } from '../brand/mark.tsx'
import { useI18n, type Locale, type Translate } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import { menuLabel } from '../lib/menu-label.ts'
import type { AppModule } from '../lib/modules.ts'
import type { User } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import type { Copy, Workspace, WsLabel, WsLink, WsPoint, WsSide } from '../lib/workspaces.ts'

function text(label: WsLabel, locale: Locale, t: Translate) {
  if (typeof label === 'string') return menuLabel(label, locale, t)
  return locale === 'zh' ? label.zh : label.en
}

function readDone(key: string) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function MonthChart({ points, locale }: { points: WsPoint[]; locale: Locale }) {
  const width = 640
  const height = 200
  const padX = 28
  const padY = 16
  const max = Math.max(...points.map((point) => point.value), 1)
  const coords = points.map((point, index) => {
    const x = padX + (index * (width - padX * 2)) / Math.max(points.length - 1, 1)
    const y = height - 28 - ((point.value / max) * (height - padY - 36))
    return { x, y, point }
  })
  const line = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full text-primary" role="img">
      {[0, 0.5, 1].map((step) => {
        const y = height - 28 - step * (height - padY - 36)
        return <line key={step} x1={padX} x2={width - padX} y1={y} y2={y} className="stroke-border" strokeWidth="1" />
      })}
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" />
      {coords.map((coord) => (
        <circle key={coord.point.en} cx={coord.x} cy={coord.y} r="3.5" className="fill-primary" />
      ))}
      {coords.map((coord, index) =>
        index % 2 === 0 ? (
          <text key={coord.point.en} x={coord.x} y={height - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="12">
            {locale === 'zh' ? coord.point.zh : coord.point.en}
          </text>
        ) : null,
      )}
    </svg>
  )
}

function SideLink({ item, locale, t, active }: { item: WsLink; locale: Locale; t: Translate; active: boolean }) {
  return (
    <Link
      to={item.to}
      className={cn(
        'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm',
        active ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
      )}
    >
      {text(item.label, locale, t)}
    </Link>
  )
}

function SideNode({ item, locale, t, home }: { item: WsSide; locale: Locale; t: Translate; home: string }) {
  const [open, setOpen] = useState(Boolean(item.children?.length))
  if (item.children?.length) {
    return (
      <div>
        <button
          type="button"
          className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          {text(item.label, locale, t)}
          <ChevronDown className={cn('size-3.5 transition', open ? 'rotate-0' : '-rotate-90')} />
        </button>
        {open ? (
          <div className="ml-3 border-l border-border pl-2">
            {item.children.map((child) => (
              <SideLink key={child.to + text(child.label, 'en', t)} item={child} locale={locale} t={t} active={false} />
            ))}
          </div>
        ) : null}
      </div>
    )
  }
  if (!item.to) return null
  return <SideLink item={{ label: item.label, to: item.to }} locale={locale} t={t} active={item.to === home} />
}

function MasterLink({ link, locale, t }: { link: WsLink; locale: Locale; t: Translate }) {
  return (
    <Link to={link.to} className="inline-flex items-center gap-1 text-sm text-foreground hover:underline">
      {text(link.label, locale, t)}
      {link.external ? <ArrowUpRight className="size-3.5 text-muted-foreground" aria-hidden /> : null}
    </Link>
  )
}

export function WorkspaceHome({ mod, workspace }: { mod: AppModule; workspace: Workspace }) {
  const { locale, t } = useI18n()
  const money = useMoney()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const storageKey = `keel-setup:${me.data?.company.id ?? 0}:${mod.id}`
  const [panel, setPanel] = useState(true)
  const [done, setDone] = useState<string[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    setDone(readDone(storageKey))
    setReady(true)
  }, [storageKey])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(storageKey, JSON.stringify(done))
  }, [done, ready, storageKey])

  const total = workspace.steps.length
  const finished = workspace.steps.filter((_, index) => done.includes(String(index))).length
  const percent = total === 0 ? 0 : Math.round((finished / total) * 100)

  return (
    <div className={cn('lg:grid lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:items-start lg:gap-8', panel && 'xl:grid-cols-[13.5rem_minmax(0,1fr)_18rem]')}>
      <aside className={cn('mb-6 lg:mb-0', panel && 'lg:row-span-2 xl:row-span-1')}>
        <nav className="space-y-0.5" aria-label={t(mod.label)}>
          {workspace.sidebar.map((item) => (
            <SideNode key={text(item.label, 'en', t) + (item.to ?? '')} item={item} locale={locale} t={t} home={mod.home} />
          ))}
          <button
            type="button"
            className="flex w-full items-center rounded-md px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={() => setPanel(true)}
          >
            {t('ws.started')}
          </button>
        </nav>
      </aside>
      <div className="min-w-0">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">{t('ws.shortcuts')}</h2>
          <div className="mt-3 rounded-lg border border-border bg-card p-4">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium">{text(workspace.chartTitle, locale, t)}</h3>
                <p className="text-xs text-muted-foreground">{t('ws.synced')}</p>
              </div>
              <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">{t('ws.lastYear')}</span>
            </div>
            <MonthChart points={workspace.chart} locale={locale} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {workspace.kpis.map((kpi) => (
              <Link key={kpi.to + text(kpi.label, 'en', t)} to={kpi.to} className="rounded-lg border border-border bg-card p-4 hover:bg-secondary/40">
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span>{text(kpi.label, locale, t)}</span>
                  <span aria-hidden>···</span>
                </div>
                <p className="mt-3 truncate text-2xl font-semibold tracking-tight tabular-nums">{kpi.money ? money(kpi.value) : kpi.value}</p>
              </Link>
            ))}
          </div>
        </section>
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">{t('ws.masters')}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workspace.groups.map((group) => (
              <div key={text(group.title, 'en', t)} className="rounded-lg border border-border bg-card p-4">
                <h3 className="mb-3 font-semibold">{text(group.title, locale, t)}</h3>
                <ul className="grid gap-2">
                  {group.links.map((link) => (
                    <li key={link.to + text(link.label, 'en', t)}>
                      <MasterLink link={link} locale={locale} t={t} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      </div>
      {panel ? (
        <aside className="mt-6 rounded-lg border border-border bg-card p-4 shadow-md lg:col-start-2 xl:col-start-auto xl:mt-0">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">{t('ws.started')}</h2>
            <button type="button" className="rounded-md p-1 text-muted-foreground hover:bg-secondary" aria-label={t('ws.close')} onClick={() => setPanel(false)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-4 text-center">
            <KeelMark className="mx-auto size-10" />
            <p className="mt-3 font-semibold">{t('ws.setupName', { name: t(mod.label) })}</p>
            <p className="text-sm text-muted-foreground">{t('ws.steps', { done: finished, total })}</p>
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{t('ws.percent', { percent })}</span>
            <button
              type="button"
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => setDone(workspace.steps.map((_, index) => String(index)))}
            >
              {t('ws.skip')}
            </button>
          </div>
          <ul className="mt-4 grid gap-2">
            {workspace.steps.map((step, index) => {
              const id = String(index)
              const complete = done.includes(id)
              return (
                <li key={id} className="flex items-start gap-2">
                  <button
                    type="button"
                    aria-pressed={complete}
                    aria-label={text(step.label, locale, t)}
                    className="mt-0.5 text-muted-foreground"
                    onClick={() => setDone((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
                  >
                    <Circle className={cn('size-4', complete && 'fill-primary text-primary')} />
                  </button>
                  <Link to={step.to} className={cn('text-sm hover:underline', complete && 'text-muted-foreground line-through')} onClick={() => setDone((current) => (current.includes(id) ? current : [...current, id]))}>
                    {text(step.label, locale, t)}
                  </Link>
                </li>
              )
            })}
          </ul>
        </aside>
      ) : null}
    </div>
  )
}
