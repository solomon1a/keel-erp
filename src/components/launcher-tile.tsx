import { Link } from 'react-router-dom'
import { ModuleIcon, type ModuleIconId } from '../brand/module-icon.tsx'

export function LauncherTile({ to, label, icon, accent }: { to: string; label: string; icon: ModuleIconId; accent: string }) {
  return (
    <Link to={to} className="group flex w-[96px] flex-col items-center gap-2 text-center">
      <span
        className="grid size-[84px] place-items-center text-white shadow-md transition group-hover:-translate-y-0.5"
        style={{
          borderRadius: 20,
          background: `linear-gradient(155deg, ${accent} 0%, color-mix(in srgb, ${accent} 78%, black) 100%)`,
        }}
      >
        <ModuleIcon id={icon} className="size-10" />
      </span>
      <span className="text-sm font-medium leading-tight">{label}</span>
    </Link>
  )
}
