import { useQuery } from '@tanstack/react-query'
import { rateFor } from '../../shared/exchange.ts'
import { useI18n, type Locale } from '../i18n/locale.tsx'
import { api } from './api.ts'
import { readStoredDisplay, type RateRow } from './display-money.ts'
import type { User } from './types.ts'

export function formatMoney(value: number, currency: string, locale: Locale) {
  const intlLocale = locale === 'zh' ? 'zh-CN' : 'en-US'
  return new Intl.NumberFormat(intlLocale, { style: 'currency', currency }).format(value)
}

type RateTable = { base: string; rates: RateRow[] }

export function useDisplay() {
  const { locale } = useI18n()
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/api/session/me'),
    retry: false,
  })
  const rates = useQuery({
    queryKey: ['exchange-rates'],
    queryFn: () => api<RateTable>('/api/exchange-rates'),
    enabled: Boolean(me.data),
  })
  const base = me.data?.company.currency ?? rates.data?.base ?? 'CNY'
  const chosen = me.data?.displayCurrency || readStoredDisplay(me.data?.id) || base
  const known = rates.data?.rates.some((row) => row.currency === chosen) || chosen === base
  const currency = known ? chosen : base
  const rate = rateFor(base, currency, rates.data?.rates ?? []) ?? 1
  const converted = currency !== base && rate !== 1
  return {
    signedIn: Boolean(me.data),
    base,
    currency,
    rate,
    converted,
    rates: rates.data?.rates ?? [],
    convert: (amount: number) => amount * (currency === base ? 1 : rate),
    format: (amount: number) => formatMoney(amount * (currency === base ? 1 : rate), currency, locale),
  }
}

export function useMoney() {
  return useDisplay().format
}

export function useBaseCurrency() {
  return useDisplay().base
}

export function taxIdForCompany(
  taxes: Array<{ id: number; rate: number; isDefault: boolean }> | undefined,
  rate: number | undefined,
) {
  if (!taxes?.length) return undefined
  const match = rate === undefined ? undefined : taxes.find((tax) => Math.abs(tax.rate - rate) < 0.0001)
  return match?.id ?? taxes.find((tax) => tax.isDefault)?.id ?? taxes[0]?.id
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
