import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { locationChoices } from '../components/warehouse-field.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { Product, Warehouse } from '../lib/types.ts'

type DraftLine = { productId: string; quantity: string; lotName: string }

type TransferDetail = {
  id: number
  name: string
  state: string
  locationFromId: number
  locationToId: number
  lines: Array<{ productId: number; quantity: number; lotName: string | null }>
}

const blankLine = (): DraftLine => ({ productId: '', quantity: '1', lotName: '' })

export function TransferFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [locationFromId, setLocationFromId] = useState('')
  const [locationToId, setLocationToId] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([blankLine()])
  const [error, setError] = useState('')

  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const transfer = useQuery({
    queryKey: ['transfer', id],
    queryFn: () => api<TransferDetail>(`/api/transfers/${id}`),
    enabled: !isNew,
  })

  const goods = products.data?.filter((product) => product.active && product.type === 'product') ?? []
  const locations = locationChoices(warehouses.data)

  useEffect(() => {
    if (!transfer.data) return
    setLocationFromId(String(transfer.data.locationFromId))
    setLocationToId(String(transfer.data.locationToId))
    setLines(
      transfer.data.lines.map((line) => ({
        productId: String(line.productId),
        quantity: String(line.quantity),
        lotName: line.lotName ?? '',
      })),
    )
  }, [transfer.data])

  const save = useMutation({
    mutationFn: () =>
      api<TransferDetail>(isNew ? '/api/transfers' : `/api/transfers/${id}`, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify({
          locationFromId: Number(locationFromId),
          locationToId: Number(locationToId),
          lines: lines.map((line) => {
            const product = goods.find((item) => item.id === Number(line.productId))
            return {
              productId: Number(line.productId),
              quantity: Number(line.quantity),
              ...(product && product.tracking !== 'none' ? { lotName: line.lotName } : {}),
            }
          }),
        }),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['transfers'] })
      await queryClient.invalidateQueries({ queryKey: ['transfer', String(saved.id)] })
      navigate(`/inventory/transfers/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('tr.saveFailed')),
  })

  if (transfer.isLoading) return <p className="text-sm text-muted-foreground">{t('tr.loading')}</p>
  if (transfer.isError) return <p className="text-sm text-destructive">{transfer.error.message}</p>
  if (transfer.data && transfer.data.state !== 'draft') {
    return (
      <p className="text-sm">
        {t('tr.locked')} <Link className="underline" to={`/inventory/transfers/${id}`}>{t('tr.back')}</Link>
      </p>
    )
  }

  return (
    <form
      className="grid gap-6"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        save.mutate()
      }}
    >
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? t('tr.new') : transfer.data?.name}</h1>
        <p className="mt-1 text-muted-foreground">{t('tr.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t('tr.from')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={locationFromId} onChange={(event) => setLocationFromId(event.target.value)} required>
            <option value="">{t('stock.chooseLocation')}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.label}</option>
            ))}
          </select>
        </Field>
        <Field label={t('tr.to')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={locationToId} onChange={(event) => setLocationToId(event.target.value)} required>
            <option value="">{t('stock.chooseLocation')}</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>{location.label}</option>
            ))}
          </select>
        </Field>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-3 py-3 font-medium">{t('stock.product')}</th>
              <th className="px-3 py-3 font-medium">{t('ledger.qty')}</th>
              <th className="px-3 py-3 font-medium">{t('tr.lot')}</th>
              <th className="px-3 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const product = goods.find((item) => item.id === Number(line.productId))
              const tracked = product && product.tracking !== 'none'
              return (
                <tr key={index} className="border-b border-border last:border-0">
                  <td className="px-3 py-2">
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-2"
                      value={line.productId}
                      onChange={(event) => {
                        const next = [...lines]
                        next[index] = { ...line, productId: event.target.value, lotName: '' }
                        setLines(next)
                      }}
                      required
                    >
                      <option value="">{t('stock.choose')}</option>
                      {goods.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      type="number"
                      min="0"
                      step="0.001"
                      value={line.quantity}
                      onChange={(event) => {
                        const next = [...lines]
                        next[index] = { ...line, quantity: event.target.value }
                        setLines(next)
                      }}
                      required
                    />
                  </td>
                  <td className="px-3 py-2">
                    {tracked ? (
                      <Input
                        value={line.lotName}
                        onChange={(event) => {
                          const next = [...lines]
                          next[index] = { ...line, lotName: event.target.value }
                          setLines(next)
                        }}
                        required
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {lines.length > 1 ? (
                      <Button type="button" variant="ghost" onClick={() => setLines(lines.filter((_, lineIndex) => lineIndex !== index))}>
                        {t('tr.remove')}
                      </Button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={() => setLines([...lines, blankLine()])}>{t('tr.addLine')}</Button>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('tr.save')}</Button>
        <Link to={isNew ? '/inventory/transfers' : `/inventory/transfers/${id}`}><Button type="button" variant="outline">{t('common.cancel')}</Button></Link>
      </div>
    </form>
  )
}
