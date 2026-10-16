import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Field } from '../components/field.tsx'
import { Select } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'

type Layer = {
  id: number
  quantity: number
  remaining: number
  unitCost: number
  value: number
  method: string
  product: { id: number; name: string; sku: string; costMethod: string; costPrice: number }
}

export function ValuationPage() {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const layers = useQuery({ queryKey: ['valuation'], queryFn: () => api<Layer[]>('/api/stock/valuation') })
  const save = useMutation({
    mutationFn: (input: { productId: number; method: string }) => api('/api/stock/cost-method', { method: 'PATCH', body: JSON.stringify(input) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['valuation'] })
    },
  })
  const products = new Map<number, Layer['product']>()
  for (const layer of layers.data ?? []) products.set(layer.product.id, layer.product)

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('stock.layers')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('stock.layersLead')}</p>
      </div>
      {[...products.values()].length > 0 ? (
        <div className="grid max-w-xl gap-3">
          {[...products.values()].map((product) => (
            <Field key={product.id} label={`${product.sku} · ${t('stock.method')}`}>
              <Select value={product.costMethod} onChange={(event) => save.mutate({ productId: product.id, method: event.target.value })}>
                <option value="avco">AVCO</option>
                <option value="fifo">FIFO</option>
              </Select>
            </Field>
          ))}
        </div>
      ) : null}
      {layers.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {layers.data && layers.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('desk.emptyTitle')}</p> : null}
      {layers.data && layers.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t('desk.name')}</th>
                <th className="px-4 py-2 font-medium">{t('stock.method')}</th>
                <th className="px-4 py-2 font-medium">{t('stock.qty')}</th>
                <th className="px-4 py-2 font-medium">{t('stock.left')}</th>
                <th className="px-4 py-2 font-medium">{t('stock.value')}</th>
              </tr>
            </thead>
            <tbody>
              {layers.data.map((layer) => (
                <tr key={layer.id} className="border-t border-border">
                  <td className="px-4 py-2">{layer.product.name}</td>
                  <td className="px-4 py-2">{layer.method}</td>
                  <td className="px-4 py-2">{layer.quantity}</td>
                  <td className="px-4 py-2">{layer.remaining}</td>
                  <td className="px-4 py-2">{money(layer.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
