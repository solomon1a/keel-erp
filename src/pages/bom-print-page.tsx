import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { BillOfMaterials, User } from '../lib/types.ts'

export function BomPrintPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const bom = useQuery({ queryKey: ['bom', id], queryFn: () => api<BillOfMaterials>(`/api/boms/${id}`) })
  if (bom.isLoading) return <p className="p-8 text-sm">{t('print.preparing')}</p>
  if (bom.isError) {
    return (
      <p className="p-8 text-sm">
        <span className="text-destructive">{bom.error.message}</span>{' '}
        <Link className="underline" to="/sign-in">{t('print.signIn')}</Link>
      </p>
    )
  }
  const row = bom.data
  if (!row) return null

  return (
    <article className="mx-auto max-w-3xl bg-white px-8 py-10 text-foreground print:px-0">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <p className="text-sm text-muted-foreground">{t('print.hint')}</p>
        <Button onClick={() => window.print()}>{t('print.print')}</Button>
      </div>
      <header className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <p className="font-serif text-3xl">{me.data?.company.name ?? 'Keel'}</p>
          <p className="text-sm text-muted-foreground">{me.data?.company.city}</p>
        </div>
        <div className="text-right">
          <p className="font-serif text-2xl">{row.product.name}</p>
          <p className="text-sm">{row.product.sku}</p>
          <p className="text-sm text-muted-foreground">{t('print.makes')} {row.yieldQty}</p>
        </div>
      </header>
      {row.notes ? <p className="mt-6 text-sm">{row.notes}</p> : null}
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">{t('print.components')}</th>
            <th className="py-2">{t('bom.colQty')}</th>
            <th className="py-2">{t('bom.perUnit')}</th>
            <th className="py-2">{t('bom.colLineCost')}</th>
          </tr>
        </thead>
        <tbody>
          {row.lines.map((line, index) => {
            const perUnit = row.yieldQty > 0 ? line.quantity / row.yieldQty : 0
            return (
              <tr key={line.id ?? index} className="border-b border-border">
                <td className="py-2">{line.product?.name}</td>
                <td className="py-2">{line.quantity}</td>
                <td className="py-2">{Math.round(perUnit * 1000) / 1000}</td>
                <td className="py-2">{money((line.product?.costPrice ?? 0) * perUnit)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="mt-4 text-right font-semibold">{t('bom.cost')} {money(row.unitCost)}</p>
    </article>
  )
}
