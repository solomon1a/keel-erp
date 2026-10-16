import { cn } from '../lib/utils.ts'

export function KeelMark({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  if (onDark) {
    return <img src="/brand/logo/keel-icon-dark.svg" alt="" className={className} />
  }
  return (
    <span className={cn('relative inline-block shrink-0', className)}>
      <img src="/brand/logo/keel-icon.svg" alt="" className="keel-mark-light size-full" />
      <img src="/brand/logo/keel-icon-dark.svg" alt="" className="keel-mark-dark absolute inset-0 size-full" />
    </span>
  )
}
