import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { accessModels, isAccessModel, isGroupKey } from '../../shared/access.ts'

type Grant = { model: string; canRead: boolean; canWrite: boolean; canCreate: boolean; canDelete: boolean }
type Rule = { id: number; model: string; name: string; field: string; op: string; value: string }
type Group = { key: string; name: string; grants: Grant[]; rules: Rule[]; members: Array<{ userId: number }> }
type Person = { id: number; name: string; email: string; role: string }
type Snapshot = { groups: Group[]; users: Person[] }

const groupOrder = ['internal', 'manager', 'settings'] as const

function groupLabel(key: string, t: Translate) {
  if (!isGroupKey(key)) return key
  switch (key) {
    case 'internal':
      return t('access.group.internal')
    case 'manager':
      return t('access.group.manager')
    case 'settings':
      return t('access.group.settings')
    default: {
      const unexpected: never = key
      return unexpected
    }
  }
}

function modelLabel(model: string, t: Translate) {
  if (!isAccessModel(model)) return model
  switch (model) {
    case 'desk.record':
      return t('access.model.desk')
    case 'sale.order':
      return t('access.model.sale')
    case 'purchase.order':
      return t('access.model.purchase')
    case 'mrp.order':
      return t('access.model.mrp')
    case 'stock.transfer':
      return t('access.model.transfer')
    case 'stock.valuation':
      return t('access.model.valuation')
    case 'account.move':
      return t('access.model.move')
    case 'bank.statement':
      return t('access.model.bank')
    default: {
      const unexpected: never = model
      return unexpected
    }
  }
}

export function AccessPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const snapshot = useQuery({ queryKey: ['access'], queryFn: () => api<Snapshot>('/api/access') })
  const [groupKey, setGroupKey] = useState('internal')
  const [error, setError] = useState('')
  const [rule, setRule] = useState({ name: '', model: 'desk.record', field: 'owner', op: 'eq', value: '' })

  const saveMembers = useMutation({
    mutationFn: (input: { userId: number; groups: string[] }) => api<Snapshot>('/api/access/members', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['access'], data)
      setError('')
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })

  const saveGrant = useMutation({
    mutationFn: (input: Grant & { groupKey: string }) => api<Snapshot>('/api/access/grants', { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (data) => queryClient.setQueryData(['access'], data),
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })

  const addRule = useMutation({
    mutationFn: () => api<Snapshot>('/api/access/rules', { method: 'POST', body: JSON.stringify({ ...rule, groupKey }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['access'], data)
      setRule({ ...rule, name: '', value: '' })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })

  if (snapshot.isLoading) return <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p>
  if (snapshot.isError) return <p className="text-sm text-destructive">{snapshot.error.message}</p>
  const data = snapshot.data
  if (!data) return null
  const group = data.groups.find((row) => row.key === groupKey) ?? data.groups[0]
  if (!group) return null

  return (
    <div className="grid gap-8">
      <div>
        <Link className="text-sm text-muted-foreground hover:underline" to="/admin/users">{t('menu.people')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{t('access.title')}</h1>
        <p className="mt-1 max-w-2xl text-muted-foreground">{t('access.lead')}</p>
      </div>
      {error ? <Notice message={error} /> : null}
      <section className="overflow-x-auto rounded-lg border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 font-semibold">{t('access.people')}</h2>
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t('desk.name')}</th>
              {groupOrder.map((key) => <th key={key} className="px-4 py-2 font-medium">{groupLabel(key, t)}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.users.map((person) => {
              const selected = new Set(data.groups.filter((row) => row.members.some((member) => member.userId === person.id)).map((row) => row.key))
              return (
                <tr key={person.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <p className="font-semibold">{person.name}</p>
                    <p className="text-muted-foreground">{person.email}</p>
                  </td>
                  {groupOrder.map((key) => (
                    <td key={key} className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${person.name} ${key}`}
                        checked={selected.has(key)}
                        onChange={(event) => {
                          const next = new Set(selected)
                          if (event.target.checked) next.add(key)
                          else next.delete(key)
                          saveMembers.mutate({ userId: person.id, groups: [...next] })
                        }}
                      />
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <section className="grid gap-3">
        <label className="flex items-center gap-2 text-sm">
          <Select aria-label={groupLabel(group.key, t)} className="h-8 w-auto" value={group.key} onChange={(event) => setGroupKey(event.target.value)}>
            {data.groups.map((row) => <option key={row.key} value={row.key}>{groupLabel(row.key, t)}</option>)}
          </Select>
        </label>
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">{t('desk.name')}</th>
                <th className="px-4 py-2 font-medium">{t('access.read')}</th>
                <th className="px-4 py-2 font-medium">{t('access.write')}</th>
                <th className="px-4 py-2 font-medium">{t('access.create')}</th>
                <th className="px-4 py-2 font-medium">{t('access.delete')}</th>
              </tr>
            </thead>
            <tbody>
              {group.grants.map((grant) => (
                <tr key={grant.model} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{modelLabel(grant.model, t)}</td>
                  {(['canRead', 'canWrite', 'canCreate', 'canDelete'] as const).map((flag) => (
                    <td key={flag} className="px-4 py-2">
                      <input
                        type="checkbox"
                        aria-label={`${group.key} ${grant.model} ${flag}`}
                        checked={grant[flag]}
                        onChange={(event) => saveGrant.mutate({ ...grant, groupKey: group.key, [flag]: event.target.checked })}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid max-w-3xl gap-3">
        <h2 className="font-semibold">{t('access.rules')}</h2>
        <ul className="grid gap-1 text-sm">
          {group.rules.map((row) => (
            <li key={row.id}>{row.name} · {modelLabel(row.model, t)} · {row.field} {row.op} {row.value}</li>
          ))}
        </ul>
        <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
          <Field label={t('access.ruleName')}><Input value={rule.name} onChange={(event) => setRule({ ...rule, name: event.target.value })} /></Field>
          <Field label={t('access.model')}>
            <Select value={rule.model} onChange={(event) => setRule({ ...rule, model: event.target.value })}>
              {accessModels.map((model) => <option key={model} value={model}>{modelLabel(model, t)}</option>)}
            </Select>
          </Field>
          <Field label={t('access.field')}><Input value={rule.field} onChange={(event) => setRule({ ...rule, field: event.target.value })} /></Field>
          <Field label={t('access.value')}><Input value={rule.value} onChange={(event) => setRule({ ...rule, value: event.target.value })} /></Field>
        </div>
        <div><Button onClick={() => addRule.mutate()} disabled={addRule.isPending}>{t('access.addRule')}</Button></div>
      </section>
    </div>
  )
}
