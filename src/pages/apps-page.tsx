import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { moduleAccent, moduleIconId, ModuleIcon } from '../brand/module-icon.tsx'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import { launcherModules } from '../lib/modules.ts'
import type { User } from '../lib/types.ts'

function greetingKey(hour: number): MessageKey {
  if (hour < 12) return 'apps.greeting.morning'
  if (hour < 18) return 'apps.greeting.afternoon'
  return 'apps.greeting.evening'
}

export function AppsPage() {
  const { t } = useI18n()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const hour = new Date().getHours()
  const name = me.data?.name ?? ''
  const modules = launcherModules()

  return (
    <div className="mx-auto max-w-5xl py-6 md:py-10">
      <div className="mb-10 text-center">
        <h1 className="keel-greeting">{name ? t(greetingKey(hour), { name }) : t('apps.title')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {me.data ? t('apps.meta', { company: me.data.company.name, count: modules.length }) : t('apps.lead')}
        </p>
      </div>
      <div className="mx-auto grid max-w-[920px] grid-cols-3 justify-items-center gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-5">
        {modules.map((mod) => (
          <Link key={mod.id} to={mod.home} className="group flex w-[96px] flex-col items-center gap-2 text-center">
            <span
              className="grid size-[84px] place-items-center text-white shadow-md transition group-hover:-translate-y-0.5"
              style={{
                borderRadius: 20,
                background: `linear-gradient(155deg, ${moduleAccent(mod.id)} 0%, color-mix(in srgb, ${moduleAccent(mod.id)} 78%, black) 100%)`,
              }}
            >
              <ModuleIcon id={moduleIconId(mod.id)} className="size-10" />
            </span>
            <span className="text-sm font-medium leading-tight">{t(mod.label)}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
