import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type DragEvent, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { FeatureItem, PriceItem, QuoteItem, SiteBlock } from '../../shared/content-blocks.ts'
import { Field, Notice } from '../components/field.tsx'
import { Button } from '../components/ui/button.tsx'
import { Input, Select, Textarea } from '../components/ui/input.tsx'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Page = { id: number; title: string; slug: string; state: string; seoTitle: string; seoDescription: string; ogImage: string; blocks: SiteBlock[]; sequence: number }
type Post = { id: number; title: string; slug: string; excerpt: string; body: string; state: string; seoTitle: string; seoDescription: string }
type Theme = { siteName: string; primary: string; ink: string; paper: string; font: string; logoUrl: string }
type MenuItem = { id: number; label: string; href: string }
type Submission = { id: number; name: string; email: string; message: string; lead: { id: number; name: string } | null }
type Builder = { slug: string | null; theme: Theme | null; menu: MenuItem[]; pages: Page[]; posts: Post[]; submissions: Submission[] }

export function SiteBuilderPage() {
  const { section, pageId } = useParams()
  if (section === 'theme') return <ThemeForm />
  if (section === 'menu') return <MenuForm />
  if (section === 'blog') return <BlogDesk postId={pageId && pageId !== 'new' ? Number(pageId) : null} creating={pageId === 'new'} />
  if (section === 'inbox') return <Inbox />
  if (pageId) return <PageEditor pageId={pageId === 'new' ? null : Number(pageId)} />
  return <PageList />
}

