import { useI18n } from '../i18n/locale.tsx'
import { cn } from '../lib/utils.ts'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div className="flex h-8 items-center rounded-md bg-[var(--kl-color-neutral-100)] p-0.5 text-xs font-semibold" role="group" aria-label={t('lang.label')}>
      <button
        type="button"
        className={cn(
          'h-7 rounded px-2',
          locale === 'en' ? 'bg-[var(--kl-color-neutral-900)] text-[var(--kl-color-neutral-0)]' : 'text-muted-foreground',
        )}
        onClick={() => setLocale('en')}
      >
        {t('lang.en')}
      </button>
      <button
        type="button"
        className={cn(
          'h-7 rounded px-2',
          locale === 'zh' ? 'bg-[var(--kl-color-neutral-900)] text-[var(--kl-color-neutral-0)]' : 'text-muted-foreground',
        )}
        onClick={() => setLocale('zh')}
      >
        {t('lang.zh')}
      </button>
    </div>
  )
}
