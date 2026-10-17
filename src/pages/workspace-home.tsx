import { useQuery } from '@tanstack/react-query'
import {
  ArrowUpRight,
  BarChart3,
  Boxes,
  Calendar,
  Check,
  ChevronDown,
  Circle,
  ClipboardList,
  FileText,
  Home,
  LayoutDashboard,
  type LucideIcon,
  Package,
  Settings,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Wrench,
  X,
} from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { KeelMark } from '../brand/mark.tsx'
import { menuIconId, ModuleIcon } from '../brand/module-icon.tsx'
import { useI18n, type Locale, type Translate } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import { menuLabel } from '../lib/menu-label.ts'
import type { AppModule } from '../lib/modules.ts'
import type { User } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import type { Workspace, WsLabel, WsLink, WsPoint, WsSide } from '../lib/workspaces.ts'

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

function pathOf(to: string) {
  return to.split('?')[0] ?? to
}

function chartMove(points: WsPoint[]) {
  const last = points.at(-1)?.value ?? 0
  const prev = points.at(-2)?.value ?? 0
  if (prev === 0) return { pct: 0, up: last >= prev }
  const pct = Math.round(((last - prev) / Math.abs(prev)) * 100)
  return { pct, up: pct >= 0 }
}

function lucideFor(label: WsLabel): LucideIcon {
  const key = typeof label === 'string' ? label : ''
  if (key === 'ws.home') return Home
  if (key === 'ws.dashboard') return LayoutDashboard
  if (key === 'ws.planning') return Calendar
  if (key === 'ws.setup' || key === 'ws.tools' || key === 'hub.settings') return Settings
  if (key === 'hub.reports' || key === 'menu.reporting') return BarChart3
  const en = (key || (typeof label === 'string' ? label : label.en)).toLowerCase()
  if (/(vendor|purchase|bill|rfq|requisition|procure)/.test(en)) return ShoppingBag
  if (/(product|item|stock|goods|bom|material)/.test(en)) return Package
  if (/(order|invoice|quotation|ticket|request)/.test(en)) return FileText
  if (/(people|employee|customer|contact|vendor|hr)/.test(en)) return Users
  if (/(report|analys|analytic)/.test(en)) return BarChart3
  if (/(set|config|approv|tool)/.test(en)) return Settings
  if (/(pay|money|bank|account|expense|wage)/.test(en)) return Wallet
  if (/(plan|calendar|attend)/.test(en)) return Calendar
  if (/(tool|maint)/.test(en)) return Wrench
  if (key.startsWith('desk.') || key.startsWith('menu.')) return ClipboardList
  return Boxes
}

function SideGlyph({ label }: { label: WsLabel }) {
  const key = typeof label === 'string' ? label : ''
  const icon = key ? menuIconId(key) : null
  if (icon) return <ModuleIcon id={icon} className="size-4" />
  const Icon = lucideFor(label)
  return <Icon className="size-4" aria-hidden />
}

function TrendPill({ pct, up, caption, title }: { pct: number; up: boolean; caption?: string; title?: string }) {
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span
      title={title ?? caption}
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        up
          ? 'bg-[var(--kl-color-success-bg)] text-[var(--kl-color-success-fg)]'
          : 'bg-[var(--kl-color-warning-bg)] text-[var(--kl-color-warning-fg)]',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {up ? '+' : ''}
      {pct}%{caption ? <span className="font-medium">{caption}</span> : null}
    </span>
  )
}

const kpiIcons = [ClipboardList, Package, Wallet] as const
const kpiTones = [
  'bg-[color-mix(in_srgb,var(--kl-color-primary-50)_62%,var(--kl-glass-bg))]',
  'bg-[color-mix(in_srgb,var(--kl-color-brass-100)_58%,var(--kl-glass-bg))]',
  'bg-[color-mix(in_srgb,var(--kl-color-info-bg)_70%,var(--kl-glass-bg))]',
] as const
const kpiIconTones = [
  'bg-[var(--kl-color-primary-100)] text-[var(--kl-color-primary-700)]',
  'bg-[var(--kl-color-brass-100)] text-[var(--kl-color-brass-700)]',
  'bg-[var(--kl-color-info-bg)] text-[var(--kl-color-info-fg)]',
] as const

