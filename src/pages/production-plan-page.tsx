import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type PlanLine = {
  id: number
  productId: number
  demandQty: number
  onHand: number
  toMake: number
  toBuy: number
  workOrderId: number | null
  materialRequestId: number | null
  product: { id: number; name: string; sku: string } | null
}

type Plan = { id: number; name: string; state: string; lines: PlanLine[] }

export function ProductionPlanPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [picked, setPicked] = useState<number | null>(null)
  const plans = useQuery({ queryKey: ['production-plans'], queryFn: () => api<Plan[]>('/api/manufacturing/plans') })

  const refresh = async (id?: number) => {
    setError('')
    if (id) setPicked(id)
    await queryClient.invalidateQueries({ queryKey: ['production-plans'] })
    await queryClient.invalidateQueries({ queryKey: ['manufacturing'] })
  }

  const build = useMutation({
    mutationFn: () => api<Plan>('/api/manufacturing/plans', { method: 'POST' }),
    onSuccess: (plan) => refresh(plan.id),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  const raise = useMutation({
    mutationFn: (id: number) => api<Plan>(`/api/manufacturing/plans/${id}/raise`, { method: 'POST' }),
    onSuccess: (plan) => refresh(plan.id),
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  const rows = plans.data ?? []
  const current = rows.find((plan) => plan.id === picked) ?? rows[0]

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('floor.plan')}</h1>
          <p className="mt-1 text-muted-foreground">{t('floor.buildPlan')}</p>
        </div>
        <Button disabled={build.isPending} onClick={() => build.mutate()}>{t('floor.buildPlan')}</Button>
      </div>
      {error ? <Notice message={error} /> : null}
      {plans.isLoading ? <p className="text-sm text-muted-foreground">{t('manufacturing.loading')}</p> : null}
      {plans.isError ? <p className="text-sm text-destructive">{plans.error.message}</p> : null}
      {plans.data && plans.data.length === 0 ? <EmptyState title={t('floor.noPlans')} body={t('floor.buildPlan')} /> : null}
      {rows.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {rows.map((plan) => (
            <Button key={plan.id} size="sm" variant={current?.id === plan.id ? 'secondary' : 'outline'} onClick={() => setPicked(plan.id)}>
              {plan.name}
            </Button>
          ))}
        </div>
      ) : null}
      {current ? (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="font-serif text-2xl">{current.name}</h2>
              <Badge tone={current.state}>{current.state}</Badge>
            </div>
            {current.state === 'draft' ? (
              <Button disabled={raise.isPending} onClick={() => raise.mutate(current.id)}>{t('floor.raise')}</Button>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('manufacturing.colProduct')}</th>
                  <th className="px-4 py-3 font-medium">{t('floor.demand')}</th>
                  <th className="px-4 py-3 font-medium">{t('mo.colOnHand')}</th>
                  <th className="px-4 py-3 font-medium">{t('floor.toMake')}</th>
                  <th className="px-4 py-3 font-medium">{t('floor.toBuy')}</th>
                  <th className="px-4 py-3 font-medium">{t('floor.connected')}</th>
                </tr>
              </thead>
              <tbody>
                {current.lines.map((line) => (
                  <tr key={line.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">
                      <span className="font-medium">{line.product?.name ?? line.productId}</span>
                      {line.product ? <span className="block text-muted-foreground">{line.product.sku}</span> : null}
                    </td>
                    <td className="px-4 py-3">{line.demandQty}</td>
                    <td className="px-4 py-3">{line.onHand}</td>
                    <td className="px-4 py-3">{line.toMake || '—'}</td>
                    <td className="px-4 py-3">{line.toBuy || '—'}</td>
                    <td className="px-4 py-3">
                      {line.workOrderId ? <Link className="hover:underline" to={`/manufacturing/${line.workOrderId}`}>{t('floor.makeOrder')}</Link> : null}
                      {line.materialRequestId ? <span className="text-muted-foreground"> MR{line.materialRequestId}</span> : null}
                      {!line.workOrderId && !line.materialRequestId ? '—' : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  )
}
