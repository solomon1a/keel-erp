import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'

type WastageRow = {
  id: number
  quantity: number
  reason: string
  kind: string
  cost: number
  expectedQty: number
  operationName: string | null
  product: { id: number; name: string; sku: string }
  workstation: { id: number; name: string } | null
  order: { id: number; name: string }
}

type Bucket = { name?: string; reason?: string; sku?: string; quantity: number; cost: number; productId?: number }

type Report = {
  rows: WastageRow[]
  byItem: Bucket[]
  byStation: Bucket[]
  byReason: Bucket[]
  expected: number
  actual: number
  variancePct: number
  expense: number
  scrap: number
  cost: number
}

const kindKey: Record<string, MessageKey> = {
  process_loss: 'floor.processLoss',
  scrap: 'floor.scrap',
  rejected: 'floor.rejected',
}

function kindLabel(kind: string, t: (key: MessageKey) => string) {
  const key = kindKey[kind]
  return key ? t(key) : kind
}

export function WastagePage() {
  const { t } = useI18n()
  const money = useMoney()
  const report = useQuery({ queryKey: ['wastage-report'], queryFn: () => api<Report>('/api/manufacturing/wastage') })

  if (report.isLoading) return <p className="text-sm text-muted-foreground">{t('manufacturing.loading')}</p>
  if (report.isError) return <p className="text-sm text-destructive">{report.error.message}</p>
  const data = report.data
  if (!data) return null

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('floor.wastage')}</h1>
        <p className="mt-1 text-muted-foreground">{t('floor.variance')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <figure className="rounded-lg border border-border bg-card px-4 py-3">
          <figcaption className="text-sm text-muted-foreground">{t('floor.cost')}</figcaption>
          <p className="font-serif text-3xl">{money(data.cost)}</p>
        </figure>
        <figure className="rounded-lg border border-border bg-card px-4 py-3">
          <figcaption className="text-sm text-muted-foreground">{t('floor.expense')}</figcaption>
          <p className="font-serif text-3xl">{money(data.expense)}</p>
        </figure>
        <figure className="rounded-lg border border-border bg-card px-4 py-3">
          <figcaption className="text-sm text-muted-foreground">{t('floor.scrapHeld')}</figcaption>
          <p className="font-serif text-3xl">{money(data.scrap)}</p>
        </figure>
        <figure className="rounded-lg border border-border bg-card px-4 py-3">
          <figcaption className="text-sm text-muted-foreground">{t('floor.expected')} / {t('floor.actual')}</figcaption>
          <p className="font-serif text-3xl">{data.expected} / {data.actual}</p>
          <p className="text-sm text-muted-foreground">{data.variancePct}%</p>
        </figure>
      </div>
      {data.rows.length === 0 ? <EmptyState title={t('floor.noWastage')} body={t('floor.record')} /> : null}
      <div className="grid gap-6 xl:grid-cols-3">
        <BucketTable title={t('floor.byItem')} rows={data.byItem} label={(row) => row.name ?? row.sku ?? '—'} money={money} qtyLabel={t('floor.qty')} costLabel={t('floor.cost')} />
        <BucketTable title={t('floor.byStation')} rows={data.byStation} label={(row) => row.name ?? '—'} money={money} qtyLabel={t('floor.qty')} costLabel={t('floor.cost')} />
        <BucketTable title={t('floor.byReason')} rows={data.byReason} label={(row) => row.reason ?? '—'} money={money} qtyLabel={t('floor.qty')} costLabel={t('floor.cost')} />
      </div>
      {data.rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('manufacturing.colNumber')}</th>
                <th className="px-4 py-3 font-medium">{t('manufacturing.colProduct')}</th>
                <th className="px-4 py-3 font-medium">{t('floor.byStation')}</th>
                <th className="px-4 py-3 font-medium">{t('floor.kind')}</th>
                <th className="px-4 py-3 font-medium">{t('floor.reason')}</th>
                <th className="px-4 py-3 font-medium">{t('floor.qty')}</th>
                <th className="px-4 py-3 font-medium">{t('floor.cost')}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/manufacturing/${row.order.id}`}>{row.order.name}</Link>
                  </td>
                  <td className="px-4 py-3">{row.product.name}</td>
                  <td className="px-4 py-3">{row.workstation?.name ?? row.operationName ?? '—'}</td>
                  <td className="px-4 py-3">{kindLabel(row.kind, t)}</td>
                  <td className="px-4 py-3">{row.reason}</td>
                  <td className="px-4 py-3">{row.quantity}</td>
                  <td className="px-4 py-3">{money(row.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}

function BucketTable({
  title,
  rows,
  label,
  money,
  qtyLabel,
  costLabel,
}: {
  title: string
  rows: Bucket[]
  label: (row: Bucket) => string
  money: (value: number) => string
  qtyLabel: string
  costLabel: string
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl">{title}</h2>
      <table className="mt-2 w-full text-left text-sm">
        <thead className="border-b border-border text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">{title}</th>
            <th className="py-2 font-medium">{qtyLabel}</th>
            <th className="py-2 font-medium">{costLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={label(row)} className="border-b border-border last:border-0">
              <td className="py-2">{label(row)}</td>
              <td className="py-2">{row.quantity}</td>
              <td className="py-2">{money(row.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
