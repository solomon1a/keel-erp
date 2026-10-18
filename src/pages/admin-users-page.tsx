import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { DeskUser, User } from '../lib/types.ts'
import type { Role } from '../../shared/roles.ts'

type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'
type InviteRow = { id: number; email: string; role: Role; status: InviteStatus; expiresAt: string }
type IssuedInvite = { link: string; emailed: boolean; channel: string }

function roleText(role: Role, t: Translate) {
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

function statusText(status: InviteStatus, t: Translate) {
  switch (status) {
    case 'pending':
      return t('people.status.pending')
    case 'accepted':
      return t('people.status.accepted')
    case 'revoked':
      return t('people.status.revoked')
    case 'expired':
      return t('people.status.expired')
    default: {
      const unexpected: never = status
      return unexpected
    }
  }
}

export function AdminUsersPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const me = useQuery({ queryKey: ['me'], queryFn: () => api<User>('/api/session/me'), retry: false })
  const users = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api<DeskUser[]>('/api/admin/users'),
    enabled: me.data?.role === 'admin',
    retry: false,
  })
  const invites = useQuery({
    queryKey: ['invites'],
    queryFn: () => api<InviteRow[]>('/api/invites'),
    enabled: me.data?.role === 'admin',
    retry: false,
  })
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' as Role })
  const [invite, setInvite] = useState({ email: '', role: 'user' as Role })
  const [issued, setIssued] = useState<IssuedInvite | null>(null)
  const [copied, setCopied] = useState(false)
  const [resets, setResets] = useState<Record<number, string>>({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(false)

  if (me.isLoading) return <p className="text-sm text-muted-foreground">{t('people.checking')}</p>
  if (me.data?.role !== 'admin') {
    return <Notice message={t('people.forbidden')} />
  }

  async function createUser(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    setPending(true)
    try {
      const created = await api<DeskUser>('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setForm({ name: '', email: '', password: '', role: 'user' })
      setNotice(t('people.created', { name: created.name }))
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('people.createFailed'))
    } finally {
      setPending(false)
    }
  }

  async function resetPassword(user: DeskUser) {
    const password = resets[user.id]?.trim() ?? ''
    setError('')
    setNotice('')
    if (password.length < 8) {
      setError(t('people.short'))
      return
    }
    setPending(true)
    try {
      await api(`/api/admin/users/${user.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      })
      setResets((current) => ({ ...current, [user.id]: '' }))
      setNotice(t('people.resetDone', { name: user.name }))
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('people.resetFailed'))
    } finally {
      setPending(false)
    }
  }

  async function sendInvite(event: FormEvent) {
    event.preventDefault()
    setError('')
    setNotice('')
    setPending(true)
    try {
      const created = await api<IssuedInvite & InviteRow>('/api/invites', {
        method: 'POST',
        body: JSON.stringify(invite),
      })
      setInvite({ email: '', role: 'user' })
      setIssued({ link: created.link, emailed: created.emailed, channel: created.channel })
      setCopied(false)
      await queryClient.invalidateQueries({ queryKey: ['invites'] })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('people.inviteFailed'))
    } finally {
      setPending(false)
    }
  }

  async function changeInvite(id: number, action: 'resend' | 'revoke') {
    setError('')
    setPending(true)
    try {
      const result = await api<IssuedInvite & InviteRow>(`/api/invites/${id}/${action}`, { method: 'POST' })
      if (action === 'resend' && result.link) {
        setIssued({ link: result.link, emailed: result.emailed, channel: result.channel })
        setCopied(false)
      }
      await queryClient.invalidateQueries({ queryKey: ['invites'] })
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('people.inviteFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('people.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('people.lead')}</p>
        <Link className="mt-3 inline-block text-sm font-medium text-primary hover:underline" to="/settings/access">{t('access.title')}</Link>
      </div>
      {error ? <Notice message={error} /> : null}
      {notice ? <p className="text-sm">{notice}</p> : null}
      {users.isLoading ? <p className="text-sm text-muted-foreground">{t('people.loading')}</p> : null}
      {users.isError ? <Notice message={users.error.message} /> : null}
      <div className="grid gap-3">
        {users.data?.map((user) => (
          <article key={user.id} className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-[1fr_16rem_auto] md:items-end">
            <div>
              <p className="font-serif text-2xl">{user.name}</p>
              <p className="text-sm text-muted-foreground">
                {user.email} · {roleText(user.role, t)}
              </p>
            </div>
            <Field label={t('people.newPassword')}>
              <Input
                type="password"
                autoComplete="new-password"
                value={resets[user.id] ?? ''}
                onChange={(event) => setResets((current) => ({ ...current, [user.id]: event.target.value }))}
              />
            </Field>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => resetPassword(user)}>
              {t('people.reset')}
            </Button>
          </article>
        ))}
      </div>
      <section className="grid gap-3">
        <h2 className="font-serif text-2xl">{t('people.inviteList')}</h2>
        {invites.data?.length === 0 ? <p className="text-sm text-muted-foreground">{t('people.inviteEmpty')}</p> : null}
        {invites.data?.map((row) => (
          <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
            <div>
              <p className="font-medium">{row.email}</p>
              <p className="text-sm text-muted-foreground">{roleText(row.role, t)} · {statusText(row.status, t)} · {row.expiresAt.slice(0, 10)}</p>
            </div>
            {row.status === 'pending' || row.status === 'expired' || row.status === 'revoked' ? (
              <div className="flex gap-2">
                <Button type="button" variant="secondary" disabled={pending} onClick={() => void changeInvite(row.id, 'resend')}>{t('people.resend')}</Button>
                {row.status === 'pending' ? (
                  <Button type="button" variant="outline" disabled={pending} onClick={() => void changeInvite(row.id, 'revoke')}>{t('people.revoke')}</Button>
                ) : null}
              </div>
            ) : null}
          </article>
        ))}
      </section>
      <form className="grid max-w-lg gap-4 rounded-lg border border-border bg-card p-4" onSubmit={sendInvite}>
        <h2 className="font-serif text-2xl">{t('people.invite')}</h2>
        <p className="text-sm text-muted-foreground">{t('people.inviteLead')}</p>
        <Field label={t('common.email')}>
          <Input type="email" autoComplete="off" value={invite.email} onChange={(event) => setInvite({ ...invite, email: event.target.value })} required />
        </Field>
        <Field label={t('people.role')}>
          <Select
            value={invite.role}
            onChange={(event) => {
              const role = event.target.value
              if (role === 'admin' || role === 'user') setInvite({ ...invite, role })
            }}
          >
            <option value="user">{t('role.user')}</option>
            <option value="admin">{t('role.admin')}</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>{pending ? t('common.saving') : t('people.inviteSend')}</Button>
      </form>
      {issued ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="presentation" onClick={() => setIssued(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="invite-link-title" className="grid w-full max-w-lg gap-4 rounded-lg border border-border bg-card p-5 shadow-xl" onClick={(event) => event.stopPropagation()}>
            <h2 id="invite-link-title" className="font-serif text-2xl">{t('people.inviteLink')}</h2>
            <p className="text-sm text-muted-foreground">{issued.emailed ? t('people.inviteEmailed') : t('people.inviteLogged')}</p>
            <Input readOnly value={issued.link} onFocus={(event) => event.currentTarget.select()} />
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => {
                  void navigator.clipboard.writeText(issued.link).then(() => setCopied(true))
                }}
              >
                {copied ? t('people.inviteCopied') : t('people.inviteCopy')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setIssued(null)}>{t('people.inviteClose')}</Button>
            </div>
          </div>
        </div>
      ) : null}
      <form className="grid max-w-lg gap-4 rounded-lg border border-border bg-card p-4" onSubmit={createUser}>
        <h2 className="font-serif text-2xl">{t('people.add')}</h2>
        <Field label={t('common.name')}>
          <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
        </Field>
        <Field label={t('common.email')}>
          <Input
            type="email"
            autoComplete="off"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
          />
        </Field>
        <Field label={t('people.password')} hint={t('people.passwordHint')}>
          <Input
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required
            minLength={8}
          />
        </Field>
        <Field label={t('people.role')}>
          <Select
            value={form.role}
            onChange={(event) => {
              const role = event.target.value
              if (role === 'admin' || role === 'user') setForm({ ...form, role })
            }}
          >
            <option value="user">{t('role.user')}</option>
            <option value="admin">{t('role.admin')}</option>
          </Select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : t('people.create')}
        </Button>
      </form>
    </div>
  )
}
