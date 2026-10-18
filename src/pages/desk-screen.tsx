import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ExportButton } from '../components/export-button.tsx'
import { EmptyState, Field, Notice } from '../components/field.tsx'
import { PageHeader, Panel, TableFrame, Toolbar } from '../components/surface.tsx'
import { useToast } from '../components/toast.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n, type Translate } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { screenCopy } from '../lib/menu-label.ts'

type SettingField = { key: string; labelEn: string; labelZh: string; value: string }
type AccountRow = { id: number; code: string; name: string; type: string }

function accountTypeText(type: string, t: Translate) {
  switch (type) {
    case 'asset':
      return t('acct.assets')
    case 'liability':
      return t('acct.liabilities')
    case 'equity':
      return t('acct.equity')
    case 'income':
      return t('acct.income')
    case 'expense':
      return t('acct.expense')
    default:
      return type
  }
}

function ComingSoon({ title, lead }: { title: string; lead: string }) {
  const { t } = useI18n()
  return (
    <div className="grid gap-5">
      <PageHeader title={title} lead={lead} />
      <Panel>
        <p className="font-semibold">{t('phase.soon')}</p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{t('phase.soonBody')}</p>
      </Panel>
    </div>
  )
}

export function DeskScreenPage() {
  const { module = '', screen = '' } = useParams()
  const { locale, t } = useI18n()
  const copy = screenCopy(module, screen, locale)
  if (!copy) return <EmptyState title={t('desk.notFound')} body={t('desk.emptyBody')} />
  switch (copy.screen.kind) {
    case 'settings':
      return <SettingsView module={module} title={copy.title} lead={copy.lead} />
    case 'report':
    case 'list':
      return <ComingSoon title={copy.title} lead={copy.lead} />
    case 'accounts':
      return <AccountsView title={copy.title} lead={copy.lead} />
    default: {
      const unexpected: never = copy.screen.kind
      return unexpected
    }
  }
}

export function DeskFormPage() {
  const { module = '', screen = '', id = '' } = useParams()
  const { locale, t } = useI18n()
  const copy = screenCopy(module, screen, locale)
  if (!copy) return <EmptyState title={t('desk.notFound')} body={t('desk.emptyBody')} />
  switch (copy.screen.kind) {
    case 'settings':
    case 'report':
      return <EmptyState title={t('desk.notFound')} body={t('desk.emptyBody')} />
    case 'list':
      return <ComingSoon title={copy.title} lead={copy.lead} />
    case 'accounts':
      return <AccountForm title={copy.title} id={id} />
    default: {
      const unexpected: never = copy.screen.kind
      return unexpected
    }
  }
}

function SettingsView({ module, title, lead }: { module: string; title: string; lead: string }) {
  const { locale, t } = useI18n()
  const toast = useToast()
  const queryClient = useQueryClient()
  const settings = useQuery({
    queryKey: ['module-settings', module],
    queryFn: () => api<SettingField[]>(`/api/module-settings?module=${encodeURIComponent(module)}`),
  })
  const [draft, setDraft] = useState<SettingField[] | null>(null)
  const fields = draft ?? settings.data ?? []
  const save = useMutation({
    mutationFn: () => api('/api/module-settings', {
      method: 'PUT',
      body: JSON.stringify({ module, values: fields.map((field) => ({ key: field.key, value: field.value })) }),
    }),
    onSuccess: async () => {
      toast(t('desk.settingsSaved'))
      setDraft(null)
      await queryClient.invalidateQueries({ queryKey: ['module-settings', module] })
    },
  })
  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    save.mutate()
  }
  return (
    <form className="grid max-w-2xl gap-5" onSubmit={onSubmit}>
      <PageHeader title={title} lead={lead} />
      {settings.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {settings.isError ? <p className="text-sm text-destructive">{settings.error.message}</p> : null}
      {save.isError ? <Notice message={save.error instanceof ApiError ? save.error.message : t('desk.failed')} /> : null}
      <Panel className="grid gap-4">
        {fields.map((field) => (
          <Field key={field.key} label={locale === 'zh' ? field.labelZh : field.labelEn}>
            <Input value={field.value} onChange={(event) => setDraft(fields.map((row) => row.key === field.key ? { ...row, value: event.target.value } : row))} />
          </Field>
        ))}
      </Panel>
      <div><Button type="submit" disabled={save.isPending || fields.length === 0}>{t('desk.save')}</Button></div>
    </form>
  )
}

function AccountsView({ title, lead }: { title: string; lead: string }) {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<AccountRow[]>('/api/accounts') })
  const filtered = (accounts.data ?? []).filter((row) => {
    const hay = `${row.code} ${row.name} ${row.type}`.toLowerCase()
    return hay.includes(q.trim().toLowerCase())
  })
  return (
    <div className="grid gap-5">
      <PageHeader title={title} lead={lead} actions={<ExportButton kind="accounts" />} />
      <Toolbar>
        <Input className="w-full sm:w-56" value={q} placeholder={t('desk.search')} aria-label={t('desk.search')} onChange={(event) => setQ(event.target.value)} />
      </Toolbar>
      {accounts.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {accounts.isError ? <p className="text-sm text-destructive">{accounts.error.message}</p> : null}
      {accounts.data && filtered.length === 0 ? <EmptyState title={t('desk.emptyTitle')} body={t('desk.emptyBody')} /> : null}
      {filtered.length > 0 ? (
        <TableFrame>
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('desk.name')}</th>
                <th className="px-4 py-3 font-medium">{t('desk.bucket')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/app/accounting/accounts/${row.id}`}>{row.code} {row.name}</Link>
                  </td>
                  <td className="px-4 py-3">{accountTypeText(row.type, t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableFrame>
      ) : null}
    </div>
  )
}

function AccountForm({ title, id }: { title: string; id: string }) {
  const { t } = useI18n()
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<AccountRow[]>('/api/accounts') })
  const row = accounts.data?.find((account) => String(account.id) === id)
  if (accounts.isLoading) return <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p>
  if (!row) return <EmptyState title={t('desk.notFound')} body={t('desk.emptyBody')} />
  return (
    <div className="grid max-w-2xl gap-5">
      <PageHeader
        title={`${row.code} ${row.name}`}
        lead={title}
        actions={<Link className="keel-back" to="/app/accounting/accounts">{t('desk.back')}</Link>}
      />
      <Panel className="grid gap-4 md:grid-cols-2">
        <Field label={t('desk.name')}><Input value={row.name} readOnly /></Field>
        <Field label={t('desk.bucket')}><Input value={accountTypeText(row.type, t)} readOnly /></Field>
        <Field label={t('desk.state')}><Input value={row.code} readOnly /></Field>
      </Panel>
    </div>
  )
}
