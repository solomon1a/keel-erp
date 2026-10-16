import { Navigate, useParams } from 'react-router-dom'
import { menuIconId, moduleAccent, moduleIconId } from '../brand/module-icon.tsx'
import { LauncherTile } from '../components/launcher-tile.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { menuLabel } from '../lib/menu-label.ts'
import { hubTiles, segmentTiles } from '../lib/module-hub.ts'
import { appModules } from '../lib/modules.ts'

export function ModuleHubPage() {
  const { moduleId = '', segment } = useParams()
  const { locale, t } = useI18n()
  const mod = appModules.find((item) => item.id === moduleId)
  if (!mod) return <Navigate to="/" replace />
  const focus = segment ? segmentTiles(mod, segment) : null
  if (segment && !focus) return <Navigate to={mod.home} replace />
  const tiles = focus ? focus.tiles : hubTiles(mod)
  const title = focus ? menuLabel(focus.title, locale, t) : t(mod.label)
  const lead = focus ? t('hub.lead') : t(mod.description)

  return (
    <div className="mx-auto max-w-5xl py-6 md:py-10">
      <div className="mb-10 text-center">
        <h1 className="keel-greeting">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{lead}</p>
      </div>
      <div className="mx-auto grid max-w-[920px] grid-cols-3 justify-items-center gap-x-3 gap-y-8 sm:grid-cols-4 lg:grid-cols-5">
        {tiles.map((tile) => (
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
