import { useMutation, useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { SiteBlock } from '../../shared/content-blocks.ts'
import { useI18n } from '../i18n/locale.tsx'
import { api, ApiError } from '../lib/api.ts'

type Product = { id: number; name: string; listPrice: number; description: string | null }
type Post = { slug: string; title: string; excerpt: string; body: string; coverUrl: string }
type Page = { slug: string; title: string; seoTitle: string; seoDescription: string; blocks: SiteBlock[] }
type Site = {
  company: { name: string; city: string; currency: string; slug: string }
  theme: { siteName: string; primary: string; ink: string; paper: string; font: string; logoUrl: string }
  menu: Array<{ id: number; label: string; href: string }>
  pages: Page[]
  posts: Post[]
  products: Product[]
}

export function PublicSitePage() {
  const { slug = '', page: pageSlug, post: postSlug } = useParams()
  const preview = new URLSearchParams(window.location.search).get('preview') === '1'
  const site = useQuery({
    queryKey: ['public-site', slug, preview],
    queryFn: () => api<Site>(`/api/site/${slug}${preview ? '?preview=1' : ''}`),
  })
  if (site.isLoading || !site.data) {
    return <main className="min-h-screen bg-[#F3F6F4] px-6 py-16 text-[#1C2B2A]">{site.isError ? 'This website is not published.' : ''}</main>
  }
  const data = site.data
  const page = postSlug
    ? null
    : data.pages.find((item) => item.slug === (pageSlug || 'home')) ?? data.pages[0]
  const post = postSlug ? data.posts.find((item) => item.slug === postSlug) : null
  const font = data.theme.font === 'sans' ? 'ui-sans-serif, system-ui, sans-serif' : 'Georgia, "Iowan Old Style", serif'
  return (
    <div style={{ background: data.theme.paper, color: data.theme.ink, fontFamily: font, minHeight: '100vh' }}>
      <header className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-5">
        <Link to={`/site/${slug}`} className="text-lg font-semibold" style={{ fontFamily: 'Georgia, serif' }}>
          {data.theme.logoUrl ? <img src={data.theme.logoUrl} alt="" className="h-8" /> : (data.theme.siteName || data.company.name)}
        </Link>
        <nav className="flex flex-wrap gap-4 text-sm">
          {data.menu.map((item) => (
            item.href.startsWith('http') || item.href.startsWith('/shop')
              ? <a key={item.id} href={item.href}>{item.label}</a>
              : <Link key={item.id} to={item.href.startsWith('/') ? item.href : `/site/${slug}/${item.href}`}>{item.label}</Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-16">
        {post ? <article><h1 className="font-serif text-4xl">{post.title}</h1><p className="mt-6 whitespace-pre-wrap leading-7">{post.body}</p></article> : null}
        {page && !post ? page.blocks.map((block) => <Block key={block.id} block={block} site={data} slug={slug} />) : null}
      </main>
    </div>
  )
}

function Block({ block, site, slug }: { block: SiteBlock; site: Site; slug: string }) {
  const { t } = useI18n()
  switch (block.type) {
    case 'hero':
      return (
        <section className="py-12">
          <p className="text-sm uppercase tracking-[0.18em]" style={{ color: site.theme.primary }}>{site.company.city}</p>
          <h1 className="mt-3 max-w-3xl text-5xl leading-tight" style={{ fontFamily: 'Georgia, serif' }}>{block.title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-7">{block.subtitle}</p>
          {block.button ? <a className="mt-6 inline-block rounded-full px-4 py-2 text-sm text-white" style={{ background: site.theme.primary }} href={block.href}>{block.button}</a> : null}
        </section>
      )
    case 'text':
      return <p className="max-w-2xl py-3 text-base leading-7 whitespace-pre-wrap">{block.text}</p>
    case 'image':
      return block.url ? <img src={block.url} alt={block.alt} className="my-4 max-h-[420px] w-full object-cover" /> : null
    case 'features':
      return (
        <section className="grid gap-4 py-6 sm:grid-cols-3">
          {block.items.map((item) => (
            <article key={item.title} className="rounded-lg border border-black/10 bg-white/70 p-4">
              <h2 className="font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6">{item.text}</p>
            </article>
          ))}
        </section>
      )
    case 'testimonials':
      return (
        <section className="grid gap-4 py-6 md:grid-cols-2">
          {block.items.map((item) => (
            <blockquote key={item.name} className="rounded-lg bg-white/70 p-4">
              <p className="text-lg leading-7">“{item.quote}”</p>
              <footer className="mt-3 text-sm">{item.name}</footer>
            </blockquote>
          ))}
        </section>
      )
    case 'pricing':
      return (
        <section className="grid gap-4 py-6 sm:grid-cols-3">
          {block.items.map((item) => (
            <article key={item.name} className="rounded-lg border border-black/10 p-4">
              <h2 className="font-semibold">{item.name}</h2>
              <p className="mt-2 font-serif text-3xl">{item.price}</p>
              <p className="mt-2 text-sm leading-6">{item.text}</p>
            </article>
          ))}
        </section>
      )
    case 'cta':
      return (
        <section className="my-8 rounded-lg px-6 py-8 text-white" style={{ background: site.theme.primary }}>
          <h2 className="font-serif text-3xl">{block.title}</h2>
          {block.button ? <a className="mt-4 inline-block rounded-full bg-white px-4 py-2 text-sm" style={{ color: site.theme.primary }} href={block.href}>{block.button}</a> : null}
        </section>
      )
    case 'products':
      return (
        <section className="grid gap-3 py-6 sm:grid-cols-3">
          {site.products.map((product) => (
            <article key={product.id} className="rounded-lg border border-black/10 bg-white/80 p-4">
              <h2 className="font-semibold">{product.name}</h2>
              <p className="mt-1 text-sm">{site.company.currency} {product.listPrice}</p>
              {product.description ? <p className="mt-2 text-sm leading-6">{product.description}</p> : null}
            </article>
          ))}
        </section>
      )
    case 'blog':
      return (
        <section className="grid gap-3 py-6">
          {site.posts.map((post) => (
            <Link key={post.slug} to={`/site/${slug}/blog/${post.slug}`} className="rounded-lg border border-black/10 bg-white/80 p-4">
              <h2 className="font-semibold">{post.title}</h2>
              <p className="mt-1 text-sm">{post.excerpt}</p>
            </Link>
          ))}
        </section>
      )
    case 'contact':
      return <ContactForm slug={slug} label={t('site.contact')} sent={t('site.sent')} />
    default: {
      const unexpected: never = block
      return unexpected
    }
  }
}

function ContactForm({ slug, label, sent }: { slug: string; label: string; sent: string }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [done, setDone] = useState('')
  const [error, setError] = useState('')
  const submit = useMutation({
    mutationFn: () => api(`/api/site/${slug}/contact`, { method: 'POST', body: JSON.stringify(form) }),
    onSuccess: () => {
      setDone(sent)
      setError('')
      setForm({ name: '', email: '', message: '' })
    },
    onError: (caught) => setError(caught instanceof ApiError ? caught.message : 'Try again.'),
  })
  function onSubmit(event: FormEvent) {
    event.preventDefault()
    submit.mutate()
  }
  return (
    <form className="my-8 grid max-w-lg gap-3 rounded-lg border border-black/10 bg-white/80 p-4" onSubmit={onSubmit}>
      <label className="grid gap-1 text-sm">{t('site.name')}<input className="rounded border border-black/15 bg-white px-3 py-2" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
      <label className="grid gap-1 text-sm">{t('site.email')}<input className="rounded border border-black/15 bg-white px-3 py-2" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required /></label>
      <label className="grid gap-1 text-sm">{t('site.message')}<textarea className="rounded border border-black/15 bg-white px-3 py-2" rows={4} value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} required /></label>
      {error ? <p className="text-sm text-[#B42323]">{error}</p> : null}
      {done ? <p className="text-sm">{done}</p> : null}
      <button className="w-fit rounded-full px-4 py-2 text-sm text-white" style={{ background: '#0E6B5C' }} type="submit">{label}</button>
    </form>
  )
}
