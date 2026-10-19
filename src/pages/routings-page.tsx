import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PageHeader, TableFrame } from '../components/surface.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'

type Routing = {
  id: number
  sequence: number
  name: string
  hours: number
  lossPercent: number
  cost: number
  workstation: { id: number; name: string; hourRate: number; efficiency: number }
  bom: { id: number; version: number; product: { id: number; name: string; sku: string } }
}

export function RoutingsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const rows = useQuery({ queryKey: ['routings'], queryFn: () => api<Routing[]>('/api/manufacturing/routings') })

  if (rows.isLoading) return <p className="text-sm text-muted-foreground">{t('mfg.loading')}</p>
  if (rows.isError) return <p className="text-sm text-destructive">{rows.error.message}</p>
  const list = rows.data ?? []

  return (
    <div className="grid gap-6" data-screen="routings">
      <PageHeader title={t('mfg.routings')} lead={t('mfg.routingsLead')} />
      {list.length === 0 ? <p className="text-sm text-muted-foreground">{t('mfg.emptyRoutings')}</p> : null}
      <TableFrame>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-2 font-medium">{t('mfg.bom')}</th>
              <th className="px-3 py-2 font-medium">{t('mfg.sequence')}</th>
              <th className="px-3 py-2 font-medium">{t('mfg.operation')}</th>
              <th className="px-3 py-2 font-medium">{t('mfg.centers')}</th>
              <th className="px-3 py-2 font-medium">{t('mfg.hours')}</th>
              <th className="px-3 py-2 font-medium">{t('mfg.perHour')}</th>
              <th className="px-3 py-2 font-medium">{t('mfg.operationCost')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.id} className="border-b border-border">
                <td className="px-3 py-2">
                  <Link className="hover:underline" to={`/boms/${row.bom.id}`}>{row.bom.product.name}</Link>
                  <span className="text-muted-foreground"> · v{row.bom.version}</span>
                </td>
                <td className="px-3 py-2">{row.sequence}</td>
                <td className="px-3 py-2">{row.name}</td>
                <td className="px-3 py-2">{row.workstation.name}</td>
                <td className="px-3 py-2">{row.hours}{row.lossPercent > 0 ? ` · ${t('mfg.loss')} ${row.lossPercent}%` : ''}</td>
                <td className="px-3 py-2">{money(row.workstation.hourRate)}</td>
                <td className="px-3 py-2">{money(row.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
    </div>
  )
}
