import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'

type Suggestion = {
  kind: 'invoice' | 'payment' | 'rule'
  invoiceId?: number
  invoiceName?: string
  amount: number
  label: string
  action?: string
  accountCode?: string
}
type Line = { id: number; lineDate: string; label: string; amount: number; reference: string; reconciled: number; matches: Array<{ invoice: { name: string } | null }> }
type Detail = {
  statement: { id: number; name: string; lines: Line[] }
  suggestions: Record<string, Suggestion[]>
  bookBalance: number
  statementBalance: number
  difference: number
}

export function ReconcilePage() {
  const { id } = useParams()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ['statement', id],
    queryFn: () => api<Detail>(`/api/bank/statements/${id}`),
  })
  const [error, setError] = useState('')
  const [rule, setRule] = useState({ name: 'Bank fee', matchText: 'FEE', action: 'fee', accountCode: '6607' })
  const apply = useMutation({
    mutationFn: (input: { lineId: number; body: Record<string, unknown> }) => api(`/api/bank/lines/${input.lineId}/apply`, {
      method: 'POST',
      body: JSON.stringify(input.body),
    }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['statement', id] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const addRule = useMutation({
    mutationFn: () => api('/api/bank/rules', { method: 'POST', body: JSON.stringify(rule) }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['statement', id] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })

  const data = detail.data
  if (detail.isLoading || !data) return <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p>
  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm underline" to="/accounting/statements">{t('bank.title')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{t('bank.reconcileTitle')}</h1>
        <p className="mt-1 text-muted-foreground">{data.statement.name}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <Balance label={t('bank.statementBalance')} value={money(data.statementBalance)} />
        <Balance label={t('bank.book')} value={money(data.bookBalance)} />
        <div data-tour="tour-bank"><Balance label={t('bank.difference')} value={money(data.difference)} /></div>
      </div>
      <form className="grid max-w-3xl gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); addRule.mutate() }}>
        <h2 className="font-semibold md:col-span-4">{t('bank.rules')}</h2>
        <Field label={t('desk.name')}><Input value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} /></Field>
        <Field label={t('bank.ruleText')}><Input value={rule.matchText} onChange={(event) => setRule({ ...rule, matchText: event.target.value })} /></Field>
        <Field label={t('bank.createEntry')}>
          <Select value={rule.action} onChange={(event) => setRule({ ...rule, action: event.target.value })}>
            <option value="fee">{t('bank.fee')}</option>
            <option value="expense">{t('bank.expense')}</option>
            <option value="transfer">{t('bank.transfer')}</option>
          </Select>
        </Field>
        <div className="self-end"><Button type="submit">{t('bank.rules')}</Button></div>
      </form>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t('desk.date')}</th>
              <th className="px-4 py-2 font-medium">{t('desk.name')}</th>
              <th className="px-4 py-2 font-medium">{t('bank.amount')}</th>
              <th className="px-4 py-2 font-medium">{t('bank.suggest')}</th>
            </tr>
          </thead>
          <tbody>
            {data.statement.lines.map((line) => {
              const open = Math.round((Math.abs(line.amount) - line.reconciled) * 100) / 100
              const ideas = data.suggestions[String(line.id)] ?? data.suggestions[line.id] ?? []
              return (
                <tr key={line.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">{shortDate(line.lineDate)}</td>
                  <td className="px-4 py-3">
                    <p>{line.label}</p>
                    <p className="text-muted-foreground">{line.reference}</p>
                  </td>
                  <td className="px-4 py-3">{money(line.amount)}{open <= 0.001 ? '' : ` · ${money(open)}`}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      {ideas.map((idea) => (
                        <Button
                          key={`${idea.kind}-${idea.label}-${idea.amount}`}
                          size="sm"
                          variant="secondary"
                          onClick={() => apply.mutate({
                            lineId: line.id,
                            body: idea.kind === 'rule'
                              ? { kind: 'rule', action: idea.action, accountCode: idea.accountCode, amount: idea.amount }
                              : { kind: idea.kind, invoiceId: idea.invoiceId, amount: idea.amount },
                          })}
                        >
                          {t('bank.match')} {idea.label}
                        </Button>
                      ))}
                      {open > 0.001 ? (
                        <Button size="sm" onClick={() => apply.mutate({ lineId: line.id, body: { kind: 'rule', action: 'fee', accountCode: '6607' } })}>{t('bank.fee')}</Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Balance({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-serif text-2xl">{value}</p>
    </div>
  )
}
