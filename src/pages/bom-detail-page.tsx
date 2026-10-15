import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { BillOfMaterials } from '../lib/types.ts'

export function BomDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const money = useMoney()
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const bom = useQuery({ queryKey: ['bom', id], queryFn: () => api<BillOfMaterials>(`/api/boms/${id}`) })

  const applyCost = useMutation({
    mutationFn: () => api<BillOfMaterials>(`/api/boms/${id}/cost`, { method: 'POST' }),
    onSuccess: async () => {
      setError('')
      setNotice(t('bom.costApplied'))
      await queryClient.invalidateQueries({ queryKey: ['bom', id] })
      await queryClient.invalidateQueries({ queryKey: ['boms'] })
      await queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('bom.costFailed')),
  })

  const remove = useMutation({
    mutationFn: () => api(`/api/boms/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['boms'] })
      navigate('/boms')
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('bom.costFailed')),
  })

  if (bom.isLoading) return <p className="text-sm text-muted-foreground">{t('bom.loading')}</p>
  if (bom.isError) return <p className="text-sm text-destructive">{bom.error.message}</p>
  const row = bom.data
  if (!row) return null

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{row.product.name}</h1>
          <p className="mt-1 text-muted-foreground">{row.product.sku} · {t('print.yield')} {row.yieldQty}</p>
        </div>
        <p className="text-right">
          <span className="block text-sm text-muted-foreground">{t('bom.cost')}</span>
          <span className="font-serif text-3xl">{money(row.unitCost)}</span>
        </p>
      </div>
      {row.notes ? <p className="text-sm">{row.notes}</p> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? <Notice message={error} /> : null}
      <p className="text-sm text-muted-foreground">{t('bom.costHint')}</p>
      <div className="flex flex-wrap gap-2">
        <Link to={`/boms/${row.id}/edit`}><Button variant="outline">{t('bom.edit')}</Button></Link>
        <Button disabled={applyCost.isPending} onClick={() => applyCost.mutate()}>{t('bom.applyCost')}</Button>
        <Link to={`/boms/${row.id}/print`} target="_blank"><Button variant="outline">{t('bom.print')}</Button></Link>
        <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>{t('bom.delete')}</Button>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('bom.colComponent')}</th>
              <th className="px-4 py-3 font-medium">{t('bom.colQty')}</th>
              <th className="px-4 py-3 font-medium">{t('bom.colPerUnit')}</th>
              <th className="px-4 py-3 font-medium">{t('bom.colLineCost')}</th>
            </tr>
          </thead>
          <tbody>
            {row.lines.map((line, index) => {
              const perUnit = row.yieldQty > 0 ? line.quantity / row.yieldQty : 0
              const lineCost = (line.product?.costPrice ?? 0) * perUnit
              return (
                <tr key={line.id ?? index} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{line.product?.name}</span>
                    <span className="block text-muted-foreground">{line.product?.sku}</span>
                  </td>
                  <td className="px-4 py-3">{line.quantity}</td>
                  <td className="px-4 py-3">{Math.round(perUnit * 1000) / 1000}</td>
                  <td className="px-4 py-3">{money(lineCost)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
