import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-[13px] font-semibold text-[var(--kl-color-neutral-700)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

export function Notice({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-[var(--kl-color-danger-border)] bg-[var(--kl-color-danger-bg)] px-3 py-2 text-sm text-[var(--kl-color-danger-fg)]">
      {message}
    </p>
  )
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: { to: string; label: string } }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/70 px-4 py-8 text-center">
      <p className="font-serif text-xl">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      {action ? (
        <Link className="mt-4 inline-flex h-[34px] items-center rounded-md bg-primary px-3 text-sm font-semibold text-white hover:bg-[var(--kl-color-primary-600)]" to={action.to}>
          {action.label}
        </Link>
      ) : null}
    </div>
  )
}
