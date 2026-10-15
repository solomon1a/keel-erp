import { useState, type FormEvent } from 'react'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

export function PasswordPage() {
  const { t } = useI18n()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaved(false)
    if (newPassword !== confirmPassword) {
      setError(t('password.mismatch'))
      return
    }
    setError('')
    setPending(true)
    try {
      await api('/api/session/password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setSaved(true)
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : t('password.failed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-lg gap-6">
      <div>
        <h1 className="font-serif text-4xl tracking-tight">{t('password.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('password.lead')}</p>
      </div>
      <form className="grid gap-4 rounded-lg border border-border bg-card p-4" onSubmit={onSubmit}>
        {error ? <Notice message={error} /> : null}
        {saved ? <p className="text-sm">{t('password.saved')}</p> : null}
        <Field label={t('password.current')}>
          <Input
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </Field>
        <Field label={t('password.new')}>
          <Input
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
            minLength={8}
          />
        </Field>
        <Field label={t('password.confirm')}>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            minLength={8}
          />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? t('common.saving') : t('password.submit')}
        </Button>
      </form>
    </div>
  )
}
