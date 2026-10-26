import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Product = { id: number; name: string; sku: string; kind: string; leadDays: number; purchasable: boolean }

export function MfgLeadPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [q, setQ] = useState('')
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const rows = useQuery({ queryKey: ['mfg-leads'], queryFn: () => api<Product[]>('/api/manufacturing/lead-times') })

  const save = useMutation({
    mutationFn: (row: Product) => api<Product>(`/api/products/${row.id}/lead`, {
      method: 'PUT',
      body: JSON.stringify({ leadDays: Number(drafts[row.id] ?? row.leadDays) }),
    }),
    onSuccess: async () => {
      setError('')
      setNotice(t('mfg.saved'))
      await queryClient.invalidateQueries({ queryKey: ['mfg-leads'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('mo.stepFailed')),
  })

  const needle = q.trim().toLowerCase()
  const shown = (rows.data ?? []).filter((row) => !needle || `${row.name} ${row.sku}`.toLowerCase().includes(needle))

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('mfg.leadTimes')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('mfg.leadLead')}</p>
        </div>
        <Link to="/manufacturing/plan"><Button variant="outline">{t('floor.plan')}</Button></Link>
      </div>
      {error ? <Notice message={error} /> : null}
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      <Input className="w-full sm:w-64" value={q} placeholder={t('desk.search')} aria-label={t('desk.search')} onChange={(event) => setQ(event.target.value)} />
      {rows.isLoading ? <p className="text-sm text-muted-foreground">{t('manufacturing.loading')}</p> : null}
      {rows.isError ? <p className="text-sm text-destructive">{rows.error.message}</p> : null}
      {rows.data && shown.length === 0 ? <EmptyState title={t('desk.emptyTitle')} body={t('desk.emptyBody')} /> : null}
      {shown.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('mfg.product')}</th>
                <th className="px-4 py-3 font-medium">{t('mfg.leadDays')}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <span className="font-medium">{row.name}</span>
                    <span className="block text-muted-foreground">{row.sku}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Input
                      className="w-24"
                      type="number"
                      min="0"
                      max="365"
                      aria-label={`${row.name} ${t('mfg.leadDays')}`}
                      value={drafts[row.id] ?? String(row.leadDays)}
                      onChange={(event) => setDrafts({ ...drafts, [row.id]: event.target.value })}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" disabled={save.isPending} onClick={() => save.mutate(row)}>{t('mfg.saveLead')}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
