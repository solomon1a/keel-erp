import { useI18n } from '../i18n/locale.tsx'
import { Button } from './ui/button.tsx'

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n()
  return (
    <div className="flex gap-1" role="group" aria-label={t('lang.label')}>
      <Button size="sm" variant={locale === 'zh' ? 'default' : 'outline'} onClick={() => setLocale('zh')}>
        {t('lang.zh')}
      </Button>
      <Button size="sm" variant={locale === 'en' ? 'default' : 'outline'} onClick={() => setLocale('en')}>
        {t('lang.en')}
      </Button>
    </div>
  )
}
