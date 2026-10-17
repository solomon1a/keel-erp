import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, LogOut, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { KeelMark } from '../brand/mark.tsx'
import { menuIconId, moduleAccent, moduleIconId, ModuleIcon } from '../brand/module-icon.tsx'
import { ThemeToggle } from '../brand/theme.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import { menuLabel } from '../lib/menu-label.ts'
import { linkActive, moduleForPath, sectionForPath, type AppModule, type MenuEntry } from '../lib/modules.ts'
import { prefetchDesk } from '../lib/prefetch.ts'
import type { User } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { BarChart } from './bar-chart.tsx'
import { LanguageSwitcher } from './language-switcher.tsx'
import { Button } from './ui/button.tsx'

type Desk = {
  openOrders: number
  pipelineValue: number
  pipelineCount: number
  receivable: number
  shopOrders: number
  staff: number
  lowStock: unknown[]
  productCount: number
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]
  if (!first) return '·'
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined
  if (!last) return first.slice(0, 2).toUpperCase()
  return `${first[0] ?? ''}${last[0] ?? ''}`.toUpperCase()
}

function roleText(role: User['role'], t: Translate) {
  switch (role) {
    case 'admin':
      return t('role.admin')
    case 'user':
      return t('role.user')
    default: {
      const unexpected: never = role
      return unexpected
    }
  }
}

function MenuItems({ mod, pathname, search, onNavigate }: { mod: AppModule; pathname: string; search: string; onNavigate: () => void }) {
  const { locale, t } = useI18n()
  return (
    <>
      {mod.menu.map((entry) => (
        <MenuNode key={entry.label + (entry.to ?? '')} entry={entry} pathname={pathname} search={search} onNavigate={onNavigate} label={menuLabel(entry.label, locale, t)} />
      ))}
    </>
  )
}

function MenuGlyph({ label }: { label: string }) {
  const icon = menuIconId(label)
  if (!icon) return null
  return <ModuleIcon id={icon} className="size-4 text-current" />
}

