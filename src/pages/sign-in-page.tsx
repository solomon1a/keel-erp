import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api.ts'
import { setUserId } from '../lib/session.ts'
import type { User } from '../lib/types.ts'

export function SignInPage() {
  const navigate = useNavigate()
  const users = useQuery({
    queryKey: ['users'],
    queryFn: () => api<User[]>('/api/session/users'),
  })

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold tracking-[0.18em] text-accent uppercase">Northline Goods</p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">Who’s at the desk?</h1>
      <p className="mt-3 max-w-xl text-muted-foreground">
        Keel keeps contacts, quotations, and the stock room for this company. Pick yourself so new records carry your name. Passwords come later.
      </p>
      {users.isLoading ? <p className="mt-8 text-sm">Looking up the team…</p> : null}
      {users.isError ? <p className="mt-8 text-sm text-destructive">{users.error.message}</p> : null}
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {users.data?.map((user) => (
          <button
            key={user.id}
            className="rounded-lg border border-border bg-card p-4 text-left hover:border-primary"
            onClick={() => {
              setUserId(user.id)
              navigate('/')
            }}
          >
            <span className="block font-serif text-2xl">{user.name}</span>
            <span className="text-sm text-muted-foreground">
              {user.role} · {user.company.city}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
