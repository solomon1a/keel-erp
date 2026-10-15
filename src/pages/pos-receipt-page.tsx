import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { Button } from '../components/ui/button.tsx'
import { payMethodLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { roundMoney } from '../domain/money.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
import type { PosOrder, User } from '../lib/types.ts'

export function PosReceiptPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const order = useQuery({ queryKey: ['pos-order', id], queryFn: () => api<PosOrder>(`/api/pos/orders/${id}`) })
  if (order.isLoading) return <p className="p-6 text-sm">{t('print.preparing')}</p>
  if (order.isError) {
    return (
      <p className="p-6 text-sm">
        <span className="text-destructive">{order.error.message}</span>{' '}
        <Link className="underline" to="/sign-in">{t('print.signIn')}</Link>
      </p>
    )
  }
  const row = order.data
  if (!row) return null
  const rate = row.lines?.[0]?.taxRate ?? me.data?.company.defaultTaxRate ?? 13

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{'@media print { @page { size: 80mm auto; margin: 4mm; } }'}</style>
      <article className="mx-auto w-[80mm] px-3 py-4 text-[13px] leading-snug">
        <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
          <p className="text-muted-foreground">{t('pos.printHint')}</p>
          <Button onClick={() => window.print()}>{t('print.print')}</Button>
        </div>
        <header className="border-b border-black pb-2 text-center">
          <p className="font-serif text-xl">{me.data?.company.name ?? 'Keel'}</p>
          <p>{row.warehouse?.name}</p>
          <p className="font-semibold">{row.name}</p>
          <p>{shortDate(row.createdAt)}</p>
        </header>
        <p className="mt-2">{row.customer?.name ?? t('pos.walkIn')}</p>
        <ul className="mt-2 grid gap-2 border-b border-black pb-2">
          {row.lines?.map((line) => (
            <li key={line.id}>
              <span className="block font-medium">{line.description}</span>
              <span className="flex justify-between gap-2">
                <span>{line.quantity} × {money(line.unitPrice)}{line.discount ? ` −${line.discount}%` : ''}</span>
                <span>{money(roundMoney(line.subtotal + line.taxAmount))}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 flex justify-between"><span>{t('totals.untaxed')}</span><span>{money(row.amountUntaxed)}</span></p>
        <p className="flex justify-between"><span>{t('pos.vat', { rate })}</span><span>{money(row.amountTax)}</span></p>
        <p className="flex justify-between text-base font-semibold"><span>{t('pos.total')}</span><span>{money(row.amountTotal)}</span></p>
        <ul className="mt-2 grid gap-1">
          {row.payments?.filter((payment) => payment.direction !== 'refund').map((payment, index) => (
            <li key={payment.id ?? index} className="flex justify-between">
              <span>{payMethodLabel(payment.method, t)}{payment.tendered ? ` (${money(payment.tendered)})` : ''}</span>
              <span>{money(payment.amount)}</span>
            </li>
          ))}
        </ul>
        {row.payments?.some((payment) => payment.change) ? (
          <p className="mt-1 flex justify-between font-semibold">
            <span>{t('pos.change')}</span>
            <span>{money(row.payments.reduce((sum, payment) => sum + (payment.change ?? 0), 0))}</span>
          </p>
        ) : null}
      </article>
    </div>
  )
}
