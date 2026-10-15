import { useQuery } from '@tanstack/react-query'
import { useI18n, type Locale } from '../i18n/locale.tsx'
import { api } from './api.ts'
import type { User } from './types.ts'

export function formatMoney(value: number, currency: string, locale: Locale) {
  const intlLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
  return new Intl.NumberFormat(intlLocale, { style: 'currency', currency }).format(value)
}

export function useMoney() {
  const { locale } = useI18n()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/api/session/me'),
    retry: false,
  })
  const currency = me.data?.company.currency ?? 'CNY'
  return (value: number) => formatMoney(value, currency, locale)
}

export function formatShortDate(value: string | null | undefined, locale: Locale) {
  if (!value) return '—'
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: locale === 'zh' ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(value))
}

export function useShortDate() {
  const { locale } = useI18n()
  return (value: string | null | undefined) => formatShortDate(value, locale)
}

export function dateInput(value: string | null | undefined) {
  if (!value) return ''
  return value.slice(0, 10)
}
