import { Check } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { KeelMark } from '../brand/mark.tsx'
import { ThemeToggle } from '../brand/theme.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { cn } from '../lib/utils.ts'
import { LanguageSwitcher } from './language-switcher.tsx'

export function AuthFrame({ mode, children }: { mode: 'sign-in' | 'start'; children: ReactNode }) {
  const { t } = useI18n()
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <aside className="relative hidden flex-col justify-between bg-[linear-gradient(165deg,#1A8F7A_0%,#0E6B5C_42%,#0A3F36_100%)] px-12 py-10 text-white lg:flex">
        <div className="flex items-center gap-3">
          <KeelMark onDark className="size-11" />
          <span className="text-lg font-semibold tracking-tight">Keel</span>
        </div>
        <div className="max-w-md">
          <h2 className="text-[28px] font-bold leading-tight tracking-tight">{t('auth.pitch')}</h2>
          <ul className="mt-6 grid gap-3 text-sm text-white/85">
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[#5FD3B8]" />
              {t('auth.feature1')}
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[#5FD3B8]" />
              {t('auth.feature2')}
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-[#5FD3B8]" />
              {t('auth.feature3')}
            </li>
          </ul>
        </div>
        <p className="text-xs text-white/65">{t('auth.footer')}</p>
      </aside>
      <div className="flex min-h-screen flex-col overflow-y-auto bg-background px-4 py-6 sm:px-8">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 lg:hidden">
            <KeelMark className="size-8" />
            <span className="font-semibold tracking-tight">Keel</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <LanguageSwitcher />
          </div>
        </div>
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center pb-10">
          <div className="keel-glass rounded-[28px] p-6 sm:p-8">
          <div className="keel-segment mb-6 grid w-full grid-cols-2 text-sm font-semibold">
            <Link
              to="/sign-in"
              className={cn(
                'grid h-9 place-items-center rounded-full',
                mode === 'sign-in' ? 'bg-[var(--kl-color-primary-fill)] text-[var(--kl-color-primary-on)] shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t('auth.signIn')}
            </Link>
            <Link
              to="/start"
              className={cn(
                'grid h-9 place-items-center rounded-full',
                mode === 'start' ? 'bg-[var(--kl-color-primary-fill)] text-[var(--kl-color-primary-on)] shadow-sm' : 'text-muted-foreground',
              )}
            >
              {t('auth.create')}
            </Link>
          </div>
          {children}
          </div>
        </div>
      </div>
    </div>
  )
}
