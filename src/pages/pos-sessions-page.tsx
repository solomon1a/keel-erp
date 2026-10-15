import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, EmptyState, Notice } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { posSessionLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { PosSession, Warehouse } from '../lib/types.ts'

export function PosSessionsPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const [warehouseId, setWarehouseId] = useState('')
  const [openingCash, setOpeningCash] = useState('200')
  const [error, setError] = useState('')
  const sessions = useQuery({ queryKey: ['pos-sessions'], queryFn: () => api<PosSession[]>('/api/pos/sessions') })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })

  useEffect(() => {
    if (warehouseId || !warehouses.data) return
    const shop = warehouses.data.find((row) => row.code === 'SZ') ?? warehouses.data[0]
    if (shop) setWarehouseId(String(shop.id))
  }, [warehouseId, warehouses.data])

  const open = useMutation({
    mutationFn: () =>
      api<PosSession>('/api/pos/sessions', {
        method: 'POST',
        body: JSON.stringify({ warehouseId: Number(warehouseId), openingCash: Number(openingCash) }),
      }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['pos-sessions'] })
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('pos.failed')),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('pos.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('pos.lead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/pos/orders"><Button variant="outline">{t('pos.ordersLink')}</Button></Link>
          <Link to="/pos/report"><Button variant="outline">{t('pos.reportLink')}</Button></Link>
        </div>
      </div>
      <p className="max-w-2xl text-sm text-muted-foreground">{t('pos.adminClose')}</p>
      {sessions.isLoading ? <p className="text-sm text-muted-foreground">{t('pos.loading')}</p> : null}
      {sessions.isError ? <p className="text-sm text-destructive">{sessions.error.message}</p> : null}
      {sessions.data && sessions.data.length === 0 ? <EmptyState title={t('pos.title')} body={t('pos.emptySessions')} /> : null}
      {sessions.data && sessions.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('pos.session')}</th>
                <th className="px-4 py-3 font-medium">{t('pos.shop')}</th>
                <th className="px-4 py-3 font-medium">{t('pos.opening')}</th>
                <th className="px-4 py-3 font-medium">{t('pos.sales')}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {sessions.data.map((session) => (
                <tr key={session.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/pos/sessions/${session.id}`}>{session.name}</Link>
                    <span className="mt-1 block"><Badge tone={session.state}>{posSessionLabel(session.state, t)}</Badge></span>
                  </td>
                  <td className="px-4 py-3">{session.warehouse.name}</td>
                  <td className="px-4 py-3">{money(session.openingCash)}<span className="block text-muted-foreground">{shortDate(session.openedAt)}</span></td>
                  <td className="px-4 py-3">{money(session.summary.salesTotal)}</td>
                  <td className="px-4 py-3">
                    {session.state === 'open' ? <Link to={`/pos/sessions/${session.id}`}><Button size="sm">{t('pos.continue')}</Button></Link> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <form
        className="grid max-w-xl gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          open.mutate()
        }}
      >
        <h2 className="font-serif text-2xl">{t('pos.open')}</h2>
        {error ? <Notice message={error} /> : null}
        <Field label={t('pos.shop')}>
          <select className="h-12 rounded-md border border-border bg-background px-3 text-base" value={warehouseId} onChange={(event) => setWarehouseId(event.target.value)} required>
            <option value="">{t('pos.chooseShop')}</option>
            {warehouses.data?.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>
            ))}
          </select>
        </Field>
        <Field label={t('pos.opening')}>
          <Input className="h-12 text-base" type="number" min="0" step="0.01" value={openingCash} onChange={(event) => setOpeningCash(event.target.value)} required />
        </Field>
        <Button className="h-12" type="submit" disabled={open.isPending}>{open.isPending ? t('common.saving') : t('pos.open')}</Button>
      </form>
    </div>
  )
}
