import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Textarea } from '../components/ui/textarea.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { Product } from '../lib/types.ts'

export function ProductFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    sku: '',
    type: 'product',
    kind: 'finished',
    listPrice: '0',
    costPrice: '0',
    purchasable: false,
    description: '',
    active: true,
  })

  const product = useQuery({
    queryKey: ['product', id],
    queryFn: () => api<Product>(`/api/products/${id}`),
    enabled: !isNew,
  })

  useEffect(() => {
    if (!product.data) return
    setForm({
      name: product.data.name,
      sku: product.data.sku,
      type: product.data.type,
      kind: product.data.kind || 'finished',
      listPrice: String(product.data.listPrice),
      costPrice: String(product.data.costPrice ?? 0),
      purchasable: product.data.purchasable,
      description: product.data.description ?? '',
      active: product.data.active,
    })
  }, [product.data])

  const save = useMutation({
    mutationFn: () =>
      api<Product>(isNew ? '/api/products' : `/api/products/${id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify({
          name: form.name,
          sku: form.sku,
          type: form.type,
          kind: form.type === 'service' ? 'finished' : form.kind,
          listPrice: Number(form.listPrice),
          costPrice: Number(form.costPrice),
          purchasable: form.purchasable,
          description: form.description,
          active: form.active,
        }),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate(`/products/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('product.saveFailed')),
  })

  if (product.isLoading) return <p className="text-sm text-muted-foreground">{t('product.loading')}</p>
  if (product.isError) return <p className="text-sm text-destructive">{product.error.message}</p>

  return (
    <form
      className="mx-auto grid max-w-2xl gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        save.mutate()
      }}
    >
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? t('product.newTitle') : form.name}</h1>
        <p className="mt-1 text-muted-foreground">{t('product.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <Field label={t('common.name')}>
        <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('product.sku')}>
          <Input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required />
        </Field>
        <Field label={t('product.type')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="product">{t('products.goods')}</option>
            <option value="service">{t('products.service')}</option>
          </select>
        </Field>
        <Field label={t('product.price')}>
          <Input type="number" min="0" step="0.01" value={form.listPrice} onChange={(event) => setForm({ ...form, listPrice: event.target.value })} />
        </Field>
        <Field label={t('product.cost')}>
          <Input type="number" min="0" step="0.01" value={form.costPrice} onChange={(event) => setForm({ ...form, costPrice: event.target.value })} />
        </Field>
        {form.type === 'product' ? (
          <Field label={t('product.kind')}>
            <select className="h-10 rounded-md border border-border bg-card px-3" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
              <option value="finished">{t('kind.finished')}</option>
              <option value="raw">{t('kind.raw')}</option>
            </select>
          </Field>
        ) : null}
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          {t('product.active')}
        </label>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.purchasable} onChange={(event) => setForm({ ...form, purchasable: event.target.checked })} />
          {t('product.purchasable')}
        </label>
      </div>
      <p className="text-sm text-muted-foreground">{t('product.purchasableHint')}</p>
      <Field label={t('product.description')}>
        <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('product.save')}</Button>
        <Link to="/products"><Button variant="outline">{t('common.back')}</Button></Link>
      </div>
    </form>
  )
}
