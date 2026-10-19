import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState, Field } from '../components/field.tsx'
import { PageHeader, Panel } from '../components/surface.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'

const groups = ['product', 'partner', 'user', 'month'] as const
type Group = (typeof groups)[number]
type Side = 'sales' | 'purchase'
type Row = { key: string; label: string; amount: number; documents: number }
type Report = { side: Side; group: Group; from: string; to: string; total: number; rows: Row[] }

function yearStart() {
  return `${new Date().getUTCFullYear()}-01-01`
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

function groupKey(side: Side, group: Group): MessageKey {
  switch (group) {
    case 'product':
      return 'an.product'
    case 'partner':
      return side === 'sales' ? 'an.customer' : 'an.vendor'
    case 'user':
      return side === 'sales' ? 'an.person' : 'an.buyer'
    case 'month':
      return 'an.month'
    default: {
      const unexpected: never = group
      return unexpected
    }
  }
}

function asGroup(value: string | null): Group {
  switch (value) {
    case 'product':
    case 'partner':
    case 'user':
    case 'month':
      return value
    default:
      return 'product'
  }
}

export function TradeAnalysisPage({ side }: { side: Side }) {
  const { t } = useI18n()
  const money = useMoney()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const group = asGroup(params.get('group'))
  const [from, setFrom] = useState(yearStart())
  const [to, setTo] = useState(today())
  const report = useQuery({
    queryKey: ['trade-analysis', side, group, from, to],
    queryFn: () => api<Report>(`/api/reports/${side === 'sales' ? 'sales' : 'purchases'}?group=${group}&from=${from}&to=${to}`),
  })
  const rows = report.data?.rows ?? []
  const max = Math.max(...rows.map((row) => Math.abs(row.amount)), 1)
  const base = side === 'sales' ? '/sales/analysis' : '/purchases/analysis'
  return (
    <div className="grid gap-6">
      <PageHeader title={t(side === 'sales' ? 'an.sales' : 'an.purchase')} lead={t(side === 'sales' ? 'an.salesLead' : 'an.purchaseLead')} />
      <div className="flex flex-wrap items-end gap-2">
        {groups.map((item) => (
          <Button key={item} variant={group === item ? 'default' : 'outline'} onClick={() => navigate(`${base}?group=${item}`)}>
            {t(groupKey(side, item))}
          </Button>
        ))}
        <Field label={t('acct.periodFrom')}>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label={t('acct.periodTo')}>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <Button variant="outline" onClick={() => { window.location.href = `/api/reports/${side === 'sales' ? 'sales' : 'purchases'}?group=${group}&from=${from}&to=${to}&format=csv` }}>
          {t('phase.exportCsv')}
        </Button>
      </div>
      {report.isLoading ? <p className="text-sm text-muted-foreground">{t('an.loading')}</p> : null}
      {report.isError ? <p className="text-sm text-destructive">{report.error.message}</p> : null}
      {report.data && rows.length === 0 ? <EmptyState title={t('an.empty')} body={t(side === 'sales' ? 'an.salesLead' : 'an.purchaseLead')} /> : null}
      {rows.length > 0 ? (
        <Panel>
          <div className="grid gap-2">
            {rows.slice(0, 8).map((row) => (
              <div key={row.key} className="grid grid-cols-[10rem_1fr_auto] items-center gap-3 text-sm">
                <span className="truncate">{row.label}</span>
                <span className="h-2 rounded-full bg-secondary">
                  <span className="block h-2 rounded-full bg-[var(--kl-color-primary-fill)]" style={{ width: `${(Math.abs(row.amount) / max) * 100}%` }} />
                </span>
                <span className="tabular-nums">{money(row.amount)}</span>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}
      {report.data && rows.length > 0 ? (
        <div className="keel-table overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t(groupKey(side, group))}</th>
                <th className="px-3 py-2 text-right font-medium">{t('an.amount')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('an.documents')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-border">
                  <td className="px-3 py-2">{row.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{money(row.amount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.documents}</td>
                </tr>
              ))}
              <tr>
                <td className="px-3 py-2 font-semibold">{t('an.total')}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{money(report.data.total)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
