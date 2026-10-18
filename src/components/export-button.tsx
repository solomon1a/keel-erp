import { Button } from './ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'

export function ExportButton({ kind }: { kind: string }) {
  const { t } = useI18n()
  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => { window.location.href = `/api/export/${kind}?format=csv` }}>{t('phase.exportCsv')}</Button>
      <Button type="button" variant="outline" size="sm" onClick={() => { window.location.href = `/api/export/${kind}?format=xlsx` }}>{t('phase.exportXlsx')}</Button>
    </div>
  )
}
