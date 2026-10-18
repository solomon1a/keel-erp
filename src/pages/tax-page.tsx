import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { PageHeader, Panel, TableFrame } from '../components/surface.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

type CompanyTax = { id: number; code: string; name: string; kind: string; amount: number; priceInclude: boolean; compound: boolean; withholding: boolean }
type Group = { id: number; name: string; lines: Array<{ tax: CompanyTax }> }
type Position = { id: number; name: string; countryCode: string; partnerKind: string }
type Bundle = { taxes: CompanyTax[]; groups: Group[]; positions: Position[] }
type Result = { net: number; added: number; withheld: number; total: number }
type ReportRow = { id: number; code: string; name: string; added: number; withheld: number; documents: number }
type Term = { id: number; name: string; lines: Array<{ percent: number; days: number }> }
type Recurring = { id: number; name: string; nextDate: string; intervalDays: number; partner: { name: string } }

export function TaxPage() {
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const bundle = useQuery({ queryKey: ['company-taxes'], queryFn: () => api<Bundle>('/api/taxes/company') })
  const report = useQuery({ queryKey: ['tax-report'], queryFn: () => api<ReportRow[]>('/api/taxes/report') })
  const terms = useQuery({ queryKey: ['payment-terms'], queryFn: () => api<Term[]>('/api/payment-terms') })
  const recurring = useQuery({ queryKey: ['recurring'], queryFn: () => api<Recurring[]>('/api/recurring') })
  const [groupId, setGroupId] = useState('')
  const [positionId, setPositionId] = useState('')
  const [base, setBase] = useState('100')
  const [quantity, setQuantity] = useState('1')
  const [result, setResult] = useState<Result | null>(null)
  const [error, setError] = useState('')
  const preview = useMutation({
    mutationFn: () => api<Result>('/api/taxes/preview', {
      method: 'POST',
      body: JSON.stringify({
        base: Number(base),
        quantity: Number(quantity),
        groupId: Number(groupId),
        positionId: positionId ? Number(positionId) : null,
      }),
    }),
    onSuccess: (row) => {
      setResult(row)
      setError('')
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('phase.taxes')),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    preview.mutate()
  }

  return (
    <div className="grid gap-5">
      <PageHeader
        title={t('phase.taxes')}
        lead={t('phase.taxesLead')}
        actions={<Link className="keel-back" to="/accounting">{t('common.back')}</Link>}
      />
      {error ? <Notice message={error} /> : null}
      <Panel>
        <table className="w-full text-left text-sm">
          <tbody>
            {(bundle.data?.taxes ?? []).map((tax) => (
              <tr key={tax.id} className="border-b border-border last:border-0">
                <td className="py-2 font-semibold">{tax.code}</td>
                <td className="py-2">{tax.name}</td>
                <td className="py-2">{tax.kind} {tax.amount}{tax.kind === 'percent' ? '%' : ''}</td>
                <td className="py-2 text-muted-foreground">{[tax.priceInclude ? 'included' : '', tax.compound ? 'compound' : '', tax.withholding ? 'withholding' : ''].filter(Boolean).join(' · ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
      <form className="grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-3 md:grid-cols-4">
          <Field label={t('phase.group')}>
            <select className="h-10 rounded-md border border-border bg-card px-3" value={groupId} onChange={(event) => setGroupId(event.target.value)} required>
              <option value="">{t('common.choose')}</option>
              {(bundle.data?.groups ?? []).map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </Field>
          <Field label={t('phase.position')}>
            <select className="h-10 rounded-md border border-border bg-card px-3" value={positionId} onChange={(event) => setPositionId(event.target.value)}>
              <option value="">{t('phase.none')}</option>
              {(bundle.data?.positions ?? []).map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
            </select>
          </Field>
          <Field label={t('phase.base')}><Input value={base} onChange={(event) => setBase(event.target.value)} /></Field>
          <Field label={t('phase.qty')}><Input value={quantity} onChange={(event) => setQuantity(event.target.value)} /></Field>
        </div>
        <div><Button type="submit" disabled={preview.isPending}>{t('phase.calculate')}</Button></div>
        {result ? (
          <p className="text-sm">{t('phase.net')} {money(result.net)} · {t('phase.added')} {money(result.added)} · {t('phase.withheld')} {money(result.withheld)} · {t('phase.total')} {money(result.total)}</p>
        ) : null}
      </form>
      <div>
        <h2 className="font-serif text-2xl">{t('phase.report')}</h2>
        <TableFrame>
          <table className="w-full text-left text-sm">
            <tbody>
              {(report.data ?? []).map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-2 font-semibold">{row.code}</td>
                  <td className="px-4 py-2">{row.name}</td>
                  <td className="px-4 py-2">{money(row.added)}</td>
                  <td className="px-4 py-2">{money(row.withheld)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Panel>
          <h2 className="font-semibold">{t('phase.terms')}</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {(terms.data ?? []).map((term) => (
              <li key={term.id}>{term.name} · {term.lines.map((line) => `${line.percent}% / ${line.days}d`).join(', ')}</li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h2 className="font-semibold">{t('phase.recurring')}</h2>
          <ul className="mt-2 grid gap-1 text-sm">
            {(recurring.data ?? []).map((row) => (
              <li key={row.id}>{row.name} · {row.partner.name} · {t('phase.next')} {shortDate(row.nextDate)}</li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  )
}