function MonthChart({ points, locale }: { points: WsPoint[]; locale: Locale }) {
  const width = 640
  const height = 200
  const padX = 28
  const padY = 16
  const gradId = useId().replace(/:/g, '')
  const [active, setActive] = useState<number | null>(null)
  const max = Math.max(...points.map((point) => point.value), 1)
  const coords = points.map((point, index) => {
    const x = padX + (index * (width - padX * 2)) / Math.max(points.length - 1, 1)
    const y = height - 28 - (point.value / max) * (height - padY - 36)
    return { x, y, point }
  })
  const line = coords.map((coord, index) => `${index === 0 ? 'M' : 'L'}${coord.x.toFixed(1)},${coord.y.toFixed(1)}`).join(' ')
  const first = coords[0]
  const last = coords[coords.length - 1]
  const baseline = height - 28
  const area = first && last ? `${line} L${last.x.toFixed(1)},${baseline} L${first.x.toFixed(1)},${baseline} Z` : ''
  const hot = active != null ? coords[active] : null
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-52 w-full text-primary"
        role="img"
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          const x = ((event.clientX - rect.left) / rect.width) * width
          let best = 0
          let dist = Number.POSITIVE_INFINITY
          coords.forEach((coord, index) => {
            const gap = Math.abs(coord.x - x)
            if (gap < dist) {
              dist = gap
              best = index
            }
          })
          setActive(best)
        }}
        onPointerLeave={() => setActive(null)}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--kl-color-primary-500)" stopOpacity="0.38" />
            <stop offset="100%" stopColor="var(--kl-color-primary-500)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((step) => {
          const y = height - 28 - step * (height - padY - 36)
          return <line key={step} x1={padX} x2={width - padX} y1={y} y2={y} className="stroke-border" strokeWidth="1" />
        })}
        {area ? <path d={area} fill={`url(#${gradId})`} /> : null}
        <path d={line} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {coords.map((coord) => (
          <circle key={coord.point.en} cx={coord.x} cy={coord.y} r={hot === coord ? 6 : 3.5} className="fill-primary" />
        ))}
        {coords.map((coord, index) =>
          index % 2 === 0 ? (
            <text key={coord.point.en} x={coord.x} y={height - 8} textAnchor="middle" className="fill-muted-foreground" fontSize="12">
              {locale === 'zh' ? coord.point.zh : coord.point.en}
            </text>
          ) : null,
        )}
      </svg>
      {hot ? (
        <div
          className="keel-glass pointer-events-none absolute z-10 -translate-x-1/2 rounded-2xl px-3 py-2 text-xs shadow-md"
          style={{ left: `${(hot.x / width) * 100}%`, top: 8 }}
        >
          <p className="font-semibold">{locale === 'zh' ? hot.point.zh : hot.point.en}</p>
          <p className="tabular-nums">{hot.point.value.toLocaleString()}</p>
        </div>
      ) : null}
    </div>
  )
}

function SideLink({ item, locale, t, active }: { item: WsLink; locale: Locale; t: Translate; active: boolean }) {
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn('keel-chip w-full min-w-0 justify-start overflow-hidden', active && 'keel-chip-active')}
    >
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,white_55%,transparent)]">
        <SideGlyph label={item.label} />
      </span>
      <span className="min-w-0 truncate">{text(item.label, locale, t)}</span>
    </Link>
  )
}

function SideNode({ item, locale, t, pathname }: { item: WsSide; locale: Locale; t: Translate; pathname: string }) {
  const [open, setOpen] = useState(Boolean(item.children?.length))
  if (item.children?.length) {
    return (
      <div className="grid gap-1">
        <button
          type="button"
          className="keel-chip w-full min-w-0 justify-between overflow-hidden"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <span className="flex min-w-0 items-center gap-2">
            <span className="grid size-6 place-items-center rounded-full bg-[color-mix(in_srgb,white_55%,transparent)]">
              <SideGlyph label={item.label} />
            </span>
            <span className="truncate">{text(item.label, locale, t)}</span>
          </span>
          <ChevronDown className={cn('size-3.5 transition', open ? 'rotate-0' : '-rotate-90')} />
        </button>
        {open ? (
          <div className="grid gap-1 pl-3">
            {item.children.map((child) => (
              <SideLink
                key={child.to + text(child.label, 'en', t)}
                item={child}
                locale={locale}
                t={t}
                active={pathOf(child.to) === pathname}
              />
            ))}
          </div>
        ) : null}
      </div>
    )
  }
  if (!item.to) return null
  return <SideLink item={{ label: item.label, to: item.to }} locale={locale} t={t} active={pathOf(item.to) === pathname} />
}

