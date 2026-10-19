import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney } from '../lib/format.ts'

type Side = 'sales' | 'purchase'

type Product = { id: number; name: string; sku: string }

type Item = {
  id: number
  minQty: number
  price: number
  product: { id: number; name: string; sku: string }
}

type PriceList = {
  id: number
  name: string
  side: string
  items: Item[]
}

function asSide(value: string | null): Side {
  return value === 'purchase' ? 'purchase' : 'sales'
}

function sideLabel(side: Side, t: Translate) {
  switch (side) {
    case 'sales':
      return t('phase.sideSales')
    case 'purchase':
      return t('phase.sidePurchase')
    default: {
      const unexpected: never = side
      return unexpected
    }
  }
}

function message(reason: unknown, fallback: string) {
  return reason instanceof ApiError ? reason.message : fallback
}

export function PricelistsPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const side = asSide(params.get('side'))
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const lists = useQuery({
    queryKey: ['price-lists', side],
    queryFn: () => api<PriceList[]>(`/api/price-lists?side=${side}`),
  })
  const create = useMutation({
    mutationFn: () => api('/api/price-lists', { method: 'POST', body: JSON.stringify({ name, side }) }),
    onSuccess: async () => {
      setName('')
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['price-lists', side] })
    },
    onError: (reason) => setError(message(reason, t('desk.failed'))),
  })

  function onCreate(event: FormEvent) {
    event.preventDefault()
    create.mutate()
  }

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('phase.lists')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('phase.listsLead')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(['sales', 'purchase'] as const).map((item) => (
          <Button key={item} type="button" size="sm" variant={side === item ? 'secondary' : 'outline'} onClick={() => setParams(item === 'sales' ? {} : { side: item })}>
            {sideLabel(item, t)}
          </Button>
        ))}
      </div>
      {error ? <Notice message={error} /> : null}
      <form className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_auto] sm:items-end" onSubmit={onCreate}>
        <Field label={t('phase.listName')}>
          <Input value={name} onChange={(event) => setName(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={create.isPending}>{t('phase.newList')}</Button>
      </form>
      {lists.isLoading ? <p className="text-sm text-muted-foreground">{t('order.loading')}</p> : null}
      {lists.isError ? <Notice message={lists.error.message} /> : null}
      {lists.data && lists.data.length === 0 ? <EmptyState title={t('phase.listsEmpty')} body={t('phase.listsLead')} /> : null}
      <div className="grid gap-4">
        {lists.data?.map((list) => (
          <PriceListCard key={list.id} list={list} side={side} onError={setError} />
        ))}
      </div>
    </div>
  )
}

function PriceListCard({ list, side, onError }: { list: PriceList; side: Side; onError: (message: string) => void }) {
  const { t } = useI18n()
  const money = useMoney()
  const queryClient = useQueryClient()
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const [drafts, setDrafts] = useState<Record<number, { minQty: string; price: string }>>({})
  const [line, setLine] = useState({ productId: '', minQty: '0', price: '' })

  async function refresh() {
    onError('')
    await queryClient.invalidateQueries({ queryKey: ['price-lists', side] })
  }

  const save = useMutation({
    mutationFn: (item: Item) => {
      const draft = drafts[item.id]
      return api(`/api/price-lists/${list.id}/items/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          minQty: Number(draft?.minQty ?? item.minQty),
          price: Number(draft?.price ?? item.price),
        }),
      })
    },
    onSuccess: refresh,
    onError: (reason) => onError(message(reason, t('desk.failed'))),
  })
  const remove = useMutation({
    mutationFn: (itemId: number) => api(`/api/price-lists/${list.id}/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError: (reason) => onError(message(reason, t('desk.failed'))),
  })
  const add = useMutation({
    mutationFn: () => api(`/api/price-lists/${list.id}/items`, {
      method: 'POST',
      body: JSON.stringify({ productId: Number(line.productId), minQty: Number(line.minQty), price: Number(line.price) }),
    }),
    onSuccess: async () => {
      setLine({ productId: '', minQty: '0', price: '' })
      await refresh()
    },
    onError: (reason) => onError(message(reason, t('desk.failed'))),
  })

  return (
    <article className="keel-glass rounded-[28px] p-5">
      <h2 className="font-serif text-2xl">{list.name}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{sideLabel(side, t)}</p>
      <div className="mt-4 grid gap-3">
        {list.items.map((item) => {
          const draft = drafts[item.id] ?? { minQty: String(item.minQty), price: String(item.price) }
          return (
            <div key={item.id} className="grid gap-2 rounded-lg border border-border bg-card p-3 md:grid-cols-[1.4fr_0.7fr_0.8fr_auto] md:items-end">
              <div>
                <p className="text-sm font-medium">{item.product.name}</p>
                <p className="text-xs text-muted-foreground">{item.product.sku} · {money(item.price)}</p>
              </div>
              <Field label={t('phase.minQty')}>
                <Input value={draft.minQty} onChange={(event) => setDrafts({ ...drafts, [item.id]: { ...draft, minQty: event.target.value } })} />
              </Field>
              <Field label={t('phase.price')}>
                <Input value={draft.price} onChange={(event) => setDrafts({ ...drafts, [item.id]: { ...draft, price: event.target.value } })} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => save.mutate(item)}>{t('phase.saveLine')}</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => remove.mutate(item.id)}>{t('phase.remove')}</Button>
              </div>
            </div>
          )
        })}
      </div>
      <form
        className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-[1.4fr_0.7fr_0.8fr_auto] md:items-end"
        onSubmit={(event) => { event.preventDefault(); add.mutate() }}
      >
        <Field label={t('phase.product')}>
          <Select value={line.productId} required onChange={(event) => setLine({ ...line, productId: event.target.value })}>
            <option value="">{t('phase.product')}</option>
            {(products.data ?? []).map((product) => (
              <option key={product.id} value={product.id}>{product.name} · {product.sku}</option>
            ))}
          </Select>
        </Field>
        <Field label={t('phase.minQty')}>
          <Input value={line.minQty} onChange={(event) => setLine({ ...line, minQty: event.target.value })} />
        </Field>
        <Field label={t('phase.price')}>
          <Input value={line.price} required onChange={(event) => setLine({ ...line, price: event.target.value })} />
        </Field>
        <Button type="submit">{t('phase.addLine')}</Button>
      </form>
    </article>
  )
}
