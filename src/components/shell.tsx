import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NavLink, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import type { User } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'
import { LanguageSwitcher } from './language-switcher.tsx'
import { Button } from './ui/button.tsx'

const links = [
  ['/', 'nav.desk'],
  ['/contacts', 'nav.contacts'],
  ['/products', 'nav.products'],
  ['/orders', 'nav.orders'],
  ['/inventory', 'nav.stock'],
  ['/settings', 'nav.settings'],
  ['/account/password', 'nav.password'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

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

export function Shell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/api/session/me'),
    retry: false,
  })

  if (me.isLoading) {
    return <p className="px-6 py-16 text-sm text-muted-foreground">{t('shell.checking')}</p>
  }
  if (!me.data) return <Navigate to="/sign-in" replace />

  const nav = me.data.role === 'admin' ? [...links, ['/admin/users', 'nav.people'] as const] : links

  return (
    <div className="mx-auto grid min-h-screen max-w-7xl md:grid-cols-[220px_1fr]">
      <aside className="border-b border-border px-4 py-4 md:border-b-0 md:border-r md:px-5 md:py-6">
        <p className="font-serif text-3xl tracking-tight">Keel</p>
        <p className="text-sm text-muted-foreground">{me.data.company.name}</p>
        <nav className="mt-4 flex gap-2 overflow-x-auto md:mt-8 md:flex-col">
          {nav.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap',
                  isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary',
                )
              }
            >
              {t(label)}
            </NavLink>
          ))}
        </nav>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3 md:px-8">
          <p className="text-sm">
            <span className="font-semibold">{me.data.name}</span>
            <span className="text-muted-foreground"> · {roleText(me.data.role, t)}</span>
          </p>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                void api('/api/session/logout', { method: 'POST' }).finally(() => {
                  queryClient.removeQueries({ queryKey: ['me'] })
                  navigate('/sign-in')
                })
              }}
            >
              {t('shell.signOut')}
            </Button>
          </div>
        </header>
        <main className="px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
