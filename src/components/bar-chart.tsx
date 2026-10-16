export function BarChart({ rows }: { rows: Array<{ label: string; value: number; display: string }> }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 1)
  return (
    <div className="grid gap-2">
      {rows.map((row) => (
        <div key={row.label} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-sm">
          <span className="truncate text-muted-foreground">{row.label}</span>
          <div className="h-2 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-2 rounded-full bg-primary transition-[width] duration-300"
              style={{ width: `${Math.max(4, (Math.abs(row.value) / max) * 100)}%` }}
            />
          </div>
          <span className="font-medium tabular-nums">{row.display}</span>
        </div>
      ))}
    </div>
  )
}
