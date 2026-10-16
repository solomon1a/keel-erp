import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { LanguageSwitcher } from '../components/language-switcher.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { User } from '../lib/types.ts'

const demos = [
  ['Jiangbei Goods Co.', 'Maya Chen', 'maya@northline.example', 'keel-maya-desk'],
  ['Jiangbei Goods Co.', 'Jonah Ellis', 'jonah@northline.example', 'keel-jonah-desk'],
  ['Harbour & Line', 'Amira Shah', 'amira@harbourline.example', 'keel-amira-desk'],
  ['Harbour & Line', 'Priya Nair', 'priya@harbourline.example', 'keel-priya-shop'],
  ['Hudson Yard Goods', 'Jordan Hale', 'jordan@hudsonyard.example', 'keel-jordan-desk'],
  ['Hudson Yard Goods', 'Sam Ortiz', 'sam@hudsonyard.example', 'keel-sam-shop'],
  ['Jiangbei shop', 'Lin Xiao', 'lin@northline.example', 'keel-lin-shop'],
] as const

export function SignInPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
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
      const user = await api<User>('/api/session/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      queryClient.setQueryData(['me'], user)
      navigate('/')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('signIn.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <div className="mb-8 flex justify-end">
        <LanguageSwitcher />
      </div>
      <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">{t('signIn.kicker')}</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">{t('signIn.title')}</h1>
      <p className="mt-3 text-muted-foreground">{t('signIn.lead')}</p>
      {me.isLoading ? <p className="mt-8 text-sm text-muted-foreground">{t('signIn.checking')}</p> : null}
      {me.isLoading ? null : (
        <form className="mt-8 grid gap-4" onSubmit={onSubmit}>
          {error ? <Notice message={error} /> : null}
          <Field label={t('signIn.email')}>
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label={t('signIn.password')}>
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? t('signIn.pending') : t('signIn.submit')}
          </Button>
          <p className="text-sm">
            <Link className="font-semibold text-primary" to="/start">{t('signIn.start')}</Link>
          </p>
        </form>
      )}
      <section className="mt-10">
        <h2 className="font-serif text-2xl">{t('signIn.demoTitle')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('signIn.demoLead')}</p>
        <ul className="mt-4 grid gap-3">
          {demos.map(([company, person, emailAddress, passwordValue]) => (
            <li key={emailAddress} className="rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <span className="font-semibold">{company}</span>
              <span className="mt-0.5 block text-muted-foreground">{person}</span>
              <span className="mt-1 block break-all">{emailAddress}</span>
              <span className="block text-muted-foreground">{passwordValue}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
