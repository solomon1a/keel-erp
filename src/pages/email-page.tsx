import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type DragEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select, Textarea } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'
import type { MailBlock } from '../../shared/content-blocks.ts'

type Stats = { recipients: number; sent: number; opened: number; clicked: number; bounced: number; openRate: number | null; simulated: boolean; variantA: { sent: number; opened: number }; variantB: { sent: number; opened: number } }
type Campaign = { id: number; name: string; subject: string; subjectB: string; state: string; channel: string; blocks: MailBlock[]; list: { id: number; name: string }; listId: number; stats: Stats }
type MailList = { id: number; name: string; segment: string; tag: string; _count?: { members: number }; members?: Array<{ email: string; status: string }> }
type Product = { id: number; name: string }
type Suppression = { id: number; email: string; reason: string }

const blockKinds = ['heading', 'text', 'image', 'button', 'columns', 'divider', 'product'] as const

function blank(type: (typeof blockKinds)[number]): MailBlock {
  switch (type) {
    case 'heading':
      return { type: 'heading', text: '' }
    case 'text':
      return { type: 'text', text: '' }
    case 'image':
      return { type: 'image', url: '', alt: '' }
    case 'button':
      return { type: 'button', label: '', href: '' }
    case 'columns':
      return { type: 'columns', left: '', right: '' }
    case 'divider':
      return { type: 'divider' }
    case 'product':
      return { type: 'product', productId: 0 }
    default: {
      const unexpected: never = type
      return unexpected
    }
  }
}

export function EmailPage() {
  const params = useParams()
  if (params.campaignId) return <Editor campaignId={params.campaignId === 'new' ? null : Number(params.campaignId)} />
  if (params.section === 'lists') return <Lists />
  if (params.section === 'suppression') return <SuppressionList />
  return <CampaignList />
}

