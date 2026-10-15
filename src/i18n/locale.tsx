import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { messages, type MessageKey } from './messages.ts'

export const locales = ['en', 'zh'] as const
export type Locale = (typeof locales)[number]

const cookieName = 'keel_lang'

export function isLocale(value: string): value is Locale {
  switch (value) {
    case 'en':
    case 'zh':
      return true
    default:
      return false
  }
}

export function readLocale(): Locale {
  if (typeof document === 'undefined') return 'zh'
  const parts = document.cookie.split(';')
  for (const part of parts) {
    const [rawName, rawValue] = part.trim().split('=')
    if (rawName === cookieName && rawValue && isLocale(rawValue)) return rawValue
  }
  return 'zh'
}

export function writeLocale(locale: Locale) {
  switch (locale) {
    case 'en':
    case 'zh':
      document.cookie = `${cookieName}=${locale}; Path=/; Max-Age=31536000; SameSite=Lax`
      return
    default: {
      const unexpected: never = locale
      throw new Error(unexpected)
    }
  }
}

export function htmlLang(locale: Locale): string {
  switch (locale) {
    case 'en':
      return 'en'
    case 'zh':
      return 'zh-Hans'
    default: {
      const unexpected: never = locale
      return unexpected
    }
  }
}

export function fill(template: string, vars?: Record<string, string | number>) {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? `{${key}}`))
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

type LocaleContextValue = {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Translate
}

const LocaleContext = createContext<LocaleContextValue | null>(null)

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readLocale)

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale)
  }, [locale])

  const value = useMemo<LocaleContextValue>(() => {
    return {
      locale,
      setLocale: (next) => {
        writeLocale(next)
        setLocaleState(next)
      },
      t: (key, vars) => fill(messages[locale][key], vars),
    }
  }, [locale])

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
}

export function useI18n() {
  const value = useContext(LocaleContext)
  if (!value) throw new Error('useI18n must be used inside LocaleProvider')
  return value
}
