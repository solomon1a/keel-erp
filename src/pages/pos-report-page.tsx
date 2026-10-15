import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { payMethodLabel, posOrderLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'
import type { PosSummary, Warehouse } from '../lib/types.ts'

type Report = {
  date: string
  warehouse: { id: number; name: string; code: string }
  orderCount: number
  salesTotal: number
  refundTotal: number
  net: number
  payments: PosSummary['payments']
  refunds: PosSummary['refunds']
  orders: Array<{ id: number; name: string; state: string; amountTotal: number; amountRefunded: number; customerName: string | null; createdAt: string }>
}

export function PosReportPage() {
  const { t } = useI18n()
  const money = useMoney()
  const [params, setParams] = useSearchParams()
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const [warehouseId, setWarehouseId] = useState(params.get('warehouseId') ?? '')
  const [date, setDate] = useState(params.get('date') ?? new Date().toISOString().slice(0, 10))

  useEffect(() => {
    if (warehouseId || !warehouses.data) return
    const shop = warehouses.data.find((row) => row.code === 'SZ') ?? warehouses.data[0]
    if (shop) setWarehouseId(String(shop.id))
  }, [warehouseId, warehouses.data])

  const report = useQuery({
    queryKey: ['pos-report', warehouseId, date],
    queryFn: () => api<Report>(`/api/pos/report?warehouseId=${warehouseId}&date=${date}`),
    enabled: Boolean(warehouseId && date),
  })

  const methods = ['cash', 'card', 'wechat', 'alipay'] as const

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('pos.reportTitle')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('pos.reportLead')}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t('pos.shop')}</span>
          <select
            className="h-10 rounded-md border border-border bg-card px-3"
            value={warehouseId}
            onChange={(event) => {
              setWarehouseId(event.target.value)
              const next = new URLSearchParams(params)
              next.set('warehouseId', event.target.value)
              setParams(next)
            }}
          >
            {warehouses.data?.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-muted-foreground">{t('pos.date')}</span>
          <input
            className="h-10 rounded-md border border-border bg-card px-3"
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value)
              const next = new URLSearchParams(params)
              next.set('date', event.target.value)
              setParams(next)
            }}
          />
        </label>
      </div>
      {report.isLoading ? <p className="text-sm text-muted-foreground">{t('pos.loading')}</p> : null}
      {report.isError ? <p className="text-sm text-destructive">{report.error.message}</p> : null}
      {report.data ? (
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <p className="rounded-lg border border-border bg-card p-4"><span className="block text-sm text-muted-foreground">{t('pos.sales')}</span><span className="text-2xl font-semibold">{money(report.data.salesTotal)}</span></p>
            <p className="rounded-lg border border-border bg-card p-4"><span className="block text-sm text-muted-foreground">{t('pos.refunds')}</span><span className="text-2xl font-semibold">{money(report.data.refundTotal)}</span></p>
            <p className="rounded-lg border border-border bg-card p-4"><span className="block text-sm text-muted-foreground">{t('pos.net')}</span><span className="text-2xl font-semibold">{money(report.data.net)}</span></p>
          </div>
          <ul className="grid gap-1 text-sm">
            {methods.map((method) => (
              <li key={method}>{payMethodLabel(method, t)} {money(report.data?.payments[method] ?? 0)} · {t('pos.refunds')} {money(report.data?.refunds[method] ?? 0)}</li>
            ))}
          </ul>
          {report.data.orders.length === 0 ? <p className="text-sm text-muted-foreground">{t('pos.noReport')}</p> : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">{t('pos.ordersLink')}</th>
                    <th className="px-4 py-3 font-medium">{t('pos.customer')}</th>
                    <th className="px-4 py-3 font-medium">{t('pos.total')}</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.orders.map((order) => (
                    <tr key={order.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3"><Link className="font-semibold hover:underline" to={`/pos/orders/${order.id}`}>{order.name}</Link></td>
                      <td className="px-4 py-3">{order.customerName ?? t('pos.walkIn')}</td>
                      <td className="px-4 py-3">{money(order.amountTotal)} · {posOrderLabel(order.state, t)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
