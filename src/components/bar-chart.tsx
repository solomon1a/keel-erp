export function BarChart({ rows }: { rows: Array<{ label: string; value: number; display: string }> }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1)
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate text-muted-foreground">{row.label}</span>
          <div className="h-2.5 overflow-hidden rounded-full bg-[var(--kl-color-primary-100)]">
            <div
              className="h-2.5 rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.max(4, (Math.abs(row.value) / max) * 100)}%`,
                background: 'linear-gradient(90deg, color-mix(in srgb, var(--kl-color-primary-300) 80%, white), var(--kl-color-primary-fill))',
              }}
            />
          </div>
          <span className="font-medium tabular-nums">{row.display}</span>
        </div>
      ))}
    </div>
  )
}
