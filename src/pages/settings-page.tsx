import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { FapiaoNote } from '../components/money-totals.tsx'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { User } from '../lib/types.ts'
import { currencyCodes } from '../../shared/schemas.ts'

type Settings = {
  name: string
  city: string
  currency: string
  defaultTaxRate: number
}

export function SettingsPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const settings = useQuery({ queryKey: ['settings'], queryFn: () => api<Settings>('/api/settings') })
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('CNY')
  const [taxRate, setTaxRate] = useState('13')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)
  const isAdmin = me.data?.role === 'admin'

  useEffect(() => {
    if (!settings.data) return
    setName(settings.data.name)
    setCurrency(settings.data.currency)
    setTaxRate(String(settings.data.defaultTaxRate))
  }, [settings.data])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setSaved(false)
    setPending(true)
    try {
      const next = await api<Settings>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          currency,
          defaultTaxRate: Number(taxRate),
        }),
      })
      queryClient.setQueryData(['settings'], next)
      queryClient.setQueryData<User>(['me'], (current) =>
        current
          ? {
              ...current,
              company: {
                ...current.company,
                name: next.name,
                currency: next.currency,
                defaultTaxRate: next.defaultTaxRate,
              },
            }
          : current,
      )
      await queryClient.invalidateQueries({ queryKey: ['taxes'] })
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('settings.failed'))
    } finally {
      setPending(false)
    }
  }

  if (settings.isLoading) return <p className="text-sm text-muted-foreground">{t('settings.loading')}</p>
  if (settings.isError) return <p className="text-sm text-destructive">{settings.error.message}</p>

  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('settings.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('settings.lead')}</p>
      </div>
      <form className="grid gap-4 rounded-lg border border-border bg-card p-4" onSubmit={onSubmit}>
        {error ? <Notice message={error} /> : null}
        {saved ? <p className="text-sm">{t('settings.saved')}</p> : null}
        {!isAdmin ? <p className="text-sm text-muted-foreground">{t('settings.adminOnly')}</p> : null}
        <Field label={t('settings.name')}>
          <Input value={name} onChange={(event) => setName(event.target.value)} required disabled={!isAdmin} />
        </Field>
        <Field label={t('settings.city')}>
          <Input value={settings.data?.city ?? ''} disabled />
        </Field>
        <Field label={t('settings.currency')} hint={t('settings.currencyHint')}>
          <select
            className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm"
            value={currency}
            disabled={!isAdmin}
            onChange={(event) => setCurrency(event.target.value)}
          >
            {currencyCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('settings.tax')} hint={t('settings.taxHint')}>
          <Input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={taxRate}
            disabled={!isAdmin}
            onChange={(event) => setTaxRate(event.target.value)}
            required
          />
        </Field>
        {isAdmin ? (
          <Button type="submit" disabled={pending}>
            {pending ? t('common.saving') : t('settings.save')}
          </Button>
        ) : null}
      </form>
      <FapiaoNote />
    </div>
  )
}
