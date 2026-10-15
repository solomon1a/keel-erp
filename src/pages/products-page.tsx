import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { api } from '../lib/api.ts'
import { money } from '../lib/format.ts'
import type { Product } from '../lib/types.ts'

export function ProductsPage() {
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">Products</h1>
          <p className="mt-1 text-muted-foreground">Goods sit on a shelf. Services are sold without a stock count.</p>
        </div>
        <Link to="/products/new"><Button>New product</Button></Link>
      </div>
      {products.isLoading ? <p className="text-sm text-muted-foreground">Loading the catalog…</p> : null}
      {products.isError ? <p className="text-sm text-destructive">{products.error.message}</p> : null}
      {products.data && products.data.length === 0 ? (
        <EmptyState title="The catalog is empty" body="Add a product or a service before you write a quotation." />
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Product</th>
              <th className="px-4 py-3 font-medium">SKU</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Price</th>
              <th className="px-4 py-3 font-medium">On hand</th>
            </tr>
          </thead>
          <tbody>
            {products.data?.map((product) => (
              <tr key={product.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link className="font-semibold hover:underline" to={`/products/${product.id}`}>{product.name}</Link>
                  {product.active ? null : <span className="ml-2 text-muted-foreground">Archived</span>}
                </td>
                <td className="px-4 py-3">{product.sku}</td>
                <td className="px-4 py-3"><Badge tone={product.type}>{product.type === 'product' ? 'Goods' : 'Service'}</Badge></td>
                <td className="px-4 py-3">{money(product.listPrice)}</td>
                <td className="px-4 py-3">{product.type === 'product' ? product.onHand : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
