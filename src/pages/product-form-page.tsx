import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Textarea } from '../components/ui/textarea.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { Product } from '../lib/types.ts'

export function ProductFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    sku: '',
    type: 'product',
    listPrice: '0',
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
      listPrice: String(product.data.listPrice),
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
          listPrice: Number(form.listPrice),
          description: form.description,
          active: form.active,
        }),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['products'] })
      navigate(`/products/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'Could not save the product.'),
  })

  if (product.isLoading) return <p className="text-sm text-muted-foreground">Loading the product…</p>
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
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? 'New product' : form.name}</h1>
        <p className="mt-1 text-muted-foreground">The list price fills new quotation lines. You can still change the price on an order.</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <Field label="Name">
        <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="SKU">
          <Input value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} required />
        </Field>
        <Field label="Type">
          <select className="h-10 rounded-md border border-border bg-card px-3" value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value })}>
            <option value="product">Goods</option>
            <option value="service">Service</option>
          </select>
        </Field>
        <Field label="List price">
          <Input type="number" min="0" step="0.01" value={form.listPrice} onChange={(event) => setForm({ ...form, listPrice: event.target.value })} />
        </Field>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.active} onChange={(event) => setForm({ ...form, active: event.target.checked })} />
          Offered on new orders
        </label>
      </div>
      <Field label="Description">
        <Textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save product'}</Button>
        <Link to="/products"><Button variant="outline">Back</Button></Link>
      </div>
    </form>
  )
}
