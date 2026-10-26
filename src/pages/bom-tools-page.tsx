import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { BillOfMaterials } from '../lib/types.ts'

type Compare = {
  left: { id: number; version: number; name: string; sku: string; unitCost: number }
  right: { id: number; version: number; name: string; sku: string; unitCost: number }
  lines: Array<{ productId: number; name: string; sku: string; leftQty: number; rightQty: number }>
}

type Flat = { productId: number; name: string; sku: string; quantity: number; level: number; bomId: number | null }

export function BomToolsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [leftId, setLeftId] = useState('')
  const [rightId, setRightId] = useState('')
  const [explodeId, setExplodeId] = useState('')
  const [compared, setCompared] = useState<Compare | null>(null)
  const [flat, setFlat] = useState<Flat[] | null>(null)
  const boms = useQuery({ queryKey: ['boms'], queryFn: () => api<BillOfMaterials[]>('/api/boms') })

  const compare = useMutation({
    mutationFn: () => api<Compare>('/api/boms/compare', {
      method: 'POST',
      body: JSON.stringify({ leftId: Number(leftId), rightId: Number(rightId) }),
    }),
    onSuccess: (body) => {
      setError('')
      setCompared(body)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('bom.costFailed')),
  })

  const explode = useMutation({
    mutationFn: () => api<{ flat: Flat[]; levels: number }>(`/api/boms/${explodeId}/explode`),
    onSuccess: (body) => {
      setError('')
      setFlat(body.flat)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('bom.costFailed')),
  })

  const applyCost = useMutation({
    mutationFn: (id: number) => api(`/api/boms/${id}/cost`, { method: 'POST' }),
    onSuccess: async () => {
      setError('')
      setNotice(t('bom.costApplied'))
      await queryClient.invalidateQueries({ queryKey: ['boms'] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('bom.costFailed')),
  })

  const options = boms.data ?? []

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('mfg.bomTools')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('mfg.bomToolsLead')}</p>
        </div>
        <Link to="/boms"><Button variant="outline">{t('mfg.bom')}</Button></Link>
      </div>
      {error ? <Notice message={error} /> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {boms.isLoading ? <p className="text-sm text-muted-foreground">{t('boms.loading')}</p> : null}
      {boms.isError ? <p className="text-sm text-destructive">{boms.error.message}</p> : null}
      {boms.data && boms.data.length === 0 ? <EmptyState title={t('boms.emptyTitle')} body={t('boms.emptyBody')} /> : null}

      {options.length > 0 ? (
        <>
          <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
            <h2 className="font-serif text-2xl">{t('mfg.compare')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('mfg.left')}>
                <select className="h-10 w-full rounded-md border border-border bg-card px-3" value={leftId} aria-label={t('mfg.left')} onChange={(event) => setLeftId(event.target.value)}>
                  <option value="">{t('mfg.left')}</option>
                  {options.map((row) => <option key={row.id} value={row.id}>{row.product.name} v{row.version ?? 1}</option>)}
                </select>
              </Field>
              <Field label={t('mfg.right')}>
                <select className="h-10 w-full rounded-md border border-border bg-card px-3" value={rightId} aria-label={t('mfg.right')} onChange={(event) => setRightId(event.target.value)}>
                  <option value="">{t('mfg.right')}</option>
                  {options.map((row) => <option key={row.id} value={row.id}>{row.product.name} v{row.version ?? 1}</option>)}
                </select>
              </Field>
            </div>
            <div><Button disabled={!leftId || !rightId || compare.isPending} onClick={() => compare.mutate()}>{t('mfg.compare')}</Button></div>
            {compared ? (
              <div className="overflow-x-auto">
                <p className="mb-2 text-sm text-muted-foreground">
                  {compared.left.name} v{compared.left.version} {money(compared.left.unitCost)} · {compared.right.name} v{compared.right.version} {money(compared.right.unitCost)}
                </p>
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('mfg.product')}</th>
                      <th className="px-3 py-2 font-medium">{t('mfg.left')}</th>
                      <th className="px-3 py-2 font-medium">{t('mfg.right')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compared.lines.map((line) => (
                      <tr key={line.productId} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{line.name}<span className="block text-muted-foreground">{line.sku}</span></td>
                        <td className="px-3 py-2">{line.leftQty || '—'}</td>
                        <td className="px-3 py-2">{line.rightQty || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="grid gap-3 rounded-lg border border-border bg-card p-4">
            <h2 className="font-serif text-2xl">{t('mfg.explode')}</h2>
            <Field label={t('mfg.bom')}>
              <select className="h-10 w-full rounded-md border border-border bg-card px-3" value={explodeId} aria-label={t('mfg.bom')} onChange={(event) => setExplodeId(event.target.value)}>
                <option value="">{t('mfg.bom')}</option>
                {options.map((row) => <option key={row.id} value={row.id}>{row.product.name} v{row.version ?? 1}</option>)}
              </select>
            </Field>
            <div><Button disabled={!explodeId || explode.isPending} onClick={() => explode.mutate()}>{t('mfg.explode')}</Button></div>
            {flat ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t('mfg.level')}</th>
                      <th className="px-3 py-2 font-medium">{t('mfg.product')}</th>
                      <th className="px-3 py-2 font-medium">{t('mfg.quantity')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flat.map((row, index) => (
                      <tr key={`${row.productId}-${index}`} className="border-b border-border last:border-0">
                        <td className="px-3 py-2">{row.level}</td>
                        <td className="px-3 py-2" style={{ paddingLeft: `${12 + row.level * 16}px` }}>{row.name}<span className="block text-muted-foreground">{row.sku}</span></td>
                        <td className="px-3 py-2">{row.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="grid gap-3">
            <h2 className="font-serif text-2xl">{t('bom.applyCost')}</h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('mfg.product')}</th>
                    <th className="px-4 py-3 font-medium">{t('boms.colCost')}</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {options.filter((row) => row.active !== false).map((row) => (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3">
                        <Link className="font-medium hover:underline" to={`/boms/${row.id}`}>{row.product.name}</Link>
                        <span className="block text-muted-foreground">{row.product.sku}</span>
                      </td>
                      <td className="px-4 py-3">{money(row.unitCost)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="outline" disabled={applyCost.isPending} onClick={() => applyCost.mutate(row.id)}>{t('bom.applyCost')}</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </div>
  )
}
