import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import type { Warehouse } from '../lib/types.ts'

export function WarehousesPage() {
  const { t } = useI18n()
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('wh.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('wh.lead')}</p>
        </div>
        <Link to="/inventory/warehouses/new"><Button>{t('wh.new')}</Button></Link>
      </div>
      {warehouses.isLoading ? <p className="text-sm text-muted-foreground">{t('wh.loading')}</p> : null}
      {warehouses.isError ? <p className="text-sm text-destructive">{warehouses.error.message}</p> : null}
      {warehouses.data && warehouses.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('wh.empty')}</p> : null}
      {warehouses.data && warehouses.data.length > 0 ? (
        <div className="grid gap-3">
          {warehouses.data.map((warehouse) => (
            <Link key={warehouse.id} to={`/inventory/warehouses/${warehouse.id}`} className="rounded-lg border border-border bg-card px-4 py-3 hover:bg-secondary/40">
              <p className="font-semibold">
                {warehouse.name}
                <span className="ml-2 text-sm font-normal text-muted-foreground">{warehouse.code}</span>
                {warehouse.isDefault ? <span className="ml-2 text-sm font-normal text-muted-foreground">{t('wh.default')}</span> : null}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {warehouse.locations.map((location) => location.name).join(' · ') || t('wh.locations')}
              </p>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  )
}
