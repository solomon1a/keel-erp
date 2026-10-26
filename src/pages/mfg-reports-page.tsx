import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import type { ReactNode } from 'react'
import { EmptyState } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'

type Report = {
  production: Array<{ month: string; quantity: number; orders: number }>
  wip: { orders: Array<{ id: number; name: string; product: string; remaining: number; value: number }>; value: number }
  variance: Array<{ id: number; name: string; product: string; quantityDone: number; standard: number; actual: number; variance: number }>
  utilisation: Array<{ id: number; name: string; scheduledMinutes: number; loggedMinutes: number; downtimeMinutes: number; utilisation: number }>
  scrap: { cost: number; expense: number; scrap: number; expected: number; actual: number; variancePct: number; byReason: Array<{ reason: string; quantity: number; cost: number }> }
}

function Fold({ title, aside, count, children }: { title: string; aside?: ReactNode; count: number; children: ReactNode }) {
  const { t } = useI18n()
  if (count === 0) {
    return (
      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl">{title}</h2>
          {aside}
        </div>
        {children}
      </section>
    )
  }
  return (
    <details className="keel-fold grid gap-3">
      <summary className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-serif text-2xl">{title}</h2>
        <span className="flex items-center gap-3 text-sm text-muted-foreground">
          {aside}
          <span className="keel-when-closed underline">{t('mfg.showList')}</span>
          <span className="keel-when-open underline">{t('mfg.hideList')}</span>
        </span>
      </summary>
      <div className="keel-fold-body">{children}</div>
    </details>
  )
}

export function MfgReportsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const report = useQuery({ queryKey: ['mfg-reports'], queryFn: () => api<Report>('/api/manufacturing/reports') })

  if (report.isLoading) return <p className="text-sm text-muted-foreground">{t('manufacturing.loading')}</p>
  if (report.isError) return <p className="text-sm text-destructive">{report.error.message}</p>
  const data = report.data
  if (!data) return null
  const empty = data.production.length === 0 && data.wip.orders.length === 0 && data.variance.length === 0 && data.utilisation.length === 0 && data.scrap.byReason.length === 0

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('mfg.reports')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('mfg.reportsLead')}</p>
        </div>
        <Link to="/manufacturing/wastage"><Button variant="outline">{t('floor.wastage')}</Button></Link>
      </div>
      {empty ? <EmptyState title={t('mfg.reportsEmpty')} body={t('mfg.reportsLead')} /> : null}

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">{t('mfg.production')}</h2>
        {data.production.length === 0 ? <p className="text-sm text-muted-foreground">{t('mfg.reportsEmpty')}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('mfg.month')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.quantity')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.orders')}</th>
                </tr>
              </thead>
              <tbody>
                {data.production.map((row) => (
                  <tr key={row.month} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{row.month}</td>
                    <td className="px-4 py-3">{row.quantity}</td>
                    <td className="px-4 py-3">{row.orders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Fold title={t('mfg.wip')} count={data.wip.orders.length} aside={<span>{t('mfg.value')} {money(data.wip.value)}</span>}>
        {data.wip.orders.length === 0 ? <p className="text-sm text-muted-foreground">{t('mfg.reportsEmpty')}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('mfg.name')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.product')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.remaining')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.value')}</th>
                </tr>
              </thead>
              <tbody>
                {data.wip.orders.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3"><Link className="font-medium hover:underline" to={`/manufacturing/${row.id}`}>{row.name}</Link></td>
                    <td className="px-4 py-3">{row.product}</td>
                    <td className="px-4 py-3">{row.remaining}</td>
                    <td className="px-4 py-3">{money(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Fold>

      <Fold title={t('mfg.costVariance')} count={data.variance.length}>
        {data.variance.length === 0 ? <p className="text-sm text-muted-foreground">{t('mfg.reportsEmpty')}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('mfg.name')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.product')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.quantity')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.standard')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.actualCost')}</th>
                  <th className="px-4 py-3 font-medium">{t('floor.variance')}</th>
                </tr>
              </thead>
              <tbody>
                {data.variance.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{row.name}</td>
                    <td className="px-4 py-3">{row.product}</td>
                    <td className="px-4 py-3">{row.quantityDone}</td>
                    <td className="px-4 py-3">{money(row.standard)}</td>
                    <td className="px-4 py-3">{money(row.actual)}</td>
                    <td className="px-4 py-3">{money(row.variance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Fold>

      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">{t('mfg.utilisation')}</h2>
        {data.utilisation.length === 0 ? <p className="text-sm text-muted-foreground">{t('mfg.reportsEmpty')}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('mfg.center')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.scheduled')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.logged')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.downtimeMinutes')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.utilPct')}</th>
                </tr>
              </thead>
              <tbody>
                {data.utilisation.map((row) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium">{row.name}</td>
                    <td className="px-4 py-3">{row.scheduledMinutes}</td>
                    <td className="px-4 py-3">{row.loggedMinutes}</td>
                    <td className="px-4 py-3">{row.downtimeMinutes}</td>
                    <td className="px-4 py-3">{row.utilisation}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-2xl">{t('mfg.scrapReport')}</h2>
          <p className="text-muted-foreground">{money(data.scrap.cost)} · {data.scrap.variancePct}%</p>
        </div>
        {data.scrap.byReason.length === 0 ? <p className="text-sm text-muted-foreground">{t('mfg.reportsEmpty')}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead className="border-b border-border text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">{t('mfg.reason')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.quantity')}</th>
                  <th className="px-4 py-3 font-medium">{t('mfg.value')}</th>
                </tr>
              </thead>
              <tbody>
                {data.scrap.byReason.map((row) => (
                  <tr key={row.reason} className="border-b border-border last:border-0">
                    <td className="px-4 py-3">{row.reason}</td>
                    <td className="px-4 py-3">{row.quantity}</td>
                    <td className="px-4 py-3">{money(row.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
