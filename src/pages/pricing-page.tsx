import { useQuery } from '@tanstack/react-query'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'

type Rule = {
  id: number
  name: string
  side: string
  minQty: number
  discountPercent: number
  fixedPrice: number | null
  active: boolean
  product: { name: string; sku: string } | null
  customer: { name: string } | null
  customerGroup: { name: string } | null
  vendor: { name: string } | null
}

export function PricingPage() {
  const { t } = useI18n()
  const money = useMoney()
  const rules = useQuery({ queryKey: ['pricing-rules'], queryFn: () => api<Rule[]>('/api/pricing/rules') })

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('menu.pricing')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">
          {t('order.fulfill.to_deliver_and_bill') === 'To deliver and bill'
            ? 'A quantity break replaces the list price. The most specific rule then applies a discount or a fixed price.'
            : '数量阶梯替换标价。更具体的规则再给折扣或固定价。'}
        </p>
      </div>
      {rules.isLoading ? <p className="text-sm text-muted-foreground">{t('order.loading')}</p> : null}
      {rules.isError ? <p className="text-sm text-destructive">{rules.error.message}</p> : null}
      {rules.data && rules.data.length === 0 ? <p className="text-sm text-muted-foreground">{t('orders.emptyTitle')}</p> : null}
      <div className="grid gap-3">
        {rules.data?.map((rule) => (
          <article key={rule.id} className="keel-glass rounded-[28px] p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl">{rule.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {rule.product ? `${rule.product.name} · ${rule.product.sku}` : t('menu.products')}
                  {' · '}
                  {t('order.partialQty')} {rule.minQty}
                </p>
              </div>
              <span className="keel-chip keel-chip-active">{rule.side}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {rule.customer ? <span className="keel-chip">{rule.customer.name}</span> : null}
              {rule.customerGroup ? <span className="keel-chip">{rule.customerGroup.name}</span> : null}
              {rule.vendor ? <span className="keel-chip">{rule.vendor.name}</span> : null}
              {rule.fixedPrice !== null ? <span className="keel-chip">{money(rule.fixedPrice)}</span> : null}
              {rule.discountPercent ? <span className="keel-chip">{rule.discountPercent}%</span> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