function CampaignList() {
  const { t } = useI18n()
  const campaigns = useQuery({ queryKey: ['campaigns'], queryFn: () => api<Campaign[]>('/api/campaigns') })
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('email.title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('email.lead')}</p>
        </div>
        <Link to="/email/campaigns/new"><Button>{t('email.new')}</Button></Link>
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" to="/email/lists">{t('email.lists')}</Link>
        <Link className="underline" to="/email/suppression">{t('email.suppression')}</Link>
      </nav>
      {campaigns.isLoading ? <p className="text-sm text-muted-foreground">{t('purchases.loading')}</p> : null}
      {(campaigns.data ?? []).length === 0 && !campaigns.isLoading ? <p className="text-sm text-muted-foreground">{t('email.empty')}</p> : null}
      <ul className="grid gap-3">
        {(campaigns.data ?? []).map((campaign) => (
          <li key={campaign.id}>
            <Link className="grid gap-2 rounded-lg border border-border bg-card px-4 py-3 md:grid-cols-[1fr_auto]" to={`/email/campaigns/${campaign.id}`}>
              <span>
                <span className="font-semibold">{campaign.name}</span>
                <span className="mt-1 block text-sm text-muted-foreground">{campaign.subject} · {campaign.state}</span>
              </span>
              <span className="text-sm text-muted-foreground">
                {t('email.sent')} {campaign.stats.sent} · {t('email.opens')} {campaign.stats.opened} · {t('email.clicks')} {campaign.stats.clicked} · {t('email.bounces')} {campaign.stats.bounced}
                {campaign.stats.simulated ? ` · ${t('email.simulated')}` : ''}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function Editor({ campaignId }: { campaignId: number | null }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const existing = useQuery({
    queryKey: ['campaign', campaignId],
    queryFn: () => api<Campaign>(`/api/campaigns/${campaignId}`),
    enabled: campaignId != null,
  })
  const lists = useQuery({ queryKey: ['mail-lists'], queryFn: () => api<MailList[]>('/api/mail/lists') })
  const products = useQuery({ queryKey: ['products'], queryFn: () => api<Product[]>('/api/products') })
  const row = existing.data
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [subjectB, setSubjectB] = useState('')
  const [listId, setListId] = useState('')
  const [blocks, setBlocks] = useState<MailBlock[]>([{ type: 'heading', text: '' }, { type: 'text', text: '' }])
  const [frame, setFrame] = useState<'desktop' | 'mobile'>('desktop')
  const [testTo, setTestTo] = useState('')
  const [ready, setReady] = useState(campaignId == null)
  if (row && !ready) {
    setName(row.name)
    setSubject(row.subject)
    setSubjectB(row.subjectB)
    setListId(String(row.list.id))
    setBlocks(row.blocks.length > 0 ? row.blocks : [{ type: 'heading', text: '' }])
    setReady(true)
  }
  const save = useMutation({
    mutationFn: () => api<Campaign>('/api/campaigns', {
      method: 'POST',
      body: JSON.stringify({ id: campaignId ?? undefined, name, listId: Number(listId), subject, subjectB, blocks }),
    }),
    onSuccess: async (saved) => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
      if (!campaignId) window.location.assign(`/email/campaigns/${saved.id}`)
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const send = useMutation({
    mutationFn: (email?: string) => api<Campaign>(`/api/campaigns/${campaignId}/send`, { method: 'POST', body: JSON.stringify(email ? { email } : {}) }),
    onSuccess: async () => {
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['campaign', campaignId] })
      await queryClient.invalidateQueries({ queryKey: ['campaigns'] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  function onSubmit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }
  function move(index: number, to: number) {
    if (to < 0 || to >= blocks.length) return
    const next = [...blocks]
    const [item] = next.splice(index, 1)
    if (!item) return
    next.splice(to, 0, item)
    setBlocks(next)
  }
  return (
    <form className="grid gap-6" onSubmit={onSubmit}>
      <div>
        <Link className="text-sm underline" to="/email">{t('email.campaigns')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{name || t('email.new')}</h1>
      </div>
      {error ? <Notice message={error} /> : null}
      {row?.stats.simulated ? <p className="rounded-lg border border-border bg-card px-4 py-3 text-sm">{t('email.simulated')}</p> : null}
      {row ? (
        <div className="grid gap-3 sm:grid-cols-4" data-tour="email-stats">
          <Stat label={t('email.sent')} value={String(row.stats.sent)} />
          <Stat label={t('email.opens')} value={row.stats.openRate == null ? '—' : `${row.stats.openRate}%`} />
          <Stat label={t('email.clicks')} value={String(row.stats.clicked)} />
          <Stat label={t('email.bounces')} value={String(row.stats.bounced)} />
        </div>
      ) : null}
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <Field label={t('email.name')}><Input value={name} onChange={(event) => setName(event.target.value)} required /></Field>
        <Field label={t('email.list')}>
          <Select value={listId} onChange={(event) => setListId(event.target.value)} required>
            <option value="">{t('email.list')}</option>
            {(lists.data ?? []).map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}
          </Select>
        </Field>
        <Field label={t('email.subject')}><Input value={subject} onChange={(event) => setSubject(event.target.value)} required /></Field>
        <Field label={t('email.subjectB')}><Input value={subjectB} onChange={(event) => setSubjectB(event.target.value)} /></Field>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="grid gap-3">
          {blocks.map((block, index) => (
            <article
              key={`${block.type}-${index}`}
              className="grid gap-2 rounded-lg border border-border bg-card p-3"
              draggable
              onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event: DragEvent) => {
                event.preventDefault()
                move(Number(event.dataTransfer.getData('text/plain')), index)
              }}
            >
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t(`email.block.${block.type}`)}</p>
              <BlockFields block={block} products={products.data ?? []} onChange={(next) => setBlocks(blocks.map((item, at) => (at === index ? next : item)))} />
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="secondary" onClick={() => move(index, index - 1)}>↑</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => move(index, index + 1)}>↓</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setBlocks(blocks.filter((_, at) => at !== index))}>×</Button>
              </div>
            </article>
          ))}
          <Field label={t('email.add')}>
            <Select value="" onChange={(event) => {
              const type = blockKinds.find((kind) => kind === event.target.value)
              if (type) setBlocks([...blocks, blank(type)])
            }}>
              <option value="">{t('email.add')}</option>
              {blockKinds.map((kind) => <option key={kind} value={kind}>{t(`email.block.${kind}`)}</option>)}
            </Select>
          </Field>
        </div>
        <aside>
          <div className="mb-2 flex gap-2">
            <Button type="button" size="sm" variant={frame === 'desktop' ? 'default' : 'secondary'} onClick={() => setFrame('desktop')}>{t('email.desktop')}</Button>
            <Button type="button" size="sm" variant={frame === 'mobile' ? 'default' : 'secondary'} onClick={() => setFrame('mobile')}>{t('email.mobile')}</Button>
          </div>
          <div className="rounded-lg border border-border bg-card p-4" style={{ width: frame === 'mobile' ? 280 : '100%' }}>
            <p className="text-xs text-muted-foreground">{t('email.preview')}</p>
            <h2 className="mt-2 font-serif text-2xl">{subject || t('email.subject')}</h2>
            {blocks.map((block, index) => <Preview key={index} block={block} products={products.data ?? []} />)}
          </div>
        </aside>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <Button type="submit">{t('site.save')}</Button>
        {campaignId ? <Button type="button" onClick={() => send.mutate(undefined)} disabled={send.isPending}>{t('email.send')}</Button> : null}
        {campaignId ? (
          <>
            <Input className="w-56" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder={t('email.test')} />
            <Button type="button" variant="secondary" onClick={() => send.mutate(testTo)}>{t('email.test')}</Button>
          </>
        ) : null}
      </div>
    </form>
  )
}

function BlockFields({ block, products, onChange }: { block: MailBlock; products: Product[]; onChange: (block: MailBlock) => void }) {
  switch (block.type) {
    case 'heading':
    case 'text':
      return block.type === 'heading'
        ? <Input value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
        : <Textarea rows={3} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
    case 'image':
      return (
        <div className="grid gap-2">
          <Input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} placeholder="https://" />
          <Input value={block.alt} onChange={(event) => onChange({ ...block, alt: event.target.value })} />
        </div>
      )
    case 'button':
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Input value={block.label} onChange={(event) => onChange({ ...block, label: event.target.value })} />
          <Input value={block.href} onChange={(event) => onChange({ ...block, href: event.target.value })} />
        </div>
      )
    case 'columns':
      return (
        <div className="grid gap-2 md:grid-cols-2">
          <Textarea rows={3} value={block.left} onChange={(event) => onChange({ ...block, left: event.target.value })} />
          <Textarea rows={3} value={block.right} onChange={(event) => onChange({ ...block, right: event.target.value })} />
        </div>
      )
    case 'divider':
      return null
    case 'product':
      return (
        <Select value={String(block.productId || '')} onChange={(event) => onChange({ ...block, productId: Number(event.target.value) })}>
          <option value="" />
          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </Select>
      )
    default: {
      const unexpected: never = block
      return unexpected
    }
  }
}

function Preview({ block, products }: { block: MailBlock; products: Product[] }) {
  switch (block.type) {
    case 'heading':
      return <h3 className="mt-3 font-serif text-xl">{block.text}</h3>
    case 'text':
      return <p className="mt-2 text-sm leading-6">{block.text}</p>
    case 'image':
      return block.url ? <img className="mt-2 max-h-40 w-full object-cover" src={block.url} alt={block.alt} /> : null
    case 'button':
      return <p className="mt-3"><span className="inline-block rounded-full bg-[var(--kl-color-primary-700)] px-3 py-1 text-sm text-white">{block.label}</span></p>
    case 'columns':
      return <div className="mt-2 grid grid-cols-2 gap-2 text-sm"><p>{block.left}</p><p>{block.right}</p></div>
    case 'divider':
      return <hr className="my-3 border-border" />
    case 'product':
      return <p className="mt-2 text-sm font-medium">{products.find((product) => product.id === block.productId)?.name}</p>
    default: {
      const unexpected: never = block
      return unexpected
    }
  }
}

function Lists() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const lists = useQuery({ queryKey: ['mail-lists'], queryFn: () => api<MailList[]>('/api/mail/lists') })
  const [form, setForm] = useState({ name: '', segment: 'both', tag: '' })
  const [error, setError] = useState('')
  const create = useMutation({
    mutationFn: () => api('/api/mail/lists', { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: async () => {
      setForm({ name: '', segment: 'both', tag: '' })
      await queryClient.invalidateQueries({ queryKey: ['mail-lists'] })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const fill = useMutation({
    mutationFn: (id: number) => api(`/api/mail/lists/${id}/fill`, { method: 'POST' }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['mail-lists'] }) },
  })
  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm underline" to="/email">{t('email.campaigns')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{t('email.lists')}</h1>
      </div>
      {error ? <Notice message={error} /> : null}
      <form className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
        <Field label={t('email.name')}><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></Field>
        <Field label={t('email.segment')}>
          <Select value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })}>
            <option value="both">both</option>
            <option value="customers">customers</option>
            <option value="leads">leads</option>
          </Select>
        </Field>
        <Field label={t('email.tag')}><Input value={form.tag} onChange={(event) => setForm({ ...form, tag: event.target.value })} /></Field>
        <div className="self-end"><Button type="submit">{t('email.newList')}</Button></div>
      </form>
      <ul className="grid gap-2">
        {(lists.data ?? []).map((list) => (
          <li key={list.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3">
            <span>{list.name} · {list.segment}{list.tag ? ` · ${list.tag}` : ''} · {list._count?.members ?? 0}</span>
            <Button size="sm" type="button" variant="secondary" onClick={() => fill.mutate(list.id)}>{t('email.fill')}</Button>
          </li>
        ))}
      </ul>
    </div>
  )
}

function SuppressionList() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const rows = useQuery({ queryKey: ['suppression'], queryFn: () => api<Suppression[]>('/api/mail/suppression') })
  const [email, setEmail] = useState('')
  const add = useMutation({
    mutationFn: () => api('/api/mail/suppression', { method: 'POST', body: JSON.stringify({ email, reason: 'manual' }) }),
    onSuccess: async () => {
      setEmail('')
      await queryClient.invalidateQueries({ queryKey: ['suppression'] })
    },
  })
  return (
    <div className="grid gap-6">
      <div>
        <Link className="text-sm underline" to="/email">{t('email.campaigns')}</Link>
        <h1 className="mt-2 font-serif text-4xl tracking-tight">{t('email.suppression')}</h1>
      </div>
      <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); add.mutate() }}>
        <Field label={t('site.email')}><Input value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
        <Button type="submit">{t('site.save')}</Button>
      </form>
      <ul className="text-sm">
        {(rows.data ?? []).map((row) => <li key={row.id} className="border-t border-border py-2">{row.email} · {row.reason}</li>)}
      </ul>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-serif text-3xl">{value}</p>
    </div>
  )
}
