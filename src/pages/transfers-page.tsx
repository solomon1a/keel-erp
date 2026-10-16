import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { transferStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import type { MessageKey } from '../i18n/messages.ts'
import { api } from '../lib/api.ts'

type TransferRow = {
  id: number
  name: string
  state: string
  locationFrom: { name: string; warehouse: { name: string } | null }
  locationTo: { name: string; warehouse: { name: string } | null }
}

const filters = [
  ['all', 'tr.filterAll'],
  ['draft', 'tr.filterDraft'],
  ['ready', 'tr.filterReady'],
  ['done', 'tr.filterDone'],
  ['cancel', 'tr.filterCancel'],
] as const satisfies ReadonlyArray<readonly [string, MessageKey]>

function place(location: TransferRow['locationFrom']) {
  return location.warehouse ? `${location.warehouse.name} · ${location.name}` : location.name
}

export function TransfersPage() {
  const { t } = useI18n()
  const [state, setState] = useState('all')
  const transfers = useQuery({
    queryKey: ['transfers', state],
    queryFn: () => api<TransferRow[]>(`/api/transfers?state=${state}`),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('tr.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('tr.lead')}</p>
        </div>
        <Link to="/inventory/transfers/new"><Button>{t('tr.new')}</Button></Link>
      </div>
      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <Button key={value} size="sm" variant={state === value ? 'secondary' : 'outline'} onClick={() => setState(value)}>
            {t(label)}
          </Button>
        ))}
      </div>
      {transfers.isLoading ? <p className="text-sm text-muted-foreground">{t('tr.loading')}</p> : null}
      {transfers.isError ? <p className="text-sm text-destructive">{transfers.error.message}</p> : null}
      {transfers.data && transfers.data.length === 0 ? <EmptyState title={t('tr.emptyTitle')} body={t('tr.emptyBody')} /> : null}
      {transfers.data && transfers.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('tr.colNumber')}</th>
                <th className="px-4 py-3 font-medium">{t('tr.colFrom')}</th>
                <th className="px-4 py-3 font-medium">{t('tr.colTo')}</th>
                <th className="px-4 py-3 font-medium">{t('tr.colState')}</th>
              </tr>
            </thead>
            <tbody>
              {transfers.data.map((transfer) => (
                <tr key={transfer.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/inventory/transfers/${transfer.id}`}>{transfer.name}</Link>
                  </td>
                  <td className="px-4 py-3">{place(transfer.locationFrom)}</td>
                  <td className="px-4 py-3">{place(transfer.locationTo)}</td>
                  <td className="px-4 py-3"><Badge tone={transfer.state}>{transferStateLabel(transfer.state, t)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
