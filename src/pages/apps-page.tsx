import { useQuery } from '@tanstack/react-query'
import { moduleAccent, moduleIconId } from '../brand/module-icon.tsx'
import { DemoLaunch } from '../components/demo-tour.tsx'
import { LauncherTile } from '../components/launcher-tile.tsx'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import { launcherModules } from '../lib/modules.ts'
import type { User } from '../lib/types.ts'
import { workspaceFor } from '../lib/workspaces.ts'

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
      <DemoLaunch place="launcher" />
      <div className="keel-glass mx-auto grid max-w-[960px] grid-cols-3 justify-items-center gap-x-3 gap-y-8 rounded-[32px] px-4 py-8 sm:grid-cols-4 sm:px-8 lg:grid-cols-5">
        {modules.map((mod) => (
          <LauncherTile key={mod.id} to={workspaceFor(mod.id) ? `/go/${mod.id}` : mod.home} label={t(mod.label)} icon={moduleIconId(mod.id)} accent={moduleAccent(mod.id)} />
        ))}
      </div>
    </div>
  )
}
