import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, LogOut, Menu, Users } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
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
  const [opened, setOpened] = useState(false)
  const [box, setBox] = useState({ top: 0, left: 0 })
  const place = () => {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return
    setBox({ top: rect.bottom + 4, left: rect.left })
    setOpened(true)
  }
  if (entry.children) {
    const current = entry.children.some((child) => linkActive(child.to, pathname, search))
    return (
      <div className="relative" onMouseEnter={place} onMouseLeave={() => setOpened(false)}>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={opened}
          onClick={() => (opened ? setOpened(false) : place())}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap',
            current || opened ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
          )}
        >
          <MenuGlyph label={entry.label} />
          {label}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
        {opened ? (
        <div className="fixed z-40 min-w-48" style={{ top: box.top, left: box.left }}>
          <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-md">
            {entry.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={() => {
                  setOpened(false)
                  onNavigate()
                }}
                className={() =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                    linkActive(child.to, pathname, search) ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
                  )
                }
              >
                <MenuGlyph label={child.label} />
                {menuLabel(child.label, locale, t)}
              </NavLink>
            ))}
          </div>
        </div>
        ) : null}
      </div>
    )
  }
  if (!entry.to) return null
  const active = linkActive(entry.to, pathname, search)
  return (
    <NavLink
      to={entry.to}
      onClick={onNavigate}
      className={() =>
        cn(
          'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium whitespace-nowrap',
          active ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )
      }
    >
      <MenuGlyph label={entry.label} />
      {label}
    </NavLink>
  )
}

function MobileMenu({ mod, pathname, search, onNavigate }: { mod: AppModule; pathname: string; search: string; onNavigate: () => void }) {
  const { locale, t } = useI18n()
  const links = mod.menu.flatMap((entry) => entry.children ?? (entry.to ? [{ label: entry.label, to: entry.to }] : []))
  return (
    <div className="grid max-h-[70vh] gap-1 overflow-y-auto border-t border-border px-4 py-3 md:hidden">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          onClick={onNavigate}
          className={() =>
            cn(
              'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium',
              linkActive(link.to, pathname, search) ? 'bg-secondary font-semibold text-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
            )
          }
        >
          <MenuGlyph label={link.label} />
          {menuLabel(link.label, locale, t)}
        </NavLink>
      ))}
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
    <section className="mb-6 rounded-lg border border-border bg-card p-4 shadow-sm">
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
  const [menuOpen, setMenuOpen] = useState(false)
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/api/session/me'),
    retry: false,
  })

  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname, location.search])

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
      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="flex h-[52px] items-center gap-2 px-3 md:gap-3 md:px-4">
          {mod ? (
            <Button className="md:hidden" variant="ghost" size="sm" aria-label={menuOpen ? t('shell.close') : t('shell.menu')} onClick={() => setMenuOpen((open) => !open)}>
              <Menu className="size-4" />
            </Button>
          ) : null}
          <Link to="/" className="inline-flex shrink-0 items-center gap-2 rounded-md" aria-label={t('shell.apps')}>
            <KeelMark className="size-7" />
            <span className="hidden font-semibold tracking-tight sm:inline">Keel</span>
          </Link>
          <span className="hidden h-5 w-px shrink-0 bg-border sm:block" aria-hidden />
          {mod ? (
            <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
              <ModuleIcon id={moduleIconId(mod.id)} className="size-4" style={{ color: moduleAccent(mod.id) }} />
              <span className="hidden truncate sm:inline">{t(mod.label)}</span>
            </span>
          ) : (
            <span className="hidden min-w-0 truncate text-sm text-muted-foreground md:inline">{me.data.company.name}</span>
          )}
          {mod ? (
            <nav className="ml-1 hidden min-w-0 flex-1 items-center gap-0.5 overflow-x-auto md:flex">
              <MenuItems mod={mod} pathname={location.pathname} search={location.search} onNavigate={() => setMenuOpen(false)} />
            </nav>
          ) : <span className="flex-1" />}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <LanguageSwitcher />
            <ThemeToggle />
            {me.data.role === 'admin' ? (
              <Link className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground md:hidden" to="/admin/users" aria-label={t('menu.people')}>
                <Users className="size-4" />
              </Link>
            ) : null}
            {me.data.role === 'admin' ? (
              <Link className="hidden rounded-md px-2 py-1 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground md:inline" to="/admin/users">{t('menu.people')}</Link>
            ) : null}
            <Link
              to="/settings"
              title={`${me.data.name} · ${roleText(me.data.role, t)}`}
              className="grid size-[30px] place-items-center rounded-full bg-[var(--kl-color-brass-100)] text-[11px] font-semibold text-[var(--kl-color-brass-700)]"
            >
              {initials(me.data.name)}
            </Link>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('shell.signOut')}
              onClick={() => {
                void api('/api/session/logout', { method: 'POST' }).finally(() => {
                  queryClient.clear()
                  navigate('/sign-in')
                })
              }}
            >
              <LogOut className="size-4 sm:hidden" />
              <span className="hidden sm:inline">{t('shell.signOut')}</span>
            </Button>
          </div>
        </div>
        {mod && menuOpen ? (
          <MobileMenu mod={mod} pathname={location.pathname} search={location.search} onNavigate={() => setMenuOpen(false)} />
        ) : null}
      </header>
      <main className="keel-page mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {mod ? (
          <nav className="mb-3 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <Link className="hover:text-foreground hover:underline" to="/">{t('shell.apps')}</Link>
            <span>/</span>
            <Link className="hover:text-foreground hover:underline" to={mod.home}>{t(mod.label)}</Link>
            {section && section.to.split('?')[0] !== mod.home ? (
              <>
                <span>/</span>
                <span className="text-foreground">{menuLabel(section.label, locale, t)}</span>
              </>
            ) : null}
          </nav>
        ) : null}
        {showPulse && mod ? <ModulePulse mod={mod} /> : null}
        <Outlet />
      </main>
    </div>
  )
}
