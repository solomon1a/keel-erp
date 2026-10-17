import { Navigate, useParams } from 'react-router-dom'
import { menuIconId, moduleAccent, moduleIconId } from '../brand/module-icon.tsx'
import { LauncherTile } from '../components/launcher-tile.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { menuLabel } from '../lib/menu-label.ts'
import { segmentTiles } from '../lib/module-hub.ts'
import { appModules, type AppModule } from '../lib/modules.ts'
import { workspaceFor } from '../lib/workspaces.ts'
import { HomePage } from './home-page.tsx'
import { WorkspaceHome } from './workspace-home.tsx'

function SegmentGrid({ mod, segment }: { mod: AppModule; segment: string }) {
  const { locale, t } = useI18n()
  const focus = segmentTiles(mod, segment)
  if (!focus) return <Navigate to={mod.home} replace />
  return (
    <div className="mx-auto max-w-5xl py-6 md:py-10">
      <div className="mb-10 text-center">
        <h1 className="keel-greeting">{menuLabel(focus.title, locale, t)}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('hub.lead')}</p>
      </div>
      <div className="mx-auto grid max-w-[920px] grid-cols-3 justify-items-center gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-5">
        {focus.tiles.map((tile) => (
          <LauncherTile
            key={tile.key}
            to={tile.to}
            label={menuLabel(tile.label, locale, t)}
            icon={menuIconId(tile.label) ?? moduleIconId(mod.id)}
            accent={moduleAccent(mod.id)}
          />
        ))}
      </div>
    </div>
  )
}

export function ModuleHubPage() {
  const { moduleId = '', segment } = useParams()
  const mod = appModules.find((item) => item.id === moduleId)
  if (!mod) return <Navigate to="/" replace />
  if (segment) return <SegmentGrid mod={mod} segment={segment} />
  if (mod.id === 'dashboard') return <HomePage />
  const workspace = workspaceFor(mod.id)
  if (!workspace) return <Navigate to="/" replace />
  return <WorkspaceHome mod={mod} workspace={workspace} />
}
