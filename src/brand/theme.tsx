import { Moon, Sun } from 'lucide-react'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n/locale.tsx'

const storageKey = 'keel_theme'
export type Theme = 'light' | 'dark'

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(storageKey)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    return 'light'
  }
  return 'light'
}

function applyTheme(theme: Theme) {
  if (theme === 'dark') document.documentElement.dataset.theme = 'dark'
  else delete document.documentElement.dataset.theme
}

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)

  useEffect(() => {
    applyTheme(theme)
    try {
      localStorage.setItem(storageKey, theme)
    } catch {
      return
    }
  }, [theme])

  const value = useMemo<ThemeContextValue>(() => ({ theme, setTheme: setThemeState }), [theme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function ThemeToggle() {
  const { t } = useI18n()
  const value = useContext(ThemeContext)
  if (!value) return null
  const next: Theme = value.theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      aria-label={t('theme.toggle')}
      title={value.theme === 'dark' ? t('theme.light') : t('theme.dark')}
      onClick={() => value.setTheme(next)}
    >
      {value.theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  )
}
