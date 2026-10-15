import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Textarea } from '../components/ui/textarea.tsx'
import { api, ApiError } from '../lib/api.ts'
import { money, orderStateLabel, shortDate } from '../lib/format.ts'
import type { Contact, Country } from '../lib/types.ts'

type FormState = {
  name: string
  email: string
  phone: string
  isCompany: boolean
  isCustomer: boolean
  isSupplier: boolean
  isEmployee: boolean
  street: string
  city: string
  state: string
  postalCode: string
  notes: string
  parentId: string
  countryId: string
}

const empty: FormState = {
  name: '',
  email: '',
  phone: '',
  isCompany: false,
  isCustomer: true,
  isSupplier: false,
  isEmployee: false,
  street: '',
  city: '',
  state: '',
  postalCode: '',
  notes: '',
  parentId: '',
  countryId: '',
}

export function ContactFormPage() {
  const { id } = useParams()
  const isNew = !id
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(empty)
  const [error, setError] = useState('')

  const contact = useQuery({
    queryKey: ['contact', id],
    queryFn: () => api<Contact>(`/api/contacts/${id}`),
    enabled: !isNew,
  })
  const companies = useQuery({
    queryKey: ['contacts', 'companies'],
    queryFn: () => api<Contact[]>('/api/contacts?kind=company'),
  })
  const countries = useQuery({
    queryKey: ['countries'],
    queryFn: () => api<Country[]>('/api/countries'),
  })

  useEffect(() => {
    if (!contact.data) return
    const row = contact.data
    setForm({
      name: row.name,
      email: row.email ?? '',
      phone: row.phone ?? '',
      isCompany: row.isCompany,
      isCustomer: row.isCustomer,
      isSupplier: row.isSupplier,
      isEmployee: row.isEmployee,
      street: row.street ?? '',
      city: row.city ?? '',
      state: row.state ?? '',
      postalCode: row.postalCode ?? '',
      notes: row.notes ?? '',
      parentId: row.parentId ? String(row.parentId) : '',
      countryId: row.countryId ? String(row.countryId) : '',
    })
  }, [contact.data])

  const save = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        parentId: form.parentId ? Number(form.parentId) : null,
        countryId: form.countryId ? Number(form.countryId) : null,
      }
      return api<Contact>(isNew ? '/api/contacts' : `/api/contacts/${id}`, {
        method: isNew ? 'POST' : 'PATCH',
        body: JSON.stringify(payload),
      })
    },
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate(`/contacts/${saved.id}`)
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'Could not save the contact.'),
  })

  const remove = useMutation({
    mutationFn: () => api(`/api/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate('/contacts')
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : 'Could not delete the contact.'),
  })

  if (contact.isLoading) return <p className="text-sm text-muted-foreground">Loading the contact…</p>
  if (contact.isError) return <p className="text-sm text-destructive">{contact.error.message}</p>

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          setError('')
          save.mutate()
        }}
      >
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{isNew ? 'New contact' : form.name || 'Contact'}</h1>
          <p className="mt-1 text-muted-foreground">A company can hold the people who order from you.</p>
        </div>
        {error ? <Notice message={error} /> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label="Country">
            <select className="h-10 rounded-md border border-border bg-card px-3" value={form.countryId} onChange={(event) => setForm({ ...form, countryId: event.target.value })}>
              <option value="">No country</option>
              {countries.data?.map((country) => (
                <option key={country.id} value={country.id}>{country.name}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isCompany} onChange={(event) => setForm({ ...form, isCompany: event.target.checked, parentId: event.target.checked ? '' : form.parentId })} /> Company</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isCustomer} onChange={(event) => setForm({ ...form, isCustomer: event.target.checked })} /> Customer</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isSupplier} onChange={(event) => setForm({ ...form, isSupplier: event.target.checked })} /> Supplier</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isEmployee} onChange={(event) => setForm({ ...form, isEmployee: event.target.checked })} /> Employee</label>
        </div>
        {form.isCompany ? null : (
          <Field label="Works at">
            <select className="h-10 rounded-md border border-border bg-card px-3" value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
              <option value="">No company</option>
              {companies.data?.filter((company) => company.id !== Number(id)).map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Street">
            <Input value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </Field>
          <Field label="State">
            <Input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
          </Field>
          <Field label="Postal code">
            <Input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} />
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save contact'}</Button>
          <Link to="/contacts"><Button variant="outline">Back</Button></Link>
          {isNew ? null : (
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              Delete
            </Button>
          )}
        </div>
      </form>
      {contact.data ? (
        <aside className="grid gap-4 content-start">
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-semibold">Record</p>
            <p className="mt-2 text-muted-foreground">Added {shortDate(contact.data.createdAt)}{contact.data.createdBy ? ` by ${contact.data.createdBy.name}` : ''}.</p>
            <p className="text-muted-foreground">Updated {shortDate(contact.data.updatedAt)}{contact.data.updatedBy ? ` by ${contact.data.updatedBy.name}` : ''}.</p>
          </div>
          {contact.data.children && contact.data.children.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold">People</p>
              <ul className="mt-2 grid gap-2 text-sm">
                {contact.data.children.map((child) => (
                  <li key={child.id}><Link className="hover:underline" to={`/contacts/${child.id}`}>{child.name}</Link></li>
                ))}
              </ul>
            </div>
          ) : null}
          {contact.data.orders && contact.data.orders.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold">Orders</p>
              <ul className="mt-2 grid gap-2 text-sm">
                {contact.data.orders.map((order) => (
                  <li key={order.id} className="flex justify-between gap-2">
                    <Link className="hover:underline" to={`/orders/${order.id}`}>{order.name}</Link>
                    <span>{money(order.amountTotal)} · {orderStateLabel[order.state]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>
      ) : null}
    </div>
  )
}
