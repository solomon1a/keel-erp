import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ExportButton } from '../components/export-button.tsx'
import { EmptyState } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import type { Contact } from '../lib/types.ts'

export function VendorsPage() {
  const { t } = useI18n()
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const vendors = useQuery({
    queryKey: ['vendors', query],
    queryFn: () => api<Contact[]>(`/api/contacts?role=supplier&search=${encodeURIComponent(query)}`),
  })

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('vendors.title')}</h1>
          <p className="mt-1 text-muted-foreground">{t('vendors.lead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="vendors" />
          <Link to="/contacts/new?supplier=1"><Button>{t('vendors.new')}</Button></Link>
        </div>
      </div>
      <form
        className="flex max-w-md gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery(search.trim())
        }}
      >
        <Input
          value={search}
          placeholder={t('vendors.search')}
          onChange={(event) => setSearch(event.target.value)}
          aria-label={t('vendors.search')}
        />
        <Button type="submit" variant="outline">{t('vendors.search')}</Button>
      </form>
      {vendors.isLoading ? <p className="text-sm text-muted-foreground">{t('vendors.loading')}</p> : null}
      {vendors.isError ? <p className="text-sm text-destructive">{vendors.error.message}</p> : null}
      {vendors.data && vendors.data.length === 0 ? (
        <EmptyState title={t('vendors.emptyTitle')} body={t('vendors.emptyBody')} />
      ) : null}
      {vendors.data && vendors.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{t('vendors.colVendor')}</th>
                <th className="px-4 py-3 font-medium">{t('vendors.colCity')}</th>
                <th className="px-4 py-3 font-medium">{t('vendors.colEmail')}</th>
                <th className="px-4 py-3 font-medium">{t('vendors.colPhone')}</th>
              </tr>
            </thead>
            <tbody>
              {vendors.data.map((vendor) => (
                <tr key={vendor.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <Link className="font-semibold hover:underline" to={`/contacts/${vendor.id}`}>{vendor.name}</Link>
                  </td>
                  <td className="px-4 py-3">{vendor.city ?? '—'}</td>
                  <td className="px-4 py-3">{vendor.email ?? '—'}</td>
                  <td className="px-4 py-3">{vendor.phone ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