function PageList() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const builder = useQuery({ queryKey: ['site-builder'], queryFn: () => api<Builder>('/api/sites') })
  const [error, setError] = useState('')
  const reorder = useMutation({
    mutationFn: (ids: number[]) => api('/api/sites/pages/reorder', { method: 'POST', body: JSON.stringify({ ids }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['site-builder'] }) },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const publish = useMutation({
    mutationFn: (input: { id: number; state: string }) => api(`/api/sites/pages/${input.id}/publish`, { method: 'POST', body: JSON.stringify({ state: input.state }) }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['site-builder'] }) },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  const data = builder.data
  const pages = data?.pages ?? []
  function drop(index: number, from: number) {
    if (!Number.isFinite(from) || from === index) return
    const ids = pages.map((page) => page.id)
    const [moved] = ids.splice(from, 1)
    if (moved == null) return
    ids.splice(index, 0, moved)
    reorder.mutate(ids)
  }
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl tracking-tight">{t('site.builder')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">{t('site.lead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sites/pages/new"><Button>{t('site.newPage')}</Button></Link>
          {data?.slug ? <a href={`/site/${data.slug}`}><Button variant="secondary">{t('site.view')}</Button></a> : null}
        </div>
      </div>
      <nav className="flex flex-wrap gap-3 text-sm">
        <Link className="underline" to="/sites/theme">{t('site.theme')}</Link>
        <Link className="underline" to="/sites/menu">{t('site.menu')}</Link>
        <Link className="underline" to="/sites/blog">{t('site.blog')}</Link>
        <Link className="underline" to="/sites/inbox">{t('site.inbox')}</Link>
        <Link className="underline" to="/website">{t('menu.websiteHome')}</Link>
        <Link className="underline" to="/shop">{t('menu.storefront')}</Link>
      </nav>
      {error ? <Notice message={error} /> : null}
      {pages.length === 0 && !builder.isLoading ? <p className="text-sm text-muted-foreground">{t('site.empty')}</p> : null}
      <ul className="grid gap-2">
        {pages.map((page, index) => (
          <li
            key={page.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card px-4 py-3"
            draggable
            onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event: DragEvent) => {
              event.preventDefault()
              drop(index, Number(event.dataTransfer.getData('text/plain')))
            }}
          >
            <Link className="font-medium" to={`/sites/pages/${page.id}`}>{page.title} · /{page.slug}</Link>
            <span className="flex items-center gap-2 text-sm">
              <span>{page.state === 'published' ? t('site.live') : t('site.draft')}</span>
              <Button size="sm" type="button" variant="secondary" onClick={() => publish.mutate({ id: page.id, state: page.state === 'published' ? 'draft' : 'published' })}>
                {page.state === 'published' ? t('site.unpublish') : t('site.publish')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PageEditor({ pageId }: { pageId: number | null }) {
  const { t } = useI18n()
  const builder = useQuery({ queryKey: ['site-builder'], queryFn: () => api<Builder>('/api/sites') })
  const page = builder.data?.pages.find((item) => item.id === pageId)
  const [title, setTitle] = useState(page?.title ?? '')
  const [slug, setSlug] = useState(page?.slug ?? '')
  const [seoTitle, setSeoTitle] = useState(page?.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(page?.seoDescription ?? '')
  const [blocks, setBlocks] = useState<SiteBlock[]>(page?.blocks ?? [{ id: 'hero', type: 'hero', title: '', subtitle: '', button: '', href: '' }])
  const [seen, setSeen] = useState(pageId == null)
  const [error, setError] = useState('')
  if (page && !seen) {
    setTitle(page.title)
    setSlug(page.slug)
    setSeoTitle(page.seoTitle)
    setSeoDescription(page.seoDescription)
    setBlocks(page.blocks)
    setSeen(true)
  }
  const save = useMutation({
    mutationFn: () => api<Page>('/api/sites/pages', { method: 'POST', body: JSON.stringify({ id: pageId ?? undefined, title, slug, seoTitle, seoDescription, blocks }) }),
    onSuccess: (saved) => {
      setError('')
      if (!pageId) window.location.assign(`/sites/pages/${saved.id}`)
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : t('desk.failed')),
  })
  function onSubmit(event: FormEvent) {
    event.preventDefault()
    save.mutate()
  }
  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <Link className="text-sm underline" to="/sites">{t('site.pages')}</Link>
      <h1 className="font-serif text-4xl">{title || t('site.newPage')}</h1>
      {error ? <Notice message={error} /> : null}
      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 md:grid-cols-2">
        <Field label={t('email.name')}><Input value={title} onChange={(event) => setTitle(event.target.value)} required /></Field>
        <Field label={t('site.slug')}><Input value={slug} onChange={(event) => setSlug(event.target.value)} required /></Field>
        <Field label={t('site.seoTitle')}><Input value={seoTitle} onChange={(event) => setSeoTitle(event.target.value)} /></Field>
        <Field label={t('site.seoDescription')}><Input value={seoDescription} onChange={(event) => setSeoDescription(event.target.value)} /></Field>
      </div>
      {blocks.map((block, index) => (
        <article key={block.id} className="grid gap-2 rounded-lg border border-border bg-card p-3" draggable onDragStart={(event) => event.dataTransfer.setData('text/plain', String(index))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
          event.preventDefault()
          const from = Number(event.dataTransfer.getData('text/plain'))
          if (!Number.isFinite(from) || from === index) return
          const next = [...blocks]
          const [item] = next.splice(from, 1)
          if (!item) return
          next.splice(index, 0, item)
          setBlocks(next)
        }}>
          <p className="text-xs uppercase text-muted-foreground">{block.type}</p>
          <SiteFields block={block} onChange={(next) => setBlocks(blocks.map((item, at) => (at === index ? next : item)))} />
        </article>
      ))}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={() => setBlocks([...blocks, { id: `t${Date.now()}`, type: 'text', text: '' }])}>text</Button>
        <Button type="button" variant="secondary" onClick={() => setBlocks([...blocks, { id: `h${Date.now()}`, type: 'hero', title: '', subtitle: '', button: '', href: '' }])}>hero</Button>
        <Button type="button" variant="secondary" onClick={() => setBlocks([...blocks, { id: `p${Date.now()}`, type: 'products' }])}>products</Button>
        <Button type="button" variant="secondary" onClick={() => setBlocks([...blocks, { id: `c${Date.now()}`, type: 'contact' }])}>contact</Button>
        <Button type="button" variant="secondary" onClick={() => setBlocks([...blocks, { id: `b${Date.now()}`, type: 'blog' }])}>blog</Button>
      </div>
      <div><Button type="submit">{t('site.save')}</Button></div>
    </form>
  )
}

function SiteFields({ block, onChange }: { block: SiteBlock; onChange: (block: SiteBlock) => void }) {
  switch (block.type) {
    case 'hero':
      return (
        <div className="grid gap-2">
          <Input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} />
          <Textarea rows={2} value={block.subtitle} onChange={(event) => onChange({ ...block, subtitle: event.target.value })} />
          <Input value={block.button} onChange={(event) => onChange({ ...block, button: event.target.value })} />
          <Input value={block.href} onChange={(event) => onChange({ ...block, href: event.target.value })} />
        </div>
      )
    case 'text':
      return <Textarea rows={4} value={block.text} onChange={(event) => onChange({ ...block, text: event.target.value })} />
    case 'image':
      return <Input value={block.url} onChange={(event) => onChange({ ...block, url: event.target.value })} />
    case 'features':
    case 'testimonials':
    case 'pricing':
      return <Textarea rows={4} value={JSON.stringify(block.items)} onChange={(event) => {
        try {
          const parsed = JSON.parse(event.target.value) as unknown
          if (block.type === 'features') onChange({ ...block, items: parsed as FeatureItem[] })
          else if (block.type === 'testimonials') onChange({ ...block, items: parsed as QuoteItem[] })
          else onChange({ ...block, items: parsed as PriceItem[] })
        } catch { /* keep typing */ }
      }} />
    case 'cta':
      return (
        <div className="grid gap-2">
          <Input value={block.title} onChange={(event) => onChange({ ...block, title: event.target.value })} />
          <Input value={block.button} onChange={(event) => onChange({ ...block, button: event.target.value })} />
          <Input value={block.href} onChange={(event) => onChange({ ...block, href: event.target.value })} />
        </div>
      )
    case 'contact':
    case 'products':
    case 'blog':
      return null
    default: {
      const unexpected: never = block
      return unexpected
    }
  }
}

function ThemeForm() {
  const { t } = useI18n()
  const builder = useQuery({ queryKey: ['site-builder'], queryFn: () => api<Builder>('/api/sites') })
  const theme = builder.data?.theme
  const [form, setForm] = useState({ siteName: '', primary: '#0E6B5C', ink: '#1C2B2A', paper: '#F3F6F4', font: 'serif', logoUrl: '' })
  const [seen, setSeen] = useState(false)
  if (theme && !seen) {
    setForm(theme)
    setSeen(true)
  }
  const save = useMutation({ mutationFn: () => api('/api/sites/theme', { method: 'POST', body: JSON.stringify(form) }) })
  return (
    <form className="grid max-w-xl gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
      <Link className="text-sm underline" to="/sites">{t('site.pages')}</Link>
      <h1 className="font-serif text-4xl">{t('site.theme')}</h1>
      <Field label={t('site.siteName')}><Input value={form.siteName} onChange={(event) => setForm({ ...form, siteName: event.target.value })} /></Field>
      <Field label={t('site.primary')}><Input value={form.primary} onChange={(event) => setForm({ ...form, primary: event.target.value })} /></Field>
      <Field label={t('site.ink')}><Input value={form.ink} onChange={(event) => setForm({ ...form, ink: event.target.value })} /></Field>
      <Field label={t('site.paper')}><Input value={form.paper} onChange={(event) => setForm({ ...form, paper: event.target.value })} /></Field>
      <Field label={t('site.font')}>
        <Select value={form.font} onChange={(event) => setForm({ ...form, font: event.target.value })}>
          <option value="serif">serif</option>
          <option value="sans">sans</option>
        </Select>
      </Field>
      <Field label={t('site.logo')}><Input value={form.logoUrl} onChange={(event) => setForm({ ...form, logoUrl: event.target.value })} /></Field>
      <div><Button type="submit">{t('site.save')}</Button></div>
    </form>
  )
}

function MenuForm() {
  const { t } = useI18n()
  const builder = useQuery({ queryKey: ['site-builder'], queryFn: () => api<Builder>('/api/sites') })
  const [items, setItems] = useState<Array<{ label: string; href: string }>>([])
  const [seen, setSeen] = useState(false)
  if (builder.data && !seen) {
    setItems(builder.data.menu.map((item) => ({ label: item.label, href: item.href })))
    setSeen(true)
  }
  const save = useMutation({ mutationFn: () => api('/api/sites/menu', { method: 'POST', body: JSON.stringify({ items }) }) })
  return (
    <form className="grid max-w-xl gap-3" onSubmit={(event) => { event.preventDefault(); save.mutate() }}>
      <Link className="text-sm underline" to="/sites">{t('site.pages')}</Link>
      <h1 className="font-serif text-4xl">{t('site.menu')}</h1>
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-2 gap-2">
          <Input value={item.label} onChange={(event) => setItems(items.map((row, at) => at === index ? { ...row, label: event.target.value } : row))} />
          <Input value={item.href} onChange={(event) => setItems(items.map((row, at) => at === index ? { ...row, href: event.target.value } : row))} />
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="secondary" onClick={() => setItems([...items, { label: '', href: '' }])}>{t('email.add')}</Button>
        <Button type="submit">{t('site.save')}</Button>
      </div>
    </form>
  )
}

function BlogDesk({ postId, creating }: { postId: number | null; creating: boolean }) {
  const { t } = useI18n()
  const builder = useQuery({ queryKey: ['site-builder'], queryFn: () => api<Builder>('/api/sites') })
  const post = builder.data?.posts.find((item) => item.id === postId)
  const [form, setForm] = useState({ title: '', slug: '', excerpt: '', body: '', seoTitle: '', seoDescription: '' })
  const [seen, setSeen] = useState(postId == null)
  if (post && !seen) {
    setForm({ title: post.title, slug: post.slug, excerpt: post.excerpt, body: post.body, seoTitle: post.seoTitle, seoDescription: post.seoDescription })
    setSeen(true)
  }
  const save = useMutation({
    mutationFn: () => api<Post>('/api/sites/posts', { method: 'POST', body: JSON.stringify({ id: postId ?? undefined, ...form }) }),
    onSuccess: (saved) => { if (!postId) window.location.assign(`/sites/blog/${saved.id}`) },
  })
  const publish = useMutation({
    mutationFn: () => api(`/api/sites/posts/${postId}/publish`, { method: 'POST', body: JSON.stringify({ state: post?.state === 'published' ? 'draft' : 'published' }) }),
  })
  if (postId == null && !creating) {
    return (
      <div className="grid gap-4">
        <Link className="text-sm underline" to="/sites">{t('site.pages')}</Link>
        <div className="flex items-center justify-between"><h1 className="font-serif text-4xl">{t('site.blog')}</h1><Link to="/sites/blog/new"><Button>{t('site.newPost')}</Button></Link></div>
        <ul className="grid gap-2">
          {(builder.data?.posts ?? []).map((item) => (
            <li key={item.id}><Link className="block rounded-lg border border-border bg-card px-4 py-3" to={`/sites/blog/${item.id}`}>{item.title} · {item.state}</Link></li>
          ))}
        </ul>
        <BlogForm form={form} setForm={setForm} onSubmit={(event) => { event.preventDefault(); save.mutate() }} show={false} />
      </div>
    )
  }
  return (
    <div className="grid gap-4">
      <Link className="text-sm underline" to="/sites/blog">{t('site.blog')}</Link>
      <BlogForm form={form} setForm={setForm} onSubmit={(event) => { event.preventDefault(); save.mutate() }} show />
      {postId ? <Button type="button" variant="secondary" onClick={() => publish.mutate()}>{post?.state === 'published' ? t('site.unpublish') : t('site.publish')}</Button> : null}
    </div>
  )
}

function BlogForm({ form, setForm, onSubmit, show }: { form: { title: string; slug: string; excerpt: string; body: string; seoTitle: string; seoDescription: string }; setForm: (form: { title: string; slug: string; excerpt: string; body: string; seoTitle: string; seoDescription: string }) => void; onSubmit: (event: FormEvent) => void; show: boolean }) {
  const { t } = useI18n()
  if (!show && form.title === '' && form.body === '') return null
  return (
    <form className="grid max-w-2xl gap-3" onSubmit={onSubmit}>
      <Field label={t('email.name')}><Input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></Field>
      <Field label={t('site.slug')}><Input value={form.slug} onChange={(event) => setForm({ ...form, slug: event.target.value })} /></Field>
      <Field label={t('site.seoDescription')}><Textarea rows={2} value={form.excerpt} onChange={(event) => setForm({ ...form, excerpt: event.target.value })} /></Field>
      <Textarea rows={8} value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} />
      <Field label={t('site.seoTitle')}><Input value={form.seoTitle} onChange={(event) => setForm({ ...form, seoTitle: event.target.value })} /></Field>
      <div><Button type="submit">{t('site.save')}</Button></div>
    </form>
  )
}

function Inbox() {
  const { t } = useI18n()
  const builder = useQuery({ queryKey: ['site-builder'], queryFn: () => api<Builder>('/api/sites') })
  return (
    <div className="grid gap-4">
      <Link className="text-sm underline" to="/sites">{t('site.pages')}</Link>
      <h1 className="font-serif text-4xl">{t('site.inbox')}</h1>
      <ul className="grid gap-2">
        {(builder.data?.submissions ?? []).map((row) => (
          <li key={row.id} className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="font-medium">{row.name} · {row.email}</p>
            <p className="mt-1 text-sm">{row.message}</p>
            {row.lead ? <Link className="text-sm underline" to={`/crm/${row.lead.id}`}>{row.lead.name}</Link> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
