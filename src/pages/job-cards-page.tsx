import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Notice } from '../components/field.tsx'
import { JobCardPanel, type JobCardView } from '../components/job-card-panel.tsx'
import { PageHeader } from '../components/surface.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api } from '../lib/api.ts'

export function JobCardsPage() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [error, setError] = useState('')
  const cards = useQuery({ queryKey: ['job-cards'], queryFn: () => api<JobCardView[]>('/api/job-cards') })
  const refresh = async () => {
    setError('')
    await queryClient.invalidateQueries({ queryKey: ['job-cards'] })
    await queryClient.invalidateQueries({ queryKey: ['workstations'] })
    await queryClient.invalidateQueries({ queryKey: ['manufacturing-order'] })
  }

  if (cards.isLoading) return <p className="text-sm text-muted-foreground">{t('mfg.loading')}</p>
  if (cards.isError) return <p className="text-sm text-destructive">{cards.error.message}</p>
  const rows = cards.data ?? []

  return (
    <div className="grid gap-6" data-screen="job-cards">
      <PageHeader title={t('mfg.jobs')} lead={t('mfg.jobsLead')} />
      {error ? <Notice message={error} /> : null}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t('mfg.emptyJobs')}</p> : null}
      <div className="grid gap-3 xl:grid-cols-2">
        {rows.map((card) => (
          <JobCardPanel key={card.id} card={card} showOrder onDone={refresh} onError={setError} />
        ))}
      </div>
    </div>
  )
}
