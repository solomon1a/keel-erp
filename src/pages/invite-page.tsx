import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AuthFrame } from '../components/auth-frame.tsx'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Preview = {
  companyName: string
  email: string
  role: 'admin' | 'user'
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
}

function roleLabel(role: Preview['role'], t: (key: 'role.admin' | 'role.user') => string) {
  switch (role) {
    case 'admin':
      return t('role.admin')
    case 'user':
      return t('role.user')
    default: {
      const unexpected: never = role
      return unexpected
    }
  }
}

export function InvitePage() {
  const { token } = useParams()
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<Preview>(`/api/invites/${token}`),
    enabled: Boolean(token),
    retry: false,
  })
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setPending(true)
    try {
      await api('/api/invites/accept', { method: 'POST', body: JSON.stringify({ token, name, password }) })
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      window.location.assign('/')
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('invite.failed'))
      setPending(false)
    }
  }

  return (
    <AuthFrame mode="sign-in">
      <h1 className="font-serif text-3xl tracking-tight">{t('invite.title')}</h1>
      {preview.isLoading ? <p className="mt-3 text-sm text-muted-foreground">{t('invite.loading')}</p> : null}
      {preview.isError ? <div className="mt-4"><Notice message={t('invite.missing')} /></div> : null}
      {preview.data && preview.data.status !== 'pending' ? (
        <div className="mt-4 grid gap-3">
          <Notice message={t(statusKey(preview.data.status))} />
          <Link className="text-sm font-medium text-primary hover:underline" to="/sign-in">{t('auth.signIn')}</Link>
        </div>
      ) : null}
      {preview.data?.status === 'pending' ? (
        <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
          <p className="text-sm text-muted-foreground">
            {t('invite.lead', { company: preview.data.companyName, email: preview.data.email, role: roleLabel(preview.data.role, t) })}
          </p>
          {error ? <Notice message={error} /> : null}
          <Field label={t('invite.name')}>
            <Input value={name} onChange={(event) => setName(event.target.value)} required />
          </Field>
          <Field label={t('invite.password')} hint={t('people.passwordHint')}>
            <Input type="password" autoComplete="new-password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
          </Field>
          <Button type="submit" disabled={pending}>{pending ? t('common.saving') : t('invite.submit')}</Button>
        </form>
      ) : null}
    </AuthFrame>
  )
}

function statusKey(status: Preview['status']): 'invite.expired' | 'invite.revoked' | 'invite.accepted' | 'invite.missing' {
  switch (status) {
    case 'expired':
      return 'invite.expired'
    case 'revoked':
      return 'invite.revoked'
    case 'accepted':
      return 'invite.accepted'
    case 'pending':
      return 'invite.missing'
    default: {
      const unexpected: never = status
      return unexpected
    }
  }
}
