import { cn } from '../../lib/utils.ts'

const tones: Record<string, string> = {
  draft: '',
  sent: 'keel-badge-warning',
  ready: 'keel-badge-warning',
  open: 'keel-badge-warning',
  closed: '',
  paid: 'keel-badge-success',
  partial: 'keel-badge-warning',
  refunded: 'keel-badge-danger',
  sale: 'keel-badge-success',
  purchase: 'keel-badge-success',
  confirmed: 'keel-badge-success',
  progress: 'keel-badge-info',
  done: 'keel-badge-success',
  cancel: 'keel-badge-danger',
  product: 'keel-badge-success',
  service: 'keel-badge-info',
  neutral: '',
  approved: 'keel-badge-success',
  submitted: 'keel-badge-warning',
  refused: 'keel-badge-danger',
  posted: 'keel-badge-success',
  waiting: 'keel-badge-warning',
  running: 'keel-badge-info',
  paused: 'keel-badge-warning',
  pending: '',
}

export function Badge({ tone = 'neutral', children }: { tone?: string; children: string }) {
  return <span className={cn('keel-badge', tones[tone] ?? '')}>{children}</span>
}
