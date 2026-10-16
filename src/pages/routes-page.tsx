import { useQuery } from '@tanstack/react-query'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'

type RouteRow = { id: number; name: string; kind: string; steps: string }

export function RoutesPage() {
  const { t } = useI18n()
  const routes = useQuery({ queryKey: ['stock-routes'], queryFn: () => api<RouteRow[]>('/api/stock/routes') })
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('stock.routesTitle')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('stock.routesLead')}</p>
      </div>
      {routes.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {(routes.data ?? []).map((route) => (
          <article key={route.id} className="rounded-lg border border-border bg-card p-4">
            <h2 className="font-semibold">{route.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{route.kind}</p>
            <p className="mt-3 text-sm">{t('stock.steps')}: {route.steps.split(',').join(' → ')}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
