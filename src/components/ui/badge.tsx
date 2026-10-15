import { cn } from '../../lib/utils.ts'

const tones: Record<string, string> = {
  draft: 'bg-secondary text-foreground',
  sent: 'bg-accent/25 text-foreground',
  ready: 'bg-accent/25 text-foreground',
  sale: 'bg-primary text-primary-foreground',
  purchase: 'bg-primary text-primary-foreground',
  confirmed: 'bg-primary text-primary-foreground',
  progress: 'bg-accent/25 text-foreground',
  done: 'bg-foreground text-background',
  cancel: 'bg-destructive/15 text-destructive',
  product: 'bg-primary/10 text-primary',
  service: 'bg-accent/20 text-foreground',
  neutral: 'bg-secondary text-foreground',
}

export function Badge({ tone = 'neutral', children }: { tone?: string; children: string }) {
  return (
    <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone] ?? tones.neutral)}>
      {children}
    </span>
  )
}
