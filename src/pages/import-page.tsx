import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { PageHeader, Panel } from '../components/surface.tsx'
import { Button } from '../components/ui/button.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Preview = {
  columns: Array<{ index: number; header: string; field: string }>
  rows: Array<Record<string, string>>
  errors: Array<{ row: number; message: string }>
  fields: string[]
}

export function ImportPage() {
  const { t } = useI18n()
  const kinds = useQuery({ queryKey: ['import-kinds'], queryFn: () => api<string[]>('/api/import/kinds') })
  const [kind, setKind] = useState('contacts')
  const [text, setText] = useState('name,email\n')
  const [file, setFile] = useState<{ name: string; data: string } | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')

  const runPreview = useMutation({
    mutationFn: () => api<Preview>('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify(file ? { kind, mapping, name: file.name, data: file.data } : { kind, mapping, text }),
    }),
    onSuccess: (result) => {
      setPreview(result)
      setMessage('')
    },
    onError: (reason) => setMessage(reason instanceof ApiError ? reason.message : t('phase.errors')),
  })
  const commit = useMutation({
    mutationFn: () => api<{ saved: number }>('/api/import/commit', {
      method: 'POST',
      body: JSON.stringify({ kind, rows: preview?.rows ?? [] }),
    }),
    onSuccess: (result) => setMessage(t('phase.saved') + ` ${result.saved}`),
    onError: (reason) => setMessage(reason instanceof ApiError ? reason.message : t('phase.errors')),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    runPreview.mutate()
  }

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0]
    if (!picked) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const data = result.includes(',') ? result.slice(result.indexOf(',') + 1) : ''
      setFile({ name: picked.name, data })
      setText('')
    }
    reader.readAsDataURL(picked)
  }

  return (
    <form className="grid gap-5" onSubmit={onSubmit}>
      <PageHeader
        title={t('phase.import')}
        lead={t('phase.importLead')}
        actions={<Link className="keel-back" to="/accounting">{t('common.back')}</Link>}
      />
      {message ? <Notice message={message} /> : null}
      <Panel className="grid gap-4 md:grid-cols-2">
        <Field label={t('phase.kind')}>
          <select className="h-10 rounded-md border border-border bg-card px-3" value={kind} onChange={(event) => { setKind(event.target.value); setPreview(null) }}>
            {(kinds.data ?? ['contacts']).map((row) => <option key={row} value={row}>{row}</option>)}
          </select>
        </Field>
        <Field label={t('phase.upload')}>
          <input aria-label={t('phase.upload')} type="file" accept=".csv,.xlsx,text/csv" onChange={onFile} />
        </Field>
        <div className="md:col-span-2">
          <Field label="CSV">
            <textarea className="min-h-32 w-full rounded-md border border-border bg-card px-3 py-2 font-mono text-sm" value={text} onChange={(event) => { setText(event.target.value); setFile(null) }} />
          </Field>
        </div>
      </Panel>
      <div><Button type="submit" disabled={runPreview.isPending}>{t('phase.preview')}</Button></div>
      {preview ? (
        <Panel className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-2">
            {preview.columns.map((column) => (
              <label key={column.index} className="grid gap-1 text-sm">
                {column.header || t('phase.row')}
                <select
                  className="h-10 rounded-md border border-border bg-card px-3"
                  value={mapping[column.header] ?? column.field}
                  onChange={(event) => setMapping({ ...mapping, [column.header]: event.target.value })}
                >
                  <option value="">{t('phase.none')}</option>
                  {preview.fields.map((field) => <option key={field} value={field}>{field}</option>)}
                </select>
              </label>
            ))}
          </div>
          {preview.errors.length > 0 ? (
            <div>
              <p className="font-semibold">{t('phase.errors')}</p>
              <ul className="mt-1 text-sm text-destructive">
                {preview.errors.map((error) => <li key={`${error.row}-${error.message}`}>{t('phase.row')} {error.row}: {error.message}</li>)}
              </ul>
            </div>
          ) : null}
          <p className="text-sm text-muted-foreground">{preview.rows.length}</p>
          <div>
            <Button type="button" disabled={commit.isPending || preview.errors.length > 0 || preview.rows.length === 0} onClick={() => commit.mutate()}>
              {t('phase.commit')}
            </Button>
          </div>
        </Panel>
      ) : null}
    </form>
  )
}