function MenuNode({ entry, pathname, search, onNavigate, label }: { entry: MenuEntry; pathname: string; search: string; onNavigate: () => void; label: string }) {
  const { locale, t } = useI18n()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const overMenu = useRef(false)
  const closeTimer = useRef<number | null>(null)
  const [opened, setOpened] = useState(false)
  const [box, setBox] = useState({ top: 0, left: 0 })
  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    const width = 220
    const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8)
    setBox({ top: rect.bottom + 6, left })
    setOpened(true)
  }
  const cancelClose = () => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current)
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = window.setTimeout(() => {
      if (!overMenu.current) setOpened(false)
    }, 140)
  }
  useEffect(() => {
    if (!opened) return
    const close = () => setOpened(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [opened])
  if (entry.children) {
    const current = entry.children.some((child) => linkActive(child.to, pathname, search))
    return (
      <div className="relative" onMouseEnter={() => { cancelClose(); place() }} onMouseLeave={scheduleClose}>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={opened}
          onClick={() => (opened ? setOpened(false) : place())}
          className={cn('keel-chip', (current || opened) && 'keel-chip-active')}
        >
          <MenuGlyph label={entry.label} />
          {label}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
        {opened
          ? createPortal(
              <div
                className="fixed z-40 min-w-52"
                style={{ top: box.top, left: box.left }}
                onMouseEnter={() => {
                  overMenu.current = true
                  cancelClose()
                }}
                onMouseLeave={() => {
                  overMenu.current = false
                  setOpened(false)
                }}
              >
                <div className="keel-glass grid max-h-[70vh] gap-1 overflow-y-auto rounded-3xl p-2 shadow-lg">
                  {entry.children.map((child) => (
                    <NavLink
                      key={child.to}
                      to={child.to}
                      onClick={() => {
                        setOpened(false)
                        onNavigate()
                      }}
                      className={() => cn('keel-chip w-full justify-start', linkActive(child.to, pathname, search) && 'keel-chip-active')}
                    >
                      <MenuGlyph label={child.label} />
                      {menuLabel(child.label, locale, t)}
                    </NavLink>
                  ))}
                </div>
              </div>,
              document.body,
            )
          : null}
      </div>
    )
  }
  if (!entry.to) return null
  const active = linkActive(entry.to, pathname, search)
  return (
    <NavLink to={entry.to} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={() => cn('keel-chip', active && 'keel-chip-active')}>
      <MenuGlyph label={entry.label} />
      {label}
    </NavLink>
  )
}

function AccountMenu({ user }: { user: User }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
  return (
    <div className="relative lg:hidden" ref={ref}>
      <button
        type="button"
        className="grid size-9 place-items-center rounded-full bg-[var(--kl-color-brass-100)] text-[11px] font-semibold text-[var(--kl-color-brass-700)]"
        aria-label={t('shell.account')}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {initials(user.name)}
      </button>
      {open ? (
        <div className="keel-glass absolute right-0 z-40 mt-2 w-64 rounded-3xl p-3 shadow-lg">
          <p className="truncate px-1 text-sm font-semibold">{user.name}</p>
          <p className="truncate px-1 text-xs text-muted-foreground">{roleText(user.role, t)}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          {user.role === 'admin' ? (
            <Link className="keel-chip mt-3 w-full justify-start" to="/admin/users" onClick={() => setOpen(false)}>
              <Users className="size-4" />
              {t('menu.people')}
            </Link>
          ) : null}
          <Link className="keel-chip mt-2 w-full justify-start" to="/settings" onClick={() => setOpen(false)}>
            {user.name}
          </Link>
          <button
            type="button"
            className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-full bg-[var(--kl-color-primary-fill)] text-sm font-semibold text-white"
            onClick={() => {
              void api('/api/session/logout', { method: 'POST' }).finally(() => {
                queryClient.clear()
                navigate('/sign-in')
              })
            }}
          >
            <LogOut className="size-4" />
            {t('shell.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  )
}

function ModulePulse({ mod }: { mod: AppModule }) {
  const { t } = useI18n()
  const money = useMoney()
  const desk = useQuery({ queryKey: ['desk'], queryFn: () => api<Desk>('/api/desk') })
  const purchases = useQuery({ queryKey: ['purchases', 'all'], queryFn: () => api<unknown[]>('/api/purchases?state=all') })
  const manufacturing = useQuery({ queryKey: ['manufacturing', 'all'], queryFn: () => api<unknown[]>('/api/manufacturing?state=all') })
  const sessions = useQuery({ queryKey: ['pos-sessions'], queryFn: () => api<unknown[]>('/api/pos/sessions') })
  const data = desk.data
  if (!data) return null
  const rows = pulseRows(mod.id, data, t, money, {
    purchases: purchases.data?.length ?? 0,
    manufacturing: manufacturing.data?.length ?? 0,
    sessions: sessions.data?.length ?? 0,
  })
  if (rows.length === 0) return null
  return (
    <section className="keel-glass mb-6 rounded-[28px] p-4">
      <h2 className="mb-3 font-semibold">{t('chart.title')}</h2>
      <BarChart rows={rows} />
    </section>
  )
}

function pulseRows(
  id: string,
  data: Desk,
  t: Translate,
  money: (value: number) => string,
  extra: { purchases: number; manufacturing: number; sessions: number },
) {
  switch (id) {
    case 'dashboard':
    case 'sales':
      return [
        { label: t('desk.openOrders'), value: data.openOrders, display: String(data.openOrders) },
        { label: t('desk.shopOrders'), value: data.shopOrders, display: String(data.shopOrders) },
        { label: t('desk.receivable'), value: data.receivable, display: money(data.receivable) },
      ]
    case 'crm':
      return [
        { label: t('desk.pipeline'), value: data.pipelineCount, display: String(data.pipelineCount) },
        { label: t('desk.pipeline'), value: data.pipelineValue, display: money(data.pipelineValue) },
      ]
    case 'purchase':
      return [{ label: t('menu.rfq'), value: extra.purchases, display: String(extra.purchases) }]
    case 'manufacturing':
      return [{ label: t('menu.mo'), value: extra.manufacturing, display: String(extra.manufacturing) }]
    case 'pos':
      return [{ label: t('menu.sessions'), value: extra.sessions, display: String(extra.sessions) }]
    case 'accounting':
      return [{ label: t('desk.receivable'), value: data.receivable, display: money(data.receivable) }]
    case 'inventory':
      return [
        { label: t('desk.products'), value: data.productCount, display: String(data.productCount) },
        { label: t('desk.low'), value: data.lowStock.length, display: String(data.lowStock.length) },
      ]
    case 'website':
      return [{ label: t('desk.shopOrders'), value: data.shopOrders, display: String(data.shopOrders) }]
    case 'hr':
      return [{ label: t('desk.staff'), value: data.staff, display: String(data.staff) }]
    default:
      return []
  }
}

export function Shell() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const { locale, t } = useI18n()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/api/session/me'),
    retry: false,
  })

  useEffect(() => {
    if (me.data) prefetchDesk(queryClient)
  }, [me.data, queryClient])

  if (me.isPending && !me.data) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="h-8 w-40 animate-pulse rounded bg-secondary" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-lg bg-secondary/70" />
          ))}
        </div>
      </div>
    )
  }
  if (!me.data) return <Navigate to="/sign-in" replace />

  const mod = moduleForPath(location.pathname)
  const section = mod ? sectionForPath(mod, location.pathname, location.search) : null
  const showPulse = Boolean(mod && location.pathname === mod.home && !location.pathname.startsWith('/go/'))

  return (
    <div className="min-h-screen">
      <header className="keel-glass sticky top-0 z-20 border-x-0 border-t-0">
        <div className="flex h-14 items-center gap-2 px-3 md:px-4">
          <Link to="/" className="inline-flex shrink-0 items-center gap-2 rounded-full" aria-label={t('shell.apps')}>
            <KeelMark className="size-7" />
            <span className="font-semibold tracking-tight">Keel</span>
          </Link>
          <span className="h-5 w-px shrink-0 bg-border" aria-hidden />
          {mod ? (
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
              <ModuleIcon id={moduleIconId(mod.id)} className="size-4 shrink-0" style={{ color: moduleAccent(mod.id) }} />
              <span className="truncate">{t(mod.label)}</span>
            </span>
          ) : (
            <span className="min-w-0 truncate text-sm text-muted-foreground">{me.data.company.name}</span>
          )}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <div className="hidden items-center gap-1 lg:flex">
              <LanguageSwitcher />
              <ThemeToggle />
              {me.data.role === 'admin' ? (
                <Link className="keel-chip" to="/admin/users">
                  <Users className="size-4" />
                  {t('menu.people')}
                </Link>
              ) : null}
              <Link
                to="/settings"
                title={`${me.data.name} · ${roleText(me.data.role, t)}`}
                className="grid size-9 place-items-center rounded-full bg-[var(--kl-color-brass-100)] text-[11px] font-semibold text-[var(--kl-color-brass-700)]"
              >
                {initials(me.data.name)}
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                aria-label={t('shell.signOut')}
                onClick={() => {
                  void api('/api/session/logout', { method: 'POST' }).finally(() => {
                    queryClient.clear()
                    navigate('/sign-in')
                  })
                }}
              >
                <LogOut className="size-4" />
                <span>{t('shell.signOut')}</span>
              </Button>
            </div>
            <AccountMenu user={me.data} />
          </div>
        </div>
        {mod ? (
          <nav className="keel-scroll flex gap-1.5 overflow-x-auto px-3 pb-3" aria-label={t(mod.label)}>
            <MenuItems mod={mod} pathname={location.pathname} search={location.search} onNavigate={() => undefined} />
          </nav>
        ) : null}
      </header>
      <main className="keel-page mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {mod ? (
          <nav className="keel-crumbs" aria-label={t(mod.label)}>
            <Link to="/">{t('shell.apps')}</Link>
            <Link to={mod.home}>{t(mod.label)}</Link>
            {section && section.to.split('?')[0] !== mod.home ? (
              <span aria-current="page">{menuLabel(section.label, locale, t)}</span>
            ) : null}
          </nav>
        ) : null}
        {showPulse && mod ? <ModulePulse mod={mod} /> : null}
        <Outlet />
      </main>
    </div>
  )
}
