import { findDeskScreen } from '../../shared/desk-screens.ts'
import type { Locale, Translate } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'

export function menuLabel(label: string, locale: Locale, t: Translate) {
  if (label.startsWith('desk.s.')) {
    const parts = label.split('.')
    const found = findDeskScreen(parts[2] ?? '', parts.slice(3).join('.'))
    if (!found) return label
    return locale === 'zh' ? found.titleZh : found.titleEn
  }
  return t(label as MessageKey)
}

export function screenCopy(module: string, screen: string, locale: Locale) {
  const found = findDeskScreen(module, screen)
  if (!found) return null
  if (locale === 'zh') return { title: found.titleZh, lead: found.leadZh, screen: found }
  return { title: found.titleEn, lead: found.leadEn, screen: found }
}
