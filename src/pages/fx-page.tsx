import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { formatMoney, useMoney } from '../lib/format.ts'
import { useState } from 'react'

type FxRow = {
  id: number
  name: string
  partner: string
  currency: string
  residual: number
  rate: number
  currentRate: number
  booked: number
  currentBase: number
  unrealised: number
}

type FxReport = {
  base: string
  unrealised: number
  posted?: boolean
  entry: string | null
  rows: FxRow[]
}

export function FxPage() {
  const { t, locale } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [posted, setPosted] = useState('')
  const report = useQuery({
    queryKey: ['fx-position'],
    queryFn: () => api<FxReport>('/api/reports/fx'),
  })
  const revalue = useMutation({
    mutationFn: () => api<FxReport>('/api/fx/revalue', { method: 'POST' }),
    onSuccess: (body) => {
      setError('')
      setPosted(body.entry ?? '')
      queryClient.setQueryData(['fx-position'], body)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('acct.failed')),
  })
  return (
    <div className="grid gap-4">
      <div>
        <Link className="text-sm font-semibold text-primary" to="/accounting">{t('acct.title')}</Link>
        <h1 className="font-serif text-4xl tracking-tight">{t('acct.fx')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('acct.fxLead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      {posted ? <p className="text-sm">{posted}</p> : null}
      {report.isLoading ? <p className="text-sm text-muted-foreground">{t('acct.loading')}</p> : null}
      {report.isError ? <p className="text-sm text-destructive">{report.error.message}</p> : null}
      {report.data && report.data.rows.length === 0 ? <EmptyState title={t('acct.fxEmpty')} body={t('acct.fxLead')} /> : null}
      {report.data && report.data.rows.length > 0 ? (
        <>
          <p className="text-sm">{t('acct.unrealised')} {money(report.data.unrealised)}</p>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t('acct.title')}</th>
                  <th className="px-4 py-2 font-medium">{t('acct.currency')}</th>
                  <th className="px-4 py-2 font-medium">{t('acct.booked')}</th>
                  <th className="px-4 py-2 font-medium">{t('acct.today')}</th>
                  <th className="px-4 py-2 font-medium">{t('acct.unrealised')}</th>
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Link className="font-semibold hover:underline" to={`/accounting/${row.id}`}>{row.name}</Link><div className="text-muted-foreground">{row.partner}</div></td>
                    <td className="px-4 py-3">{formatMoney(row.residual, row.currency, locale)} · {row.rate} → {row.currentRate}</td>
                    <td className="px-4 py-3">{money(row.booked)}</td>
                    <td className="px-4 py-3">{money(row.currentBase)}</td>
                    <td className="px-4 py-3">{money(row.unrealised)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Button disabled={revalue.isPending} onClick={() => revalue.mutate()}>{t('acct.revalue')}</Button>
        </>
      ) : null}
    </div>
  )
}
