import { Link } from 'react-router-dom'
import { ModuleIcon, type ModuleIconId } from '../brand/module-icon.tsx'

export function LauncherTile({ to, label, icon, accent }: { to: string; label: string; icon: ModuleIconId; accent: string }) {
  return (
    <Link to={to} className="group flex w-[104px] flex-col items-center gap-2.5 text-center">
      <span
        className="grid size-[84px] place-items-center shadow-sm transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-md"
        style={{
          borderRadius: 28,
          color: accent,
          background: `linear-gradient(165deg, color-mix(in srgb, ${accent} 20%, var(--kl-color-semantic-surface)) 0%, color-mix(in srgb, ${accent} 8%, var(--kl-color-semantic-surface)) 100%)`,
          border: `1px solid color-mix(in srgb, ${accent} 28%, transparent)`,
          boxShadow: 'var(--kl-shadow-sm)',
          backdropFilter: 'blur(12px)',
        }}
      >
        <ModuleIcon id={icon} className="size-9" />
      </span>
      <span className="text-sm font-medium leading-tight text-foreground">{label}</span>
    </Link>
  )
}
