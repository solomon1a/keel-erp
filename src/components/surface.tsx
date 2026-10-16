import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../lib/utils.ts'

export function PageHeader({ title, lead, actions }: { title: string; lead?: string; actions?: ReactNode }) {
  return (
    <div className="keel-heading">
      <div className="min-w-0">
        <h1>{title}</h1>
        {lead ? <p className="keel-lead">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('keel-panel', className)}>{children}</section>
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="keel-toolbar">{children}</div>
}

export function TableFrame({ children }: { children: ReactNode }) {
  return <div className="keel-table">{children}</div>
}

export function KpiGrid({ children }: { children: ReactNode }) {
  return <div className="keel-kpis">{children}</div>
}

export function Kpi({ label, value, hint, tone = 'default' }: { label: string; value: string; hint?: string; tone?: 'default' | 'profit' }) {
  return (
    <article className={cn('keel-kpi', tone === 'profit' && 'keel-kpi-profit')}>
      <p className="keel-kpi-label">{label}</p>
      <p className="keel-kpi-value">{value}</p>
      {hint ? <p className="keel-kpi-hint">{hint}</p> : null}
    </article>
  )
}

export function KanbanBoard({ children }: { children: ReactNode }) {
  return <div className="keel-kanban">{children}</div>
}

export function KanbanColumn({ title, tint, children, ...rest }: { title: string; tint: number; children: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <section className="keel-kanban-col" data-tint={tint} {...rest}>
      <h2>{title}</h2>
      <div className="grid gap-2.5">{children}</div>
    </section>
  )
}

export function KanbanCard({ children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn('keel-kanban-card', className)} {...rest}>
      {children}
    </button>
  )
}
