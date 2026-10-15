import { useI18n } from '../i18n/locale.tsx'
import { useMoney } from '../lib/format.ts'

export function MoneyTotals({
  untaxed,
  tax,
  total,
  rate,
}: {
  untaxed: number
  tax: number
  total: number
  rate: number | null
}) {
  const { t } = useI18n()
  const money = useMoney()
  return (
    <dl className="grid gap-1 text-sm">
      <div className="flex justify-end gap-6">
        <dt className="text-muted-foreground">{t('totals.untaxed')}</dt>
        <dd className="min-w-28 text-right">{money(untaxed)}</dd>
      </div>
      <div className="flex justify-end gap-6">
        <dt className="text-muted-foreground">{rate === null ? t('totals.tax') : t('totals.taxRate', { rate })}</dt>
        <dd className="min-w-28 text-right">{money(tax)}</dd>
      </div>
      <div className="flex justify-end gap-6 text-base font-semibold">
        <dt>{t('totals.total')}</dt>
        <dd className="min-w-28 text-right">{money(total)}</dd>
      </div>
    </dl>
  )
}

export function FapiaoNote() {
  const { t } = useI18n()
  return <p className="text-sm text-muted-foreground">{t('fapiao.note')}</p>
}
