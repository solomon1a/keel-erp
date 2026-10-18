import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CommercialPanel } from '../components/commercial-panel.tsx'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { Textarea } from '../components/ui/textarea.tsx'
import { countryLabel, orderStateLabel, purchaseStateLabel } from '../i18n/labels.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import { useMoney, useShortDate } from '../lib/format.ts'
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

function startingForm(vendor: boolean): FormState {
  if (!vendor) return empty
  return { ...empty, isCompany: true, isCustomer: false, isSupplier: true }
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
  const [params] = useSearchParams()
  const isNew = !id
  const startAsVendor = isNew && params.get('supplier') === '1'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { t } = useI18n()
  const money = useMoney()
  const shortDate = useShortDate()
  const [form, setForm] = useState<FormState>(() => startingForm(startAsVendor))
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
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('contact.saveFailed')),
  })

  const remove = useMutation({
    mutationFn: () => api(`/api/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['contacts'] })
      navigate('/contacts')
    },
    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t('contact.deleteFailed')),
  })

  if (contact.isLoading) return <p className="text-sm text-muted-foreground">{t('contact.loading')}</p>
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
          <h1 className="font-serif text-4xl tracking-tight">{isNew ? t('contact.newTitle') : form.name || t('contact.fallback')}</h1>
          <p className="mt-1 text-muted-foreground">{t('contact.lead')}</p>
        </div>
        {error ? <Notice message={error} /> : null}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('common.name')}>
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label={t('common.email')}>
            <Input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
          </Field>
          <Field label={t('common.phone')}>
            <Input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
          </Field>
          <Field label={t('contact.country')}>
            <select className="h-10 rounded-md border border-border bg-card px-3" value={form.countryId} onChange={(event) => setForm({ ...form, countryId: event.target.value })}>
              <option value="">{t('contact.noCountry')}</option>
              {countries.data?.map((country) => (
                <option key={country.id} value={country.id}>{countryLabel(country.code, country.name, t)}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isCompany} onChange={(event) => setForm({ ...form, isCompany: event.target.checked, parentId: event.target.checked ? '' : form.parentId })} /> {t('contacts.company')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isCustomer} onChange={(event) => setForm({ ...form, isCustomer: event.target.checked })} /> {t('contacts.customerOne')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isSupplier} onChange={(event) => setForm({ ...form, isSupplier: event.target.checked })} /> {t('contacts.supplierOne')}</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={form.isEmployee} onChange={(event) => setForm({ ...form, isEmployee: event.target.checked })} /> {t('contacts.employeeOne')}</label>
        </div>
        {form.isCompany ? null : (
          <Field label={t('contact.worksAt')}>
            <select className="h-10 rounded-md border border-border bg-card px-3" value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}>
              <option value="">{t('contact.noCompany')}</option>
              {companies.data?.filter((company) => company.id !== Number(id)).map((company) => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={t('contact.street')}>
            <Input value={form.street} onChange={(event) => setForm({ ...form, street: event.target.value })} />
          </Field>
          <Field label={t('common.city')}>
            <Input value={form.city} onChange={(event) => setForm({ ...form, city: event.target.value })} />
          </Field>
          <Field label={t('contact.state')}>
            <Input value={form.state} onChange={(event) => setForm({ ...form, state: event.target.value })} />
          </Field>
          <Field label={t('contact.postal')}>
            <Input value={form.postalCode} onChange={(event) => setForm({ ...form, postalCode: event.target.value })} />
          </Field>
        </div>
        <Field label={t('common.notes')}>
          <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? t('common.saving') : t('contact.save')}</Button>
          <Link to="/contacts"><Button variant="outline">{t('common.back')}</Button></Link>
          {isNew ? null : (
            <Button variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
              {t('common.delete')}
            </Button>
          )}
        </div>
      </form>
      {contact.data ? (
        <aside className="grid content-start gap-4">
          <CommercialPanel
            contactId={contact.data.id}
            assigned={{
              salePriceListId: contact.data.salePriceListId ?? null,
              purchasePriceListId: contact.data.purchasePriceListId ?? null,
              paymentTermId: contact.data.paymentTermId ?? null,
              fiscalPositionId: contact.data.fiscalPositionId ?? null,
            }}
          />
          <div className="rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-semibold">{t('contact.record')}</p>
            <p className="mt-2 text-muted-foreground">
              {t('contact.added', {
                date: shortDate(contact.data.createdAt),
                by: contact.data.createdBy ? t('contact.by', { name: contact.data.createdBy.name }) : '',
              })}
            </p>
            <p className="text-muted-foreground">
              {t('contact.updated', {
                date: shortDate(contact.data.updatedAt),
                by: contact.data.updatedBy ? t('contact.by', { name: contact.data.updatedBy.name }) : '',
              })}
            </p>
          </div>
          {contact.data.children && contact.data.children.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold">{t('contact.people')}</p>
              <ul className="mt-2 grid gap-2 text-sm">
                {contact.data.children.map((child) => (
                  <li key={child.id}><Link className="hover:underline" to={`/contacts/${child.id}`}>{child.name}</Link></li>
                ))}
              </ul>
            </div>
          ) : null}
          {contact.data.purchaseOrders && contact.data.purchaseOrders.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold">{t('contact.purchases')}</p>
              <ul className="mt-2 grid gap-2 text-sm">
                {contact.data.purchaseOrders.map((order) => (
                  <li key={order.id} className="flex justify-between gap-2">
                    <Link className="hover:underline" to={`/purchases/${order.id}`}>{order.name}</Link>
                    <span>{money(order.amountTotal)} · {purchaseStateLabel(order.state, t)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {contact.data.orders && contact.data.orders.length > 0 ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="font-semibold">{t('contact.orders')}</p>
              <ul className="mt-2 grid gap-2 text-sm">
                {contact.data.orders.map((order) => (
                  <li key={order.id} className="flex justify-between gap-2">
                    <Link className="hover:underline" to={`/orders/${order.id}`}>{order.name}</Link>
                    <span>{money(order.amountTotal)} · {orderStateLabel(order.state, t)}</span>
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
