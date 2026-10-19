import { useQuery } from '@tanstack/react-query'
import { Fragment, useState } from 'react'
import { Link } from 'react-router-dom'
import { BaseCurrencyNote } from '../components/base-currency.tsx'
import { EmptyState, Field } from '../components/field.tsx'
import { Kpi, KpiGrid, PageHeader, Panel } from '../components/surface.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

type Bucket = 'current' | 'd1_30' | 'd31_60' | 'd61_90' | 'd90'

type AgedDoc = {
  id: number
  name: string
  moveType: string
  invoiceDate: string
  dueDate: string
  days: number
  bucket: Bucket
  amount: number
}

type AgedPartner = {
  partnerId: number
  name: string
  current: number
  d1_30: number
  d31_60: number
  d61_90: number
  d90: number
  total: number
  documents: AgedDoc[]
}

type AgedReport = {
  asOf: string
  side: 'receivable' | 'payable'
  partners: AgedPartner[]
  totals: Omit<AgedPartner, 'partnerId' | 'name' | 'documents'>
}

type CashLine = { id: number; name: string; date: string; label: string; section: string; amount: number }

type CashReport = {
  from: string
  to: string
  operating: number
  investing: number
  financing: number
  net: number
  opening: number
  closing: number
  lines: CashLine[]
}

const bucketOrder: Bucket[] = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90']

function bucketLabel(bucket: Bucket, t: Translate) {
  switch (bucket) {
    case 'current':
      return t('acct.bucketCurrent')
    case 'd1_30':
      return t('acct.bucket1')
    case 'd31_60':
      return t('acct.bucket31')
    case 'd61_90':
      return t('acct.bucket61')
    case 'd90':
      return t('acct.bucket90')
    default: {
      const unexpected: never = bucket
      return unexpected
    }
  }
}

function today() {
  return new Date().toISOString().slice(0, 10)
}

export function AgedReport({ side }: { side: 'receivable' | 'payable' }) {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [asOf, setAsOf] = useState(today())
  const [open, setOpen] = useState<number | null>(null)
  const report = useQuery({
    queryKey: ['aged', side, asOf],
    queryFn: () => api<AgedReport>(`/api/reports/aged?side=${side}&asOf=${asOf}`),
  })
  const title = side === 'receivable' ? t('acct.agedReceivable') : t('acct.agedPayable')
  return (
    <div className="grid gap-6">
      <PageHeader title={title} />
      <p className="max-w-2xl text-sm text-muted-foreground">{t('acct.agedLead')}</p>
      <BaseCurrencyNote />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('acct.asOf')}>
          <Input type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
        </Field>
        <Button type="button" variant="outline" onClick={() => { window.location.href = `/api/reports/aged?side=${side}&asOf=${asOf}&format=csv` }}>
          {t('phase.exportCsv')}
        </Button>
      </div>
      {report.isLoading ? <p className="text-sm text-muted-foreground">{t('acct.loading')}</p> : null}
      {report.isError ? <p className="text-sm text-destructive">{report.error.message}</p> : null}
      {report.data && report.data.partners.length === 0 ? <EmptyState title={t('acct.noOpen')} body={t('acct.agedLead')} /> : null}
      {report.data && report.data.partners.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="px-4 py-2 font-medium">{t('acct.partner')}</th>
                {bucketOrder.map((bucket) => <th key={bucket} className="px-4 py-2 text-right font-medium">{bucketLabel(bucket, t)}</th>)}
                <th className="px-4 py-2 text-right font-medium">{t('acct.rowTotal')}</th>
              </tr>
            </thead>
            <tbody>
              {report.data.partners.map((partner) => (
                <Fragment key={partner.partnerId}>
                  <tr className="border-b border-border">
                    <td className="px-4 py-3">
                      <button type="button" className="font-semibold hover:underline" onClick={() => setOpen(open === partner.partnerId ? null : partner.partnerId)}>
                        {partner.name}
                      </button>
                    </td>
                    {bucketOrder.map((bucket) => <td key={bucket} className="px-4 py-3 text-right">{money(partner[bucket])}</td>)}
                    <td className="px-4 py-3 text-right font-medium">{money(partner.total)}</td>
                  </tr>
                  {open === partner.partnerId ? partner.documents.map((doc) => (
                    <tr key={doc.id} className="border-b border-border bg-secondary/40 text-muted-foreground">
                      <td className="px-4 py-2" colSpan={2}>
                        <Link className="font-medium text-foreground hover:underline" to={`/accounting/${doc.id}`}>{doc.name}</Link>
                        <span> · {shortDate(doc.dueDate)} · {t('acct.days')} {doc.days}</span>
                      </td>
                      <td className="px-4 py-2" colSpan={4}>{bucketLabel(doc.bucket, t)}</td>
                      <td className="px-4 py-2 text-right text-foreground">{money(doc.amount)}</td>
                    </tr>
                  )) : null}
                </Fragment>
              ))}
              <tr>
                <td className="px-4 py-3 font-semibold">{t('acct.rowTotal')}</td>
                {bucketOrder.map((bucket) => <td key={bucket} className="px-4 py-3 text-right font-semibold">{money(report.data.totals[bucket])}</td>)}
                <td className="px-4 py-3 text-right font-semibold">{money(report.data.totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

export function CashFlowReport() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const year = new Date().getUTCFullYear()
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(today())
  const report = useQuery({
    queryKey: ['cashflow', from, to],
    queryFn: () => api<CashReport>(`/api/reports/cashflow?from=${from}&to=${to}`),
  })
  const row = report.data
  return (
    <div className="grid gap-6">
      <PageHeader title={t('acct.cashFlow')} />
      <p className="max-w-2xl text-sm text-muted-foreground">{t('acct.cashLead')}</p>
      <BaseCurrencyNote />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t('acct.periodFrom')}>
          <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label={t('acct.periodTo')}>
          <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>
      {report.isLoading ? <p className="text-sm text-muted-foreground">{t('acct.loading')}</p> : null}
      {report.isError ? <p className="text-sm text-destructive">{report.error.message}</p> : null}
      {row ? (
        <>
          <KpiGrid>
            <Kpi label={t('acct.operating')} value={money(row.operating)} />
            <Kpi label={t('acct.investing')} value={money(row.investing)} />
            <Kpi label={t('acct.financing')} value={money(row.financing)} />
            <Kpi label={t('acct.netCash')} value={money(row.net)} hint={`${t('acct.openingCash')} ${money(row.opening)} · ${t('acct.closingCash')} ${money(row.closing)}`} />
          </KpiGrid>
          {row.lines.length === 0 ? <EmptyState title={t('acct.noCash')} body={t('acct.cashLead')} /> : (
            <Panel>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <tbody>
                    {row.lines.map((line, index) => (
                      <tr key={`${line.id}-${index}`} className="border-b border-border last:border-0">
                        <td className="px-2 py-2">{shortDate(line.date)}</td>
                        <td className="px-2 py-2">{line.name}</td>
                        <td className="px-2 py-2">{line.label}</td>
                        <td className="px-2 py-2">{line.section}</td>
                        <td className="px-2 py-2 text-right">{money(line.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}
        </>
      ) : null}
    </div>
  )
}
