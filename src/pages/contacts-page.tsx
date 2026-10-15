import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState } from '../components/field.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { api } from '../lib/api.ts'
import type { Contact } from '../lib/types.ts'

export function ContactsPage() {
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
          <h1 className="font-serif text-4xl tracking-tight">Contacts</h1>
          <p className="mt-1 text-muted-foreground">Companies, the people who work there, and who you sell to.</p>
        </div>
        <Link to="/contacts/new">
          <Button>New contact</Button>
        </Link>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_160px_160px]">
        <Input
          placeholder="Search name, email, phone, or city"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search contacts"
        />
        <select className="h-10 rounded-md border border-border bg-card px-3" value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Kind">
          <option value="all">Companies and people</option>
          <option value="company">Companies</option>
          <option value="person">People</option>
        </select>
        <select className="h-10 rounded-md border border-border bg-card px-3" value={role} onChange={(event) => setRole(event.target.value)} aria-label="Role">
          <option value="all">Any role</option>
          <option value="customer">Customers</option>
          <option value="supplier">Suppliers</option>
          <option value="employee">Employees</option>
        </select>
      </div>
      {contacts.isLoading ? <p className="text-sm text-muted-foreground">Loading contacts…</p> : null}
      {contacts.isError ? <p className="text-sm text-destructive">{contacts.error.message}</p> : null}
      {contacts.data && contacts.data.length === 0 ? (
        <EmptyState title="No one matches" body="Try another search, or add the company first and hang people under it." />
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-border text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Kind</th>
              <th className="px-4 py-3 font-medium">Roles</th>
              <th className="px-4 py-3 font-medium">City</th>
              <th className="px-4 py-3 font-medium">Phone</th>
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
                <td className="px-4 py-3">{contact.isCompany ? 'Company' : 'Person'}</td>
                <td className="px-4 py-3">
                  <span className="flex flex-wrap gap-1">
                    {contact.isCustomer ? <Badge>Customer</Badge> : null}
                    {contact.isSupplier ? <Badge>Supplier</Badge> : null}
                    {contact.isEmployee ? <Badge>Employee</Badge> : null}
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
