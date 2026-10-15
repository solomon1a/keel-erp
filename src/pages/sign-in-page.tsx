import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { User } from '../lib/types.ts'

export function SignInPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
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
      setError(caught instanceof ApiError ? caught.message : 'Sign-in failed.')
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">Northline Goods</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Sign in</h1>
      <p className="mt-3 text-muted-foreground">
        Use the email and password for your desk account. The session stays in a cookie on this browser.
      </p>
      {me.isLoading ? <p className="mt-8 text-sm text-muted-foreground">Checking the desk…</p> : null}
      {me.isLoading ? null : (
        <form className="mt-8 grid gap-4" onSubmit={onSubmit}>
          {error ? <Notice message={error} /> : null}
          <Field label="Email">
            <Input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoFocus
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      )}
    </div>
  )
}
