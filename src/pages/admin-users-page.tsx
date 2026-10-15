import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { DeskUser, User } from '../lib/types.ts'
import type { Role } from '../../shared/roles.ts'

const selectClass = 'h-10 w-full rounded-md border border-border bg-card px-3 text-sm'

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
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'user' as Role })
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

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('people.title')}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">{t('people.lead')}</p>
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
          <select
            className={selectClass}
            value={form.role}
            onChange={(event) => {
              const role = event.target.value
              if (role === 'admin' || role === 'user') setForm({ ...form, role })
            }}
          >
            <option value="user">{t('role.user')}</option>
            <option value="admin">{t('role.admin')}</option>
          </select>
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : t('people.create')}
        </Button>
      </form>
    </div>
  )
}
