import { useI18n } from '../i18n/locale.tsx'
import { cn } from '../lib/utils.ts'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div className="keel-segment inline-flex h-8 text-xs font-semibold" role="group" aria-label={t('lang.label')}>
      <button
        type="button"
        className={cn(
          'h-6 rounded-full px-2.5',
          locale === 'en' ? 'bg-[var(--kl-color-primary-fill)] text-[var(--kl-color-primary-on)] shadow-xs' : 'text-muted-foreground',
        )}
        onClick={() => setLocale('en')}
      >
        {t('lang.en')}
      </button>
      <button
        type="button"
        className={cn(
          'h-6 rounded-full px-2.5',
          locale === 'zh' ? 'bg-[var(--kl-color-primary-fill)] text-[var(--kl-color-primary-on)] shadow-xs' : 'text-muted-foreground',
        )}
        onClick={() => setLocale('zh')}
      >
        {t('lang.zh')}
      </button>
    </div>
  )
}
