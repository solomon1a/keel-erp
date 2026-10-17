import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'
import { Field } from './field.tsx'
import { Panel } from './surface.tsx'
import { Button } from './ui/button.tsx'
import { Textarea } from './ui/textarea.tsx'

type ChatterRow = { id: number; summary: string; createdAt: string; user: { name: string } | null }

export function Chatter({ model, recordId }: { model: string; recordId: number }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const log = useQuery({
    queryKey: ['chatter', model, recordId],
    queryFn: () => api<ChatterRow[]>(`/api/chatter?model=${encodeURIComponent(model)}&recordId=${recordId}`),
    enabled: recordId > 0,
  })
  const add = useMutation({
    mutationFn: () => api('/api/chatter', { method: 'POST', body: JSON.stringify({ model, recordId, summary: note }) }),
    onSuccess: async () => {
      setNote('')
      await queryClient.invalidateQueries({ queryKey: ['chatter', model, recordId] })
    },
  })
  return (
    <Panel className="grid gap-3">
      <h2 className="font-semibold">{t('desk.chatter')}</h2>
      <ul className="grid gap-2 text-sm">
        {(log.data ?? []).map((row) => (
          <li key={row.id}>
            <span className="text-muted-foreground">{row.user?.name ? `${row.user.name}: ` : ''}</span>
            {row.summary}
          </li>
        ))}
      </ul>
      <Field label={t('desk.note')}>
        <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
      </Field>
      <div>
        <Button type="button" variant="outline" disabled={!note.trim() || add.isPending} onClick={() => add.mutate()}>
          {t('desk.addNote')}
        </Button>
      </div>
    </Panel>
  )
}
