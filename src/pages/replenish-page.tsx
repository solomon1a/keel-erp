import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { Product, Warehouse } from '../lib/types.ts'

type Rule = {
  id: number
  minQty: number
  maxQty: number
  onHand: number
  short: boolean
  suggestQty: number
  product: { id: number; name: string; sku: string; purchasable: boolean; hasBom: boolean }
  warehouse: { id: number; name: string; code: string }
}

export function ReplenishPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const rules = useQuery({ queryKey: ['replenish'], queryFn: () => api<Rule[]>('/api/stock/replenish') })
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const [productId, setProductId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [minQty, setMinQty] = useState('1')
  const [maxQty, setMaxQty] = useState('1')
  const [error, setError] = useState('')

  const goods = products.data?.filter((product) => product.active && product.type === 'product') ?? []

  const save = useMutation({
    mutationFn: () =>
      api('/api/stock/replenish', {
        method: 'POST',
        body: JSON.stringify({
          productId: Number(productId),
          warehouseId: Number(warehouseId),
          minQty: Number(minQty),
          maxQty: Number(maxQty),
        }),
      }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['replenish'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('repl.failed')),
  })

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('repl.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('repl.lead')}</p>
      </div>
      {rules.isLoading ? <p className="text-sm text-muted-foreground">{t('repl.loading')}</p> : null}
      {rules.isError ? <p className="text-sm text-destructive">{rules.error.message}</p> : null}
      {rules.data && rules.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('repl.empty')}</p> : null}
      {rules.data && rules.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('repl.product')}</th>
                <th className="px-4 py-3 font-medium">{t('repl.warehouse')}</th>
                <th className="px-4 py-3 font-medium">{t('repl.onHand')}</th>
                <th className="px-4 py-3 font-medium">{t('repl.min')}</th>
                <th className="px-4 py-3 font-medium">{t('repl.max')}</th>
                <th className="px-4 py-3 font-medium">{t('repl.suggest')}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {rules.data.map((rule) => (
                <tr key={rule.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/products/${rule.product.id}`}>{rule.product.name}</Link>
                    <span className="block text-muted-foreground">{rule.product.sku}</span>
                  </td>
                  <td className="px-4 py-3">{rule.warehouse.name}</td>
                  <td className="px-4 py-3">{rule.onHand}</td>
                  <td className="px-4 py-3">{rule.minQty}</td>
                  <td className="px-4 py-3">{rule.maxQty}</td>
                  <td className="px-4 py-3">
                    {rule.short ? <Badge tone="cancel">{String(rule.suggestQty)}</Badge> : <span className="text-muted-foreground">{t('repl.ok')}</span>}
                  </td>
                  <td className="px-4 py-3">
                    {rule.short ? (
                      <span className="flex flex-wrap gap-2">
                        {rule.product.hasBom ? (
                          <Link to={`/manufacturing/new?product=${rule.product.id}&qty=${rule.suggestQty}`}>
                            <Button size="sm" variant="outline">{t('repl.make')}</Button>
                          </Link>
                        ) : null}
                        {rule.product.purchasable ? (
                          <Link to={`/purchases/new?need=${rule.product.id}:${rule.suggestQty}`}>
                            <Button size="sm" variant="outline">{t('repl.buy')}</Button>
                          </Link>
                        ) : null}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form
        className="grid max-w-xl gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          save.mutate()
        }}
      >
        <h2 className="font-serif text-2xl">{t('repl.rule')}</h2>
        {error ? <Notice message={error} /> : null}
        <Field label={t('repl.product')}>
          <select className="h-10 rounded-md border border-border bg-background px-3" value={productId} onChange={(event) => setProductId(event.target.value)} required>
            <option value="">{t('stock.choose')}</option>
            {goods.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('repl.warehouse')}>
          <select className="h-10 rounded-md border border-border bg-background px-3" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required>
            <option value="">{t('stock.chooseWarehouse')}</option>
            {warehouses.data?.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('repl.min')}>
            <Input type="number" min="0" step="0.001" value={minQty} onChange={(event) => setMinQty(event.target.value)} required />
          </Field>
          <Field label={t('repl.max')}>
            <Input type="number" min="0" step="0.001" value={maxQty} onChange={(event) => setMaxQty(event.target.value)} required />
          </Field>
        </div>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('repl.save')}</Button>
      </form>
    </div>
  )
}
