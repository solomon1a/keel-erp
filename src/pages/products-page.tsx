import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { productKindLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { Product } from '../lib/types.ts'

export function ProductsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('products.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('products.lead')}</p>
        </div>
        <Link to="/products/new"><Button>{t('products.new')}</Button></Link>
      </div>
      {products.isLoading ? <p className="text-sm text-muted-foreground">{t('products.loading')}</p> : null}
      {products.isError ? <p className="text-sm text-destructive">{products.error.message}</p> : null}
      {products.data && products.data.length === 0 ? (
        <EmptyState title={t('products.emptyTitle')} body={t('products.emptyBody')} />
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('products.colProduct')}</th>
              <th className="px-4 py-3 font-medium">{t('products.colSku')}</th>
              <th className="px-4 py-3 font-medium">{t('products.colType')}</th>
              <th className="px-4 py-3 font-medium">{t('products.colKind')}</th>
              <th className="px-4 py-3 font-medium">{t('products.colPrice')}</th>
              <th className="px-4 py-3 font-medium">{t('products.colCost')}</th>
              <th className="px-4 py-3 font-medium">{t('products.colOnHand')}</th>
            </tr>
          </thead>
          <tbody>
            {products.data?.map((product) => (
              <tr key={product.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link className="font-semibold hover:underline" to={`/products/${product.id}`}>{product.name}</Link>
                  {product.active ? null : <span className="ml-2 text-muted-foreground">{t('common.archived')}</span>}
                </td>
                <td className="px-4 py-3">{product.sku}</td>
                <td className="px-4 py-3">
                  <Badge tone={product.type}>{product.type === 'product' ? t('products.goods') : t('products.service')}</Badge>
                </td>
                <td className="px-4 py-3">{product.type === 'product' ? productKindLabel(product.kind, t) : '—'}</td>
                <td className="px-4 py-3">{money(product.listPrice)}</td>
                <td className="px-4 py-3">{money(product.costPrice)}</td>
                <td className="px-4 py-3">{product.type === 'product' ? product.onHand : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
