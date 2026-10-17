import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Textarea } from '../components/ui/textarea.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { BillOfMaterials, Product } from '../lib/types.ts'

type DraftLine = { productId: string; quantity: string; lossPercent: string }

export function BomFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const money = useMoney()
  const [productId, setProductId] = useState('')
  const [yieldQty, setYieldQty] = useState('1')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([{ productId: '', quantity: '1', lossPercent: '0' }])
  const [error, setError] = useState('')

  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const bom = useQuery({
    queryKey: ['bom', id],
    queryFn: () => api<BillOfMaterials>(`/api/boms/${id}`),
    enabled: !isNew,
  })

  useEffect(() => {
    if (!bom.data) return
    setProductId(String(bom.data.productId))
    setYieldQty(String(bom.data.yieldQty))
    setNotes(bom.data.notes ?? '')
    setLines(bom.data.lines.map((line) => ({
      productId: String(line.productId),
      quantity: String(line.quantity),
      lossPercent: String(line.lossPercent ?? 0),
    })))
  }, [bom.data])

  const finished = products.data?.filter((product) => product.active && product.type === 'product' && product.kind === 'finished') ?? []
  const components = products.data?.filter((product) => product.active && product.type === 'product' && product.id !== Number(productId)) ?? []
  const made = Number(yieldQty) || 0

  const unitCost = useMemo(() => {
    if (made <= 0) return 0
    const batch = lines.reduce((sum, line) => {
      const product = components.find((item) => item.id === Number(line.productId))
      return sum + (Number(line.quantity) || 0) * (product?.costPrice ?? 0)
    }, 0)
    return Math.round((batch / made) * 100) / 100
  }, [components, lines, made])

  const save = useMutation({
    mutationFn: () =>
      api<BillOfMaterials>(isNew ? '/api/boms' : `/api/boms/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify({
          productId: Number(productId),
          yieldQty: Number(yieldQty),
          notes,
          lines: lines.map((line) => ({
            productId: Number(line.productId),
            quantity: Number(line.quantity),
            lossPercent: Number(line.lossPercent) || 0,
          })),
        }),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['boms'] })
      navigate(`/boms/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('bom.saveFailed')),
  })

  if (bom.isLoading) return <p className="text-sm text-muted-foreground">{t('bom.loading')}</p>
  if (bom.isError) return <p className="text-sm text-destructive">{bom.error.message}</p>

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        save.mutate()
      }}
    >
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? t('bom.newTitle') : bom.data?.product.name}</h1>
        <p className="mt-1 text-muted-foreground">{t('bom.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('bom.product')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={productId} onChange={(event) => setProductId(event.target.value)} required>
            <option value="">{t('bom.chooseProduct')}</option>
            {finished.map((product) => (
              <option key={product.id} value={product.id}>{product.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('bom.yield')}>
          <Input type="number" min="0" step="0.001" value={yieldQty} onChange={(event) => setYieldQty(event.target.value)} required />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">{t('bom.yieldHint')}</p>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">{t('bom.component')}</th>
              <th className="px-3 py-3 font-medium">{t('bom.qty')}</th>
              <th className="px-3 py-3 font-medium">{t('floor.loss')}</th>
              <th className="px-3 py-3 font-medium">{t('bom.perUnit')}</th>
              <th className="px-3 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const perUnit = made > 0 ? (Number(line.quantity) || 0) / made : 0
              return (
                <tr key={index} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-2"
                      value={line.productId}
                      onChange={(event) => updateLine(index, { productId: event.target.value })}
                    >
                      <option value="">{t('common.choose')}</option>
                      {components.map((product) => (
                        <option key={product.id} value={product.id}>{product.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" step="0.001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
                  </td>
                  <td className="px-3 py-2">
                    <Input type="number" min="0" step="0.01" value={line.lossPercent} onChange={(event) => updateLine(index, { lossPercent: event.target.value })} aria-label={t('floor.loss')} />
                  </td>
                  <td className="px-3 py-2">{Math.round(perUnit * 1000) / 1000}</td>
                  <td className="px-3 py-2">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>{t('common.remove')}</Button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Button type="button" variant="outline" onClick={() => setLines([...lines, { productId: '', quantity: '1', lossPercent: '0' }])}>{t('bom.addLine')}</Button>
        <p className="text-sm">
          <span className="text-muted-foreground">{t('bom.cost')}</span>{' '}
          <span className="font-semibold">{money(unitCost)}</span>
        </p>
      </div>
      <Field label={t('bom.notes')}>
        <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('bom.save')}</Button>
        <Link to={isNew ? '/boms' : `/boms/${id}`}><Button type="button" variant="outline">{t('common.cancel')}</Button></Link>
      </div>
    </form>
  )

  function updateLine(index: number, patch: Partial<DraftLine>) {
    const next = [...lines]
    const current = next[index]
    if (!current) return
    next[index] = { ...current, ...patch }
    setLines(next)
  }
}
