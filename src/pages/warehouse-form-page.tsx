import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { Warehouse } from '../lib/types.ts'

export function WarehouseFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [error, setError] = useState('')

  const warehouses = useQuery({ queryKey: ['warehouses'], queryFn: () => api<Warehouse[]>('/api/warehouses') })
  const existing = warehouses.data?.find((warehouse) => warehouse.id === Number(id))

  useEffect(() => {
    if (!existing) return
    setName(existing.name)
    setCode(existing.code)
    setIsDefault(existing.isDefault)
  }, [existing])

  const save = useMutation({
    mutationFn: () =>
      api<Warehouse>(isNew ? '/api/warehouses' : `/api/warehouses/${id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify({ name, code, isDefault }),
      }),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['warehouses'] })
      navigate(`/inventory/warehouses/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('wh.failed')),
  })

  if (!isNew && warehouses.isLoading) return <p className="text-sm text-muted-foreground">{t('wh.loading')}</p>
  if (!isNew && warehouses.isError) return <p className="text-sm text-destructive">{warehouses.error.message}</p>
  if (!isNew && warehouses.data && !existing) return <p className="text-sm text-destructive">{t('wh.failed')}</p>

  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        setError('')
        save.mutate()
      }}
    >
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{isNew ? t('wh.new') : name}</h1>
        <p className="mt-1 text-muted-foreground">{t('wh.defaultHint')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <Field label={t('wh.name')}>
        <Input value={name} onChange={(event) => setName(event.target.value)} required />
      </Field>
      <Field label={t('wh.code')}>
        <Input value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} maxLength={12} required />
      </Field>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isDefault}
          disabled={existing?.isDefault}
          onChange={(event) => setIsDefault(event.target.checked)}
        />
        {t('wh.default')}
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('wh.save')}</Button>
        <Link to={isNew ? '/inventory/warehouses' : `/inventory/warehouses/${id}`}><Button type="button" variant="outline">{t('common.cancel')}</Button></Link>
      </div>
    </form>
  )
}
