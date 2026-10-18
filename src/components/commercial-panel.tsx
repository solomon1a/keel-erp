import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Notice } from './field.tsx'
import { Button } from './ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Options = {
  lists: Array<{ id: number; name: string; side: string }>
  terms: Array<{ id: number; name: string }>
  positions: Array<{ id: number; name: string }>
}

type Assigned = {
  salePriceListId: number | null
  purchasePriceListId: number | null
  paymentTermId: number | null
  fiscalPositionId: number | null
}

export function CommercialPanel({ contactId, assigned }: { contactId: number; assigned: Assigned }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const options = useQuery({ queryKey: ['commercial'], queryFn: () => api<Options>('/api/commercial') })
  const [form, setForm] = useState(assigned)
  const [message, setMessage] = useState('')
  useEffect(() => {
    setForm({
      salePriceListId: assigned.salePriceListId,
      purchasePriceListId: assigned.purchasePriceListId,
      paymentTermId: assigned.paymentTermId,
      fiscalPositionId: assigned.fiscalPositionId,
    })
  }, [assigned.salePriceListId, assigned.purchasePriceListId, assigned.paymentTermId, assigned.fiscalPositionId])
  const save = useMutation({
    mutationFn: () => api('/api/contacts/' + contactId + '/commercial', { method: 'PATCH', body: JSON.stringify(form) }),
    onSuccess: async () => {
      setMessage(t('phase.applied'))
      await queryClient.invalidateQueries({ queryKey: ['contact', String(contactId)] })
    },
    onError: (reason) => setMessage(reason instanceof ApiError ? reason.message : t('phase.commercial')),
  })
  const sales = (options.data?.lists ?? []).filter((list) => list.side === 'sales')
  const purchase = (options.data?.lists ?? []).filter((list) => list.side === 'purchase')
  return (
    <div className="grid gap-3 rounded-lg border border-border bg-card p-4 text-sm">
      <p className="font-semibold">{t('phase.commercial')}</p>
      <label className="grid gap-1">
        {t('phase.saleList')}
        <select className="h-10 rounded-md border border-border bg-card px-3" value={form.salePriceListId ?? ''} onChange={(event) => setForm({ ...form, salePriceListId: event.target.value ? Number(event.target.value) : null })}>
          <option value="">{t('phase.none')}</option>
          {sales.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1">
        {t('phase.buyList')}
        <select className="h-10 rounded-md border border-border bg-card px-3" value={form.purchasePriceListId ?? ''} onChange={(event) => setForm({ ...form, purchasePriceListId: event.target.value ? Number(event.target.value) : null })}>
          <option value="">{t('phase.none')}</option>
          {purchase.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1">
        {t('phase.term')}
        <select className="h-10 rounded-md border border-border bg-card px-3" value={form.paymentTermId ?? ''} onChange={(event) => setForm({ ...form, paymentTermId: event.target.value ? Number(event.target.value) : null })}>
          <option value="">{t('phase.none')}</option>
          {(options.data?.terms ?? []).map((term) => <option key={term.id} value={term.id}>{term.name}</option>)}
        </select>
      </label>
      <label className="grid gap-1">
        {t('phase.fiscal')}
        <select className="h-10 rounded-md border border-border bg-card px-3" value={form.fiscalPositionId ?? ''} onChange={(event) => setForm({ ...form, fiscalPositionId: event.target.value ? Number(event.target.value) : null })}>
          <option value="">{t('phase.none')}</option>
          {(options.data?.positions ?? []).map((position) => <option key={position.id} value={position.id}>{position.name}</option>)}
        </select>
      </label>
      <Button type="button" variant="outline" disabled={save.isPending} onClick={() => save.mutate()}>{t('phase.apply')}</Button>
      {message ? <Notice message={message} /> : null}
    </div>
  )
}
