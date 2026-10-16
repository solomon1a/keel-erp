import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AuthFrame } from '../components/auth-frame.tsx'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Locale } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { User } from '../lib/types.ts'

const countries = ['CN', 'GB', 'US', 'OTHER'] as const

type SignedUp = User & { locale: Locale }

export function StartPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t, setLocale } = useI18n()
  const [companyName, setCompanyName] = useState('')
  const [country, setCountry] = useState<(typeof countries)[number]>('US')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loadSample, setLoadSample] = useState(true)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<User>('/api/session/me'),
    retry: false,
  })

  if (me.isSuccess) return <Navigate to="/" replace />

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      const user = await api<SignedUp>('/api/signup', {
        method: 'POST',
        body: JSON.stringify({ companyName, country, name, email, password, loadSample }),
      })
      setLocale(user.locale)
      queryClient.setQueryData(['me'], user)
      navigate('/')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('start.failed'))
    } finally {
      setPending(false)
    }
  }

  function countryLabel(code: (typeof countries)[number]) {
    switch (code) {
      case 'CN':
        return t('start.country.CN')
      case 'GB':
        return t('start.country.GB')
      case 'US':
        return t('start.country.US')
      case 'OTHER':
        return t('start.country.OTHER')
      default: {
        const unexpected: never = code
        return unexpected
      }
    }
  }

  return (
    <AuthFrame mode="start">
      <h1 className="text-[28px] font-bold tracking-tight">{t('start.title')}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t('start.lead')}</p>
      {me.isLoading ? <p className="mt-8 text-sm text-muted-foreground">{t('signIn.checking')}</p> : (
        <form className="mt-6 grid gap-4" onSubmit={onSubmit}>
          {error ? <Notice message={error} /> : null}
          <Field label={t('start.company')}>
            <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required autoFocus />
          </Field>
          <Field label={t('start.country')}>
            <select
              className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm outline-none focus:border-primary focus:ring-[3px] focus:ring-[var(--kl-color-semantic-focus-ring)]"
              value={country}
              onChange={(event) => setCountry(event.target.value as (typeof countries)[number])}
            >
              {countries.map((code) => (
                <option key={code} value={code}>{countryLabel(code)}</option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">{t('start.countryHint')}</p>
          </Field>
          <Field label={t('start.name')}>
            <Input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
          </Field>
          <Field label={t('start.email')}>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
          </Field>
          <Field label={t('start.password')}>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete="new-password" />
          </Field>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={loadSample}
              onChange={(event) => setLoadSample(event.target.checked)}
            />
            <span>
              <span className="font-semibold">{t('start.sample')}</span>
              <span className="mt-0.5 block text-muted-foreground">{t('start.sampleHint')}</span>
            </span>
          </label>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            {pending ? t('start.pending') : t('start.submit')}
          </Button>
        </form>
      )}
    </AuthFrame>
  )
}
