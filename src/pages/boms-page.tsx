import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { BillOfMaterials } from '../lib/types.ts'

export function BomsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const boms = useQuery({ queryKey: ['boms'], queryFn: () => api<BillOfMaterials[]>('/api/boms') })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('boms.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('boms.lead')}</p>
        </div>
        <div className="flex gap-2">
          <Link to="/manufacturing"><Button variant="outline">{t('boms.orders')}</Button></Link>
          <Link to="/boms/new"><Button>{t('boms.new')}</Button></Link>
        </div>
      </div>
      {boms.isLoading ? <p className="text-sm text-muted-foreground">{t('boms.loading')}</p> : null}
      {boms.isError ? <p className="text-sm text-destructive">{boms.error.message}</p> : null}
      {boms.data && boms.data.length === 0 ? <EmptyState title={t('boms.emptyTitle')} body={t('boms.emptyBody')} /> : null}
      {boms.data && boms.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('boms.colProduct')}</th>
                <th className="px-4 py-3 font-medium">{t('boms.colYield')}</th>
                <th className="px-4 py-3 font-medium">{t('boms.colComponents')}</th>
                <th className="px-4 py-3 font-medium">{t('boms.colCost')}</th>
              </tr>
            </thead>
            <tbody>
              {boms.data.map((bom) => (
                <tr key={bom.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/boms/${bom.id}`}>{bom.product.name}</Link>
                    <span className="block text-muted-foreground">{bom.product.sku}</span>
                  </td>
                  <td className="px-4 py-3">{bom.yieldQty}</td>
                  <td className="px-4 py-3">{bom.lines.length}</td>
                  <td className="px-4 py-3">{money(bom.unitCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
