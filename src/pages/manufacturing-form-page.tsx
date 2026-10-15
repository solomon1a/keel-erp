import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { defaultWarehouseId, WarehouseField } from '../components/warehouse-field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { BillOfMaterials, ManufacturingOrder, Warehouse } from '../lib/types.ts'

export function ManufacturingFormPage() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const isNew = !id
  const seeded = useRef(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [productId, setProductId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [sourceWarehouseId, setSourceWarehouseId] = useState('')
  const [destWarehouseId, setDestWarehouseId] = useState('')
  const [error, setError] = useState('')

  const boms = useQuery({ queryKey: ['boms'], queryFn: () => api<BillOfMaterials[]>('/api/boms') })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const order = useQuery({
    queryKey: ['manufacturing', id],
    queryFn: () => api<ManufacturingOrder>(`/api/manufacturing/${id}`),
    enabled: !isNew,
  })

  useEffect(() => {
    if (!order.data) return
    setProductId(String(order.data.productId))
    setQuantity(String(order.data.quantity))
    setSourceWarehouseId(order.data.sourceWarehouseId ? String(order.data.sourceWarehouseId) : '')
    setDestWarehouseId(order.data.destWarehouseId ? String(order.data.destWarehouseId) : '')
  }, [order.data])

  useEffect(() => {
    if (!isNew || seeded.current) return
    const product = params.get('product')
    if (!product) return
    seeded.current = true
    setProductId(product)
    const qty = params.get('qty')
    if (qty && Number(qty) > 0) setQuantity(qty)
  }, [isNew, params])

  useEffect(() => {
    if (!warehouses.data) return
    const fallback = defaultWarehouseId(warehouses.data)
    if (!sourceWarehouseId) setSourceWarehouseId(fallback)
    if (!destWarehouseId) setDestWarehouseId(fallback)
  }, [destWarehouseId, sourceWarehouseId, warehouses.data])

  const save = useMutation({
    mutationFn: () =>
      api<ManufacturingOrder>(isNew ? '/api/manufacturing' : `/api/manufacturing/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify({
          productId: Number(productId),
          quantity: Number(quantity),
          sourceWarehouseId: Number(sourceWarehouseId),
          destWarehouseId: Number(destWarehouseId),
        }),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['manufacturing'] })
      navigate(`/manufacturing/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.saveFailed')),
  })

  if (order.isLoading) return <p className="text-sm text-muted-foreground">{t('mo.loading')}</p>
  if (order.isError) return <p className="text-sm text-destructive">{order.error.message}</p>
  if (order.data && order.data.state !== 'draft') {
    return (
      <p className="text-sm">
        {t('mo.locked')} <Link className="underline" to={`/manufacturing/${id}`}>{t('mo.back')}</Link>
      </p>
    )
  }

  const bom = boms.data?.find((item) => item.productId === Number(productId))
  const made = Number(quantity) || 0

  return (
    <form
      className="grid max-w-3xl gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        save.mutate()
      }}
    >
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? t('mo.newTitle') : order.data?.name}</h1>
        <p className="mt-1 text-muted-foreground">{t('mo.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('mo.product')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={productId} onChange={(event) => setProductId(event.target.value)} required>
            <option value="">{t('mo.chooseProduct')}</option>
            {boms.data?.map((item) => (
              <option key={item.id} value={item.productId}>{item.product.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('mo.qty')}>
          <Input type="number" min="0" step="0.001" value={quantity} onChange={(event) => setQuantity(event.target.value)} required />
        </Field>
        <WarehouseField
          label={t('mo.sourceWarehouse')}
          value={sourceWarehouseId}
          onChange={setSourceWarehouseId}
          warehouses={warehouses.data}
          choose={t('stock.chooseWarehouse')}
        />
        <WarehouseField
          label={t('mo.destWarehouse')}
          value={destWarehouseId}
          onChange={setDestWarehouseId}
          warehouses={warehouses.data}
          choose={t('stock.chooseWarehouse')}
        />
      </div>
      {productId && !bom ? <p className="text-sm text-muted-foreground">{t('mo.noBom')}</p> : null}
      {bom ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('mo.preview')}</th>
                <th className="px-4 py-3 font-medium">{t('mo.colNeed')}</th>
              </tr>
            </thead>
            <tbody>
              {bom.lines.map((line, index) => (
                <tr key={line.id ?? index} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">{line.product?.name}</td>
                  <td className="px-4 py-3">{Math.round(((line.quantity * made) / bom.yieldQty) * 1000) / 1000}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('mo.save')}</Button>
        <Link to={isNew ? '/manufacturing' : `/manufacturing/${id}`}><Button type="button" variant="outline">{t('common.cancel')}</Button></Link>
      </div>
    </form>
  )
}
