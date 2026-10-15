import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import type { Contact } from '../lib/types.ts'

export function ContactsPage() {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [role, setRole] = useState('all')
  const contacts = useQuery({
    queryKey: ['contacts', search, kind, role],
    queryFn: () => api<Contact[]>(`/api/contacts?search=${encodeURIComponent(search)}&kind=${kind}&role=${role}`),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('contacts.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('contacts.lead')}</p>
        </div>
        <Link to="/contacts/new">
          <Button>{t('contacts.new')}</Button>
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_160px_160px]">
        <Input
          placeholder={t('contacts.search')}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('contacts.searchLabel')}
        />
        <select className="h-10 rounded-md border border-border bg-card px-3" value={kind} onChange={(event) => setKind(event.target.value)} aria-label={t('contacts.kindLabel')}>
          <option value="all">{t('contacts.kindAll')}</option>
          <option value="company">{t('contacts.kindCompany')}</option>
          <option value="person">{t('contacts.kindPerson')}</option>
        </select>
        <select className="h-10 rounded-md border border-border bg-card px-3" value={role} onChange={(event) => setRole(event.target.value)} aria-label={t('contacts.roleLabel')}>
          <option value="all">{t('contacts.roleAll')}</option>
          <option value="customer">{t('contacts.customer')}</option>
          <option value="supplier">{t('contacts.supplier')}</option>
          <option value="employee">{t('contacts.employee')}</option>
        </select>
      </div>
      {contacts.isLoading ? <p className="text-sm text-muted-foreground">{t('contacts.loading')}</p> : null}
      {contacts.isError ? <p className="text-sm text-destructive">{contacts.error.message}</p> : null}
      {contacts.data && contacts.data.length === 0 ? (
        <EmptyState title={t('contacts.emptyTitle')} body={t('contacts.emptyBody')} />
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">{t('contacts.colName')}</th>
              <th className="px-4 py-3 font-medium">{t('contacts.colKind')}</th>
              <th className="px-4 py-3 font-medium">{t('contacts.colRoles')}</th>
              <th className="px-4 py-3 font-medium">{t('common.city')}</th>
              <th className="px-4 py-3 font-medium">{t('common.phone')}</th>
            </tr>
          </thead>
          <tbody>
            {contacts.data?.map((contact) => (
              <tr key={contact.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <Link className="font-semibold hover:underline" to={`/contacts/${contact.id}`}>
                    {contact.name}
                  </Link>
                  <span className="block text-muted-foreground">{contact.parent?.name ?? contact.email ?? ' '}</span>
                </td>
                <td className="px-4 py-3">{contact.isCompany ? t('contacts.company') : t('contacts.person')}</td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1">
                    {contact.isCustomer ? <Badge>{t('contacts.customerOne')}</Badge> : null}
                    {contact.isSupplier ? <Badge>{t('contacts.supplierOne')}</Badge> : null}
                    {contact.isEmployee ? <Badge>{t('contacts.employeeOne')}</Badge> : null}
                  </span>
                </td>
                <td className="px-4 py-3">{contact.city ?? '—'}</td>
                <td className="px-4 py-3">{contact.phone ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