function MasterLink({ link, locale, t }: { link: WsLink; locale: Locale; t: Translate }) {
  return (
    <Link to={link.to} className="keel-chip w-full justify-start">
      <span className="grid size-6 place-items-center rounded-full bg-[var(--kl-color-primary-100)] text-[var(--kl-color-primary-700)]">
        <SideGlyph label={link.label} />
      </span>
      <span className="truncate">{text(link.label, locale, t)}</span>
      {link.external ? <ArrowUpRight className="ml-auto size-3.5 opacity-70" aria-hidden /> : null}
    </Link>
  )
}

function MobileSections({
  workspace,
  locale,
  t,
  pathname,
  onStarted,
}: {
  workspace: Workspace
  locale: Locale
  t: Translate
  pathname: string
  onStarted: () => void
}) {
  const [group, setGroup] = useState<string | null>(null)
  const open = workspace.sidebar.find((item) => text(item.label, 'en', t) === group && item.children?.length)
  return (
    <div className="mb-5 lg:hidden">
      <div className="keel-scroll -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t('ws.sections')}>
        {workspace.sidebar.map((item) => {
          const key = text(item.label, 'en', t)
          if (item.children?.length) {
            return (
              <button
                key={key}
                type="button"
                className={cn('keel-chip', group === key && 'keel-chip-active')}
                aria-expanded={group === key}
                onClick={() => setGroup((current) => (current === key ? null : key))}
              >
                <SideGlyph label={item.label} />
                {text(item.label, locale, t)}
                <ChevronDown className="size-3.5" />
              </button>
            )
          }
          if (!item.to) return null
          const active = pathOf(item.to) === pathname
          return (
            <Link key={key + item.to} to={item.to} aria-current={active ? 'page' : undefined} className={cn('keel-chip', active && 'keel-chip-active')}>
              <SideGlyph label={item.label} />
              {text(item.label, locale, t)}
            </Link>
          )
        })}
        <button type="button" className="keel-chip" onClick={onStarted}>
          <Circle className="size-4" aria-hidden />
          {t('ws.started')}
        </button>
      </div>
      {open?.children ? (
        <div className="keel-scroll mt-2 flex gap-2 overflow-x-auto pb-1">
          {open.children.map((child) => {
            const active = pathOf(child.to) === pathname
            return (
              <Link
                key={child.to + text(child.label, 'en', t)}
                to={child.to}
                aria-current={active ? 'page' : undefined}
                className={cn('keel-chip', active && 'keel-chip-active')}
              >
                <SideGlyph label={child.label} />
                {text(child.label, locale, t)}
              </Link>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export function WorkspaceHome({ mod, workspace }: { mod: AppModule; workspace: Workspace }) {
  const { locale, t } = useI18n()
  const money = useMoney()
  const { pathname } = useLocation()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const storageKey = `keel-setup:${me.data?.company.id ?? 0}:${mod.id}`
  const [panel, setPanel] = useState(true)
  const [done, setDone] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  const move = chartMove(workspace.chart)

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
    <div className={cn('lg:grid lg:grid-cols-[15.5rem_minmax(0,1fr)] lg:items-start lg:gap-6', panel && 'xl:grid-cols-[15.5rem_minmax(0,1fr)_19rem]')}>
      <MobileSections workspace={workspace} locale={locale} t={t} pathname={pathname} onStarted={() => setPanel(true)} />
      <aside className={cn('keel-glass sticky top-28 hidden rounded-[28px] p-3 lg:block', panel && 'lg:row-span-2 xl:row-span-1')}>
        <nav className="grid gap-1" aria-label={t(mod.label)}>
          {workspace.sidebar.map((item) => (
            <SideNode key={text(item.label, 'en', t) + (item.to ?? '')} item={item} locale={locale} t={t} pathname={pathname} />
          ))}
          <button type="button" className="keel-chip w-full justify-start" onClick={() => setPanel(true)}>
            <span className="grid size-6 place-items-center rounded-full bg-[color-mix(in_srgb,white_55%,transparent)]">
              <Circle className="size-4" aria-hidden />
            </span>
            {t('ws.started')}
          </button>
        </nav>
      </aside>
      <div className="min-w-0">
        <section>
          <h2 className="text-lg font-semibold tracking-tight">{t('ws.shortcuts')}</h2>
          <div className="keel-glass mt-3 rounded-[28px] p-4 sm:p-5">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold">{text(workspace.chartTitle, locale, t)}</h3>
                <p className="text-xs text-muted-foreground">{t('ws.synced')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TrendPill pct={move.pct} up={move.up} caption={t('ws.trend')} />
                <span className="keel-chip">{t('ws.lastYear')}</span>
              </div>
            </div>
            <MonthChart points={workspace.chart} locale={locale} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {workspace.kpis.map((kpi, index) => {
              const Icon = kpiIcons[index % kpiIcons.length] ?? ClipboardList
              return (
                <Link
                  key={kpi.to + text(kpi.label, 'en', t)}
                  to={kpi.to}
                  className={cn(
                    'keel-glass flex flex-col gap-3 rounded-[28px] p-4 transition hover:-translate-y-0.5 hover:shadow-md sm:p-5',
                    kpiTones[index % kpiTones.length],
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn('grid size-11 place-items-center rounded-full', kpiIconTones[index % kpiIconTones.length])}>
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <TrendPill pct={move.pct} up={move.up} title={t('ws.trend')} />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">{text(kpi.label, locale, t)}</p>
                  <p className="truncate text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{kpi.money ? money(kpi.value) : kpi.value}</p>
                </Link>
              )
            })}
          </div>
        </section>
        <section className="mt-8">
          <h2 className="text-lg font-semibold tracking-tight">{t('ws.masters')}</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {workspace.groups.map((group) => (
              <div key={text(group.title, 'en', t)} className="keel-glass rounded-[28px] p-4">
                <h3 className="mb-3 flex items-center gap-2 font-semibold">
                  <span className="grid size-8 place-items-center rounded-full bg-[var(--kl-color-primary-100)] text-[var(--kl-color-primary-700)]">
                    <SideGlyph label={group.title} />
                  </span>
                  {text(group.title, locale, t)}
                </h3>
                <ul className="grid gap-1.5">
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
        <aside className="keel-glass mt-6 rounded-[28px] p-4 lg:col-start-2 xl:col-start-auto xl:mt-0">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">{t('ws.started')}</h2>
            <button type="button" className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-[var(--kl-color-primary-100)]" aria-label={t('ws.close')} onClick={() => setPanel(false)}>
              <X className="size-4" />
            </button>
          </div>
          <div className="mt-4 text-center">
            <KeelMark className="mx-auto size-10" />
            <p className="mt-3 font-semibold">{t('ws.setupName', { name: t(mod.label) })}</p>
            <p className="text-sm text-muted-foreground">{t('ws.steps', { done: finished, total })}</p>
          </div>
          <div
            className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--kl-color-primary-100)]"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={t('ws.percent', { percent })}
          >
            <div className="h-full rounded-full bg-[var(--kl-color-primary-fill)]" style={{ width: `${percent}%` }} />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">{t('ws.percent', { percent })}</span>
            <button type="button" className="keel-chip" onClick={() => setDone(workspace.steps.map((_, index) => String(index)))}>
              {t('ws.skip')}
            </button>
          </div>
          <ul className="mt-4 grid gap-2">
            {workspace.steps.map((step, index) => {
              const id = String(index)
              const complete = done.includes(id)
              const label = text(step.label, locale, t)
              return (
                <li
                  key={id}
                  className={cn(
                    'flex items-center gap-2 rounded-full border border-[var(--kl-glass-border)] bg-[color-mix(in_srgb,white_28%,transparent)] py-1 pr-3 pl-1',
                    complete && 'bg-[var(--kl-color-primary-100)]',
                  )}
                >
                  <button
                    type="button"
                    aria-pressed={complete}
                    aria-label={label}
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-full border',
                      complete
                        ? 'border-transparent bg-[var(--kl-color-primary-fill)] text-white'
                        : 'border-[var(--kl-glass-border)] bg-[color-mix(in_srgb,var(--kl-color-semantic-surface)_70%,transparent)] text-muted-foreground',
                    )}
                    onClick={() => setDone((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))}
                  >
                    <Check className={cn('size-3.5', !complete && 'opacity-30')} />
                  </button>
                  <Link
                    to={step.to}
                    className={cn('min-w-0 flex-1 truncate text-sm font-medium', complete && 'text-muted-foreground line-through')}
                    onClick={() => setDone((current) => (current.includes(id) ? current : [...current, id]))}
                  >
                    {label}
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
