import { useI18n } from '../i18n/locale.tsx'
import { useBaseCurrency, useDisplay } from '../lib/format.ts'

export function BaseMoneyLabel({ text }: { text: string }) {
  const code = useBaseCurrency()
  return (
    <>
      {text} ({code})
    </>
  )
}

export function BaseCurrencyNote() {
  const { t } = useI18n()
  const { base, converted } = useDisplay()
  if (!converted) return null
  return <p className="text-xs text-muted-foreground">{t('fx.inputs', { currency: base })}</p>
}
