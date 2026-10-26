import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Product = { id: number; name: string; sku: string }
type Order = {
  id: number
  name: string
  quantity: number
  state: string
  note: string
  product: Product
}

export function MfgUnbuildPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')
  const [form, setForm] = useState({ name: '', productId: '', quantity: '', note: '' })
  const rows = useQuery({ queryKey: ['mfg-unbuild'], queryFn: () => api<Order[]>('/api/manufacturing/unbuild') })
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const choices = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return (products.data ?? []).filter((row) => !needle || `${row.name} ${row.sku}`.toLowerCase().includes(needle)).slice(0, 40)
  }, [products.data, filter])

  const create = useMutation({
    mutationFn: () => api<Order>('/api/manufacturing/unbuild', {
      method: 'POST',
      body: JSON.stringify({
        name: form.name,
        productId: Number(form.productId),
        quantity: Number(form.quantity),
        note: form.note,
      }),
    }),
    onSuccess: async () => {
      setError('')
      setForm({ name: '', productId: '', quantity: '', note: '' })
      await queryClient.invalidateQueries({ queryKey: ['mfg-unbuild'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  const done = useMutation({
    mutationFn: (id: number) => api(`/api/manufacturing/unbuild/${id}/done`, { method: 'POST' }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['mfg-unbuild'] })
      await queryClient.invalidateQueries({ queryKey: ['stock'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('mfg.unbuild')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('mfg.unbuildLead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      {rows.isLoading ? <p className="text-sm text-muted-foreground">{t('manufacturing.loading')}</p> : null}
      {rows.isError ? <p className="text-sm text-destructive">{rows.error.message}</p> : null}
      {rows.data && rows.data.length === 0 ? <EmptyState title={t('mfg.unbuildEmpty')} body={t('mfg.unbuildLead')} /> : null}
      {rows.data && rows.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('mfg.name')}</th>
                <th className="px-4 py-3 font-medium">{t('mfg.product')}</th>
                <th className="px-4 py-3 font-medium">{t('mfg.quantity')}</th>
                <th className="px-4 py-3 font-medium">{t('mfg.note')}</th>
                <th className="px-4 py-3 font-medium">{t('floor.kind')}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.data.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{row.name}</td>
                  <td className="px-4 py-3">{row.product.name}<span className="block text-muted-foreground">{row.product.sku}</span></td>
                  <td className="px-4 py-3">{row.quantity}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.note || '—'}</td>
                  <td className="px-4 py-3"><Badge tone={row.state}>{row.state === 'done' ? t('mfg.statusDone') : t('mfg.draft')}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    {row.state === 'draft' ? (
                      <Button size="sm" disabled={done.isPending} onClick={() => done.mutate(row.id)}>{t('mfg.unbuildDone')}</Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form
        className="grid gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault()
          create.mutate()
        }}
      >
        <h2 className="font-serif text-2xl">{t('mfg.unbuildNew')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('mfg.name')}>
            <Input value={form.name} aria-label={t('mfg.name')} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label={t('mfg.quantity')}>
            <Input type="number" min="0.001" step="0.001" value={form.quantity} aria-label={t('mfg.quantity')} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
          </Field>
          <Field label={t('mfg.note')}>
            <Input value={form.note} aria-label={t('mfg.note')} onChange={(event) => setForm({ ...form, note: event.target.value })} />
          </Field>
        </div>
        <Field label={t('mfg.product')}>
          <Input value={filter} placeholder={t('desk.search')} aria-label={t('desk.search')} onChange={(event) => setFilter(event.target.value)} />
          <select className="mt-2 h-10 w-full rounded-md border border-border bg-card px-3" value={form.productId} aria-label={t('mfg.product')} onChange={(event) => setForm({ ...form, productId: event.target.value })} required>
            <option value="">{t('mfg.product')}</option>
            {choices.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.sku}</option>)}
          </select>
        </Field>
        <div><Button type="submit" disabled={create.isPending}>{t('mfg.unbuildNew')}</Button></div>
      </form>
    </div>
  )
}
