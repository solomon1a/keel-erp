export function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
}

export function shortDate(value: string | null | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export function dateInput(value: string | null | undefined) {
  if (!value) return ''
  return value.slice(0, 10)
}

export const orderStateLabel: Record<string, string> = {
  draft: 'Quotation',
  sent: 'Sent',
  sale: 'Sales order',
  done: 'Delivered',
  cancel: 'Cancelled',
}
