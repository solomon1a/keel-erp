import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { Warehouse, WarehouseLocation } from '../lib/types.ts'

function LocationRow({ location, onSaved }: { location: WarehouseLocation; onSaved: () => Promise<void> }) {
  const { t } = useI18n()
  const [name, setName] = useState(location.name)
  const [error, setError] = useState('')

  useEffect(() => {
    setName(location.name)
  }, [location.name])

  const rename = useMutation({
    mutationFn: () =>
      api(`/api/locations/${location.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: async () => {
      setError('')
      await onSaved()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('wh.failed')),
  })

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-b border-border px-4 py-3 last:border-0"
      onSubmit={(event) => {
        event.preventDefault()
        rename.mutate()
      }}
    >
      <Field label={t('wh.locationName')}>
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      {location.isDefault ? <span className="pb-2 text-sm text-muted-foreground">{t('wh.defaultShelf')}</span> : null}
      <Button type="submit" variant="outline" disabled={rename.isPending || name === location.name}>{t('wh.rename')}</Button>
      {error ? <p className="w-full text-sm text-destructive">{error}</p> : null}
    </form>
  )
}

export function WarehouseDetailPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [locationName, setLocationName] = useState('')
  const [error, setError] = useState('')
  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const warehouse = warehouses.data?.find((row) => row.id === Number(id))

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['warehouses'] })
  }

  const add = useMutation({
    mutationFn: () =>
      api(`/api/warehouses/${id}/locations`, {
        method: 'POST',
        body: JSON.stringify({ name: locationName }),
      }),
    onSuccess: async () => {
      setLocationName('')
      setError('')
      await refresh()
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('wh.failed')),
  })

  if (warehouses.isLoading) return <p className="text-sm text-muted-foreground">{t('wh.loading')}</p>
  if (warehouses.isError) return <p className="text-sm text-destructive">{warehouses.error.message}</p>
  if (!warehouse) return <p className="text-sm text-destructive">{t('wh.failed')}</p>

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">{warehouse.code}</p>
          <h1 className="font-serif text-4xl tracking-tight">{warehouse.name}</h1>
          {warehouse.isDefault ? <p className="mt-1 text-sm text-muted-foreground">{t('wh.defaultHint')}</p> : null}
        </div>
        <div className="flex gap-2">
          <Link to="/inventory/warehouses"><Button variant="outline">{t('wh.back')}</Button></Link>
          <Link to={`/inventory/warehouses/${warehouse.id}/edit`}><Button variant="outline">{t('wh.edit')}</Button></Link>
        </div>
      </div>
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-serif text-2xl">{t('wh.locations')}</h2>
        {warehouse.locations.length === 0 ? <p className="px-4 py-4 text-sm text-muted-foreground">{t('wh.empty')}</p> : null}
        {warehouse.locations.map((location) => (
          <LocationRow key={location.id} location={location} onSaved={refresh} />
        ))}
      </section>
      <form
        className="grid max-w-xl gap-3 rounded-lg border border-border bg-card p-4"
        onSubmit={(event) => {
          event.preventDefault()
          add.mutate()
        }}
      >
        <h2 className="font-serif text-2xl">{t('wh.addLocation')}</h2>
        {error ? <Notice message={error} /> : null}
        <Field label={t('wh.locationName')}>
          <Input value={locationName} onChange={(event) => setLocationName(event.target.value)} required />
        </Field>
        <Button type="submit" disabled={add.isPending}>{add.isPending ? t('common.saving') : t('wh.addLocation')}</Button>
      </form>
    </div>
  )
}
