import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { FapiaoNote, MoneyTotals } from '../components/money-totals.tsx'
import { Button } from '../components/ui/button.tsx'
import { purchaseStateLabel, singleTaxRate } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { appliedRate } from '../domain/money.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { PurchaseOrder, User } from '../lib/types.ts'

export function PurchasePrintPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const order = useQuery({ queryKey: ['purchase', id], queryFn: () => api<PurchaseOrder>(`/api/purchases/${id}`) })
  if (order.isLoading) return <p className="p-8 text-sm">{t('print.preparing')}</p>
  if (order.isError) {
    return (
      <p className="p-8 text-sm">
        <span className="text-destructive">{order.error.message}</span>{' '}
        <Link className="underline" to="/sign-in">
          {t('print.signIn')}
        </Link>
      </p>
    )
  }
  const row = order.data
  if (!row) return null
  const rate = singleTaxRate((row.lines ?? []).map((line) => (line.tax ? appliedRate(line.subtotal, line.taxAmount) : null)))

  return (
    <article className="mx-auto max-w-3xl bg-white px-8 py-10 text-foreground print:px-0">
      <div className="mb-6 flex items-start justify-between gap-4 print:hidden">
        <p className="text-sm text-muted-foreground">{t('print.hint')}</p>
        <Button onClick={() => window.print()}>{t('print.print')}</Button>
      </div>
      <header className="flex items-start justify-between border-b border-border pb-4">
        <div>
          <p className="font-serif text-3xl">{me.data?.company.name ?? 'Keel'}</p>
          <p className="text-sm text-muted-foreground">{me.data?.company.city}</p>
        </div>
        <div className="text-right">
          <p className="font-serif text-2xl">{row.name}</p>
          <p className="text-sm">{purchaseStateLabel(row.state, t)}</p>
          <p className="text-sm text-muted-foreground">{shortDate(row.dateOrder)}</p>
        </div>
      </header>
      <p className="mt-6">
        <span className="block text-sm text-muted-foreground">{t('print.vendor')}</span>
        <span className="text-lg font-semibold">{row.vendor.name}</span>
        {row.vendor.city ? <span className="block text-sm">{row.vendor.city}</span> : null}
        {row.vendor.email ? <span className="block text-sm">{row.vendor.email}</span> : null}
      </p>
      <table className="mt-6 w-full text-left text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2">{t('print.item')}</th>
            <th className="py-2">{t('print.qty')}</th>
            <th className="py-2">{t('print.unitCost')}</th>
            <th className="py-2">{t('print.untaxed')}</th>
            <th className="py-2">{t('print.tax')}</th>
          </tr>
        </thead>
        <tbody>
          {row.lines?.map((line, index) => (
            <tr key={line.id ?? index} className="border-b border-border">
              <td className="py-2">
                {line.description}
                {line.tax ? <span className="block text-muted-foreground">{line.tax.name} {appliedRate(line.subtotal, line.taxAmount) ?? line.tax.rate}%</span> : null}
              </td>
              <td className="py-2">{line.quantity}</td>
              <td className="py-2">{money(line.unitCost)}</td>
              <td className="py-2">{money(line.subtotal)}</td>
              <td className="py-2">{money(line.taxAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex justify-end">
        <MoneyTotals untaxed={row.amountUntaxed} tax={row.amountTax} total={row.amountTotal} rate={rate} />
      </div>
      <div className="mt-6">
        <FapiaoNote />
      </div>
    </article>
  )
}
