import type { Locale } from '../i18n/locale.tsx'
import { formatMoney } from './format.ts'

/**
 * Demo display rate only. Journals, invoices, and stock stay in the company
 * currency (CNY). English screens multiply by this rate and label the result PKR.
 * 1 CNY = 39 PKR.
 */
export const DEMO_CNY_TO_PKR = 39

export function displayMoneyCode(locale: Locale) {
  return locale === 'zh' ? 'CNY' : 'PKR'
}

export function ledgerToDisplay(amountCny: number, locale: Locale) {
  if (locale === 'zh') return amountCny
  return amountCny * DEMO_CNY_TO_PKR
}

export function formatDisplayMoney(amountCny: number, locale: Locale) {
  return formatMoney(ledgerToDisplay(amountCny, locale), displayMoneyCode(locale), locale)
}
