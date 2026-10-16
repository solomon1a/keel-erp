import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, LayoutGrid } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
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
  const { t } = useI18n()
  return (
    <>
      {mod.menu.map((entry) => (
        <MenuNode key={entry.label} entry={entry} pathname={pathname} search={search} onNavigate={onNavigate} label={t(entry.label)} />
      ))}
    </>
  )
}

function MenuNode({ entry, pathname, search, onNavigate, label }: { entry: MenuEntry; pathname: string; search: string; onNavigate: () => void; label: string }) {
  const { t } = useI18n()
  if (entry.children) {
    const open = entry.children.some((child) => linkActive(child.to, pathname, search))
    return (
      <div className="group relative">
        <button
          type="button"
          className={cn(
            'flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium',
            open ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
          )}
        >
          {label}
          <ChevronDown className="size-3.5 opacity-70" />
        </button>
        <div className="invisible absolute left-0 top-full z-30 hidden min-w-44 pt-1 group-hover:visible group-hover:block group-focus-within:visible group-focus-within:block">
          <div className="rounded-md border border-border bg-card p-1 shadow-md">
            {entry.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={onNavigate}
                className={() =>
                  cn(
                    'block rounded-md px-3 py-2 text-sm',
                    linkActive(child.to, pathname, search) ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                  )
                }
              >
                {t(child.label)}
              </NavLink>
            ))}
          </div>
        </div>
      </div>
    )
  }
  if (!entry.to) return null
  const active = linkActive(entry.to, pathname, search)
  return (
    <NavLink
      to={entry.to}
      onClick={onNavigate}
      className={() => cn('rounded-md px-3 py-2 text-sm font-medium', active ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}
    >
      {label}
    </NavLink>
  )
}

function MobileMenu({ mod, pathname, search, onNavigate }: { mod: AppModule; pathname: string; search: string; onNavigate: () => void }) {
  const { t } = useI18n()
  const links = mod.menu.flatMap((entry) => entry.children ?? (entry.to ? [{ label: entry.label, to: entry.to }] : []))
  return (
    <div className="grid gap-1 border-t border-border px-4 py-3 md:hidden">
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          onClick={onNavigate}
          className={() =>
            cn(
              'rounded-md px-3 py-2 text-sm font-medium',
              linkActive(link.to, pathname, search) ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
            )
          }
        >
          {t(link.label)}
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
    <section className="mb-6 rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 font-serif text-xl">{t('chart.title')}</h2>
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
  const { t } = useI18n()
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
  const showPulse = mod ? location.pathname === mod.home : false

  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <div className="flex min-w-0 items-center gap-2">
            {mod ? (
              <Button className="md:hidden" variant="outline" size="sm" onClick={() => setMenuOpen((open) => !open)}>
                {menuOpen ? t('shell.close') : t('shell.menu')}
              </Button>
            ) : null}
            <Link to="/" className="inline-flex items-center gap-2 rounded-md px-2 py-1 text-sm font-semibold hover:bg-secondary">
              <LayoutGrid className="size-4" />
              {t('shell.apps')}
            </Link>
            {mod ? (
              <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                <mod.icon className="size-4 shrink-0 text-primary" />
                <span className="truncate">{t(mod.label)}</span>
              </span>
            ) : (
              <span className="truncate text-sm text-muted-foreground">{me.data.company.name}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <p className="hidden text-sm sm:block">
              <span className="font-semibold">{me.data.name}</span>
              <span className="text-muted-foreground"> · {roleText(me.data.role, t)}</span>
            </p>
            <LanguageSwitcher />
            <Link className="hidden rounded-md px-2 py-1 text-sm hover:bg-secondary md:inline" to="/settings">{t('menu.company')}</Link>
            {me.data.role === 'admin' ? (
              <Link className="hidden rounded-md px-2 py-1 text-sm hover:bg-secondary md:inline" to="/admin/users">{t('menu.people')}</Link>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void api('/api/session/logout', { method: 'POST' }).finally(() => {
                  queryClient.clear()
                  navigate('/sign-in')
                })
              }}
            >
              {t('shell.signOut')}
            </Button>
          </div>
        </div>
        {mod ? (
          <div className="mx-auto hidden max-w-7xl items-center gap-1 px-4 pb-3 md:flex md:px-6">
            <MenuItems mod={mod} pathname={location.pathname} search={location.search} onNavigate={() => setMenuOpen(false)} />
          </div>
        ) : null}
        {mod && menuOpen ? (
          <MobileMenu mod={mod} pathname={location.pathname} search={location.search} onNavigate={() => setMenuOpen(false)} />
        ) : null}
      </header>
      <main className="keel-page mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {mod ? (
          <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
            <Link className="hover:text-foreground hover:underline" to="/">{t('shell.apps')}</Link>
            <span>/</span>
            <Link className="hover:text-foreground hover:underline" to={mod.home}>{t(mod.label)}</Link>
            {section && section.to.split('?')[0] !== mod.home ? (
              <>
                <span>/</span>
                <span className="text-foreground">{t(section.label)}</span>
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
