import { useQueryClient } from '@tanstack/react-query'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { displayCurrencies } from '../../shared/exchange.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { writeStoredDisplay } from '../lib/display-money.ts'
import { useDisplay } from '../lib/format.ts'
import type { User } from '../lib/types.ts'
import { cn } from '../lib/utils.ts'

export function CurrencySwitcher() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const display = useDisplay()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const me = queryClient.getQueryData<User>(['me'])
  const codes = [...new Set([display.base, ...displayCurrencies, ...display.rates.map((row) => row.currency)])]

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  async function choose(currency: string) {
    setOpen(false)
    if (!me) return
    writeStoredDisplay(me.id, currency)
    queryClient.setQueryData<User>(['me'], (current) => (current ? { ...current, displayCurrency: currency } : current))
    try {
      const next = await api<User>('/api/session/display-currency', {
        method: 'PATCH',
        body: JSON.stringify({ currency }),
      })
      queryClient.setQueryData<User>(['me'], (current) => (current ? { ...current, ...next, company: current.company } : next))
    } catch {
      // The choice stays in this browser until the next successful save.
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="keel-chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('fx.menu')}
        onClick={() => setOpen((value) => !value)}
      >
        {display.currency}
        <ChevronDown className="size-3.5" />
      </button>
      {open ? (
        <div className="keel-menu absolute right-0 z-[60] mt-2 min-w-28 rounded-3xl p-2" role="listbox" aria-label={t('fx.menu')}>
          {codes.map((code) => (
            <button
              key={code}
              type="button"
              role="option"
              aria-selected={code === display.currency}
              className={cn('keel-chip w-full justify-start', code === display.currency && 'keel-chip-active')}
              onClick={() => void choose(code)}
            >
              {code}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
