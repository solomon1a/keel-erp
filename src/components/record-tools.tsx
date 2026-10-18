import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ChangeEvent } from 'react'
import { Field, Notice } from './field.tsx'
import { Button } from './ui/button.tsx'
import { Textarea } from './ui/textarea.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type MailLog = { id: number; to: string; subject: string; channel: string; createdAt: string }
type FileRow = { id: number; name: string; mime: string; size: number; createdAt: string }
type SendResult = { simulated: boolean; link: string }

export function RecordTools({ model, recordId }: { model: 'sale.order' | 'purchase.order' | 'account.move'; recordId: number }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const mail = useQuery({
    queryKey: ['mail-log', model, recordId],
    queryFn: () => api<MailLog[]>(`/api/documents/email?model=${encodeURIComponent(model)}&recordId=${recordId}`),
  })
  const files = useQuery({
    queryKey: ['files', model, recordId],
    queryFn: () => api<FileRow[]>(`/api/files?model=${encodeURIComponent(model)}&recordId=${recordId}`),
  })
  const send = useMutation({
    mutationFn: () => api<SendResult>('/api/documents/email', {
      method: 'POST',
      body: JSON.stringify({ model, recordId, note }),
    }),
    onSuccess: async (result) => {
      setLink(result.link)
      setMessage(result.simulated ? t('phase.simulated') : t('phase.sent'))
      await queryClient.invalidateQueries({ queryKey: ['mail-log', model, recordId] })
    },
    onError: (reason) => setMessage(reason instanceof ApiError ? reason.message : t('phase.soon')),
  })
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const data = await file.arrayBuffer()
      const bytes = new Uint8Array(data)
      let binary = ''
      for (const byte of bytes) binary += String.fromCharCode(byte)
      return api('/api/files', {
        method: 'POST',
        body: JSON.stringify({ model, recordId, name: file.name, mime: file.type || 'application/octet-stream', data: btoa(binary) }),
      })
    },
    onSuccess: async () => {
      setMessage(t('phase.saved'))
      await queryClient.invalidateQueries({ queryKey: ['files', model, recordId] })
    },
    onError: (reason) => setMessage(reason instanceof ApiError ? reason.message : t('phase.fileBig')),
  })
  const remove = useMutation({
    mutationFn: (id: number) => api(`/api/files/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['files', model, recordId] })
    },
  })

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) upload.mutate(file)
  }

  return (
    <div className="grid gap-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="grid gap-2">
          <h2 className="font-semibold">{t('phase.send')}</h2>
          <Field label={t('phase.note')}>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={send.isPending} onClick={() => send.mutate()}>{t('phase.send')}</Button>
            {link ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(link)
                  setMessage(t('phase.copied'))
                }}
              >
                {t('phase.copy')}
              </Button>
            ) : null}
          </div>
        </div>
        <div className="grid content-start gap-2">
          <h2 className="font-semibold">{t('phase.files')}</h2>
          <p className="text-sm text-muted-foreground">{t('phase.fileBig')}</p>
          <input aria-label={t('phase.upload')} type="file" onChange={onFile} />
          {(files.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t('phase.noFiles')}</p> : null}
          <ul className="grid gap-1 text-sm">
            {(files.data ?? []).map((file) => (
              <li key={file.id} className="flex items-center justify-between gap-2">
                <a className="hover:underline" href={`/api/files/${file.id}`}>{file.name}</a>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove.mutate(file.id)}>{t('common.delete')}</Button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {message ? <Notice message={message} /> : null}
      <div>
        <h2 className="font-semibold">{t('phase.mailLog')}</h2>
        {(mail.data ?? []).length === 0 ? <p className="mt-1 text-sm text-muted-foreground">{t('phase.noMail')}</p> : null}
        <ul className="mt-2 grid gap-1 text-sm">
          {(mail.data ?? []).map((row) => (
            <li key={row.id}>{row.subject} · {row.to} · {row.channel}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}
