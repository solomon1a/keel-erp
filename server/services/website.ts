import type { Prisma } from '@prisma/client'
import { asSiteBlocks, slugify, type SiteBlock } from '../../shared/content-blocks.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { createLead } from './crm.ts'

function blocksOf(value: unknown) {
  return asSiteBlocks(value) as unknown as Prisma.InputJsonValue
}

export async function ensureSlug(tx: Tx, companyId: number, name: string) {
  const current = await tx.company.findUnique({ where: { id: companyId }, select: { slug: true } })
  if (current?.slug) return current.slug
  const base = slugify(name)
  for (let extra = 0; extra < 20; extra += 1) {
    const slug = extra === 0 ? base : `${base}-${companyId + extra}`
    const taken = await tx.company.findFirst({ where: { slug, NOT: { id: companyId } }, select: { id: true } })
    if (!taken) {
      await tx.company.update({ where: { id: companyId }, data: { slug } })
      return slug
    }
  }
  const fallback = `company-${companyId}`
  await tx.company.update({ where: { id: companyId }, data: { slug: fallback } })
  return fallback
}

export async function builderState(companyId: number) {
  const company = await prisma.company.findUnique({ where: { id: companyId } })
  if (!company) throw new AppError(404, 'Company not found.')
  const [theme, menu, pages, posts, submissions] = await Promise.all([
    prisma.siteTheme.findUnique({ where: { companyId } }),
    prisma.siteMenuItem.findMany({ where: { companyId }, orderBy: { sequence: 'asc' } }),
    prisma.sitePage.findMany({ where: { companyId }, orderBy: { sequence: 'asc' } }),
    prisma.blogPost.findMany({ where: { companyId }, orderBy: { id: 'desc' } }),
    prisma.siteSubmission.findMany({ where: { companyId }, orderBy: { id: 'desc' }, take: 40, include: { lead: { select: { id: true, name: true } } } }),
  ])
  return {
    slug: company.slug,
    theme,
    menu,
    pages: pages.map((page) => ({ ...page, blocks: asSiteBlocks(page.blocks) })),
    posts,
    submissions,
  }
}

export async function saveTheme(
  companyId: number,
  input: { siteName: string; primary: string; ink: string; paper: string; font: string; logoUrl: string },
) {
  const font = input.font === 'sans' ? 'sans' : 'serif'
  return prisma.siteTheme.upsert({
    where: { companyId },
    update: { ...input, font },
    create: { companyId, ...input, font },
  })
}

export async function saveMenu(companyId: number, items: Array<{ label: string; href: string }>) {
  await prisma.siteMenuItem.deleteMany({ where: { companyId } })
  if (items.length === 0) return []
  await prisma.siteMenuItem.createMany({
    data: items.filter((item) => item.label.trim() && item.href.trim()).map((item, index) => ({
      companyId,
      label: item.label.trim(),
      href: item.href.trim(),
      sequence: index,
    })),
  })
  return prisma.siteMenuItem.findMany({ where: { companyId }, orderBy: { sequence: 'asc' } })
}

export async function savePage(
  companyId: number,
  input: { id?: number; title: string; slug: string; seoTitle?: string; seoDescription?: string; ogImage?: string; blocks: unknown },
) {
  const slug = slugify(input.slug || input.title)
  const data = {
    title: input.title.trim(),
    slug,
    seoTitle: input.seoTitle?.trim() ?? '',
    seoDescription: input.seoDescription?.trim() ?? '',
    ogImage: input.ogImage?.trim() ?? '',
    blocks: blocksOf(input.blocks),
  }
  if (input.id) {
    const existing = await prisma.sitePage.findFirst({ where: { id: input.id, companyId } })
    if (!existing) throw new AppError(404, 'Page not found.')
    return prisma.sitePage.update({ where: { id: existing.id }, data })
  }
  const count = await prisma.sitePage.count({ where: { companyId } })
  try {
    return await prisma.sitePage.create({ data: { ...data, companyId, sequence: count } })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      throw new AppError(409, 'That page address is already used.')
    }
    throw error
  }
}

export async function reorderPages(companyId: number, ids: number[]) {
  const pages = await prisma.sitePage.findMany({ where: { companyId }, select: { id: true } })
  const known = new Set(pages.map((page) => page.id))
  if (ids.length !== known.size || ids.some((id) => !known.has(id))) throw new AppError(400, 'Reorder the pages that belong to this company.')
  await prisma.$transaction(ids.map((id, sequence) => prisma.sitePage.update({ where: { id }, data: { sequence } })))
  return prisma.sitePage.findMany({ where: { companyId }, orderBy: { sequence: 'asc' } })
}

export async function publishPage(companyId: number, pageId: number, state: 'draft' | 'published') {
  const page = await prisma.sitePage.findFirst({ where: { id: pageId, companyId } })
  if (!page) throw new AppError(404, 'Page not found.')
  return prisma.sitePage.update({ where: { id: page.id }, data: { state } })
}

export async function savePost(
  companyId: number,
  input: { id?: number; title: string; slug: string; excerpt?: string; body: string; coverUrl?: string; seoTitle?: string; seoDescription?: string },
) {
  const data = {
    title: input.title.trim(),
    slug: slugify(input.slug || input.title),
    excerpt: input.excerpt?.trim() ?? '',
    body: input.body,
    coverUrl: input.coverUrl?.trim() ?? '',
    seoTitle: input.seoTitle?.trim() ?? '',
    seoDescription: input.seoDescription?.trim() ?? '',
  }
  if (input.id) {
    const existing = await prisma.blogPost.findFirst({ where: { id: input.id, companyId } })
    if (!existing) throw new AppError(404, 'Post not found.')
    return prisma.blogPost.update({ where: { id: existing.id }, data })
  }
  try {
    return await prisma.blogPost.create({ data: { ...data, companyId } })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      throw new AppError(409, 'That post address is already used.')
    }
    throw error
  }
}

export async function publishPost(companyId: number, postId: number, state: 'draft' | 'published') {
  const post = await prisma.blogPost.findFirst({ where: { id: postId, companyId } })
  if (!post) throw new AppError(404, 'Post not found.')
  return prisma.blogPost.update({
    where: { id: post.id },
    data: { state, publishedAt: state === 'published' ? post.publishedAt ?? new Date() : null },
  })
}

async function publicCompany(slug: string) {
  const company = await prisma.company.findFirst({ where: { slug } })
  if (!company) throw new AppError(404, 'That website is not published.')
  return company
}

export async function publicSite(slug: string, preview: boolean) {
  const company = await publicCompany(slug)
  const [theme, menu, pages, posts, products] = await Promise.all([
    prisma.siteTheme.findUnique({ where: { companyId: company.id } }),
    prisma.siteMenuItem.findMany({ where: { companyId: company.id }, orderBy: { sequence: 'asc' } }),
    prisma.sitePage.findMany({
      where: { companyId: company.id, ...(preview ? {} : { state: 'published' }) },
      orderBy: { sequence: 'asc' },
    }),
    prisma.blogPost.findMany({
      where: { companyId: company.id, ...(preview ? {} : { state: 'published' }) },
      orderBy: { publishedAt: 'desc' },
    }),
    prisma.product.findMany({
      where: { companyId: company.id, websitePublished: true, active: true },
      select: { id: true, name: true, listPrice: true, description: true, sku: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return {
    company: { name: company.name, city: company.city, currency: company.currency, slug: company.slug },
    theme: theme ?? { siteName: company.name, primary: '#0E6B5C', ink: '#1C2B2A', paper: '#F3F6F4', font: 'serif', logoUrl: '' },
    menu,
    pages: pages.map((page) => ({ ...page, blocks: asSiteBlocks(page.blocks) })),
    posts,
    products,
  }
}

export async function submitContact(slug: string, input: { name: string; email: string; message: string }, userId: number | null) {
  const company = await publicCompany(slug)
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const message = input.message.trim()
  if (name.length < 2 || !email.includes('@') || message.length < 4) {
    throw new AppError(400, 'Leave a name, an email, and a short message.')
  }
  const owner = userId ?? (await prisma.user.findFirst({ where: { companyId: company.id, role: 'admin' }, select: { id: true } }))?.id
  if (!owner) throw new AppError(409, 'This company has nobody to receive the message.')
  const lead = await createLead(company.id, owner, {
    name: `Website · ${name}`,
    contactName: name,
    email,
    phone: null,
    expectedRevenue: 0,
  })
  const submission = await prisma.siteSubmission.create({
    data: { companyId: company.id, name, email, message, leadId: lead.id },
  })
  return { id: submission.id, leadId: lead.id }
}

export function sitemapXml(origin: string, slug: string, pages: Array<{ slug: string }>, posts: Array<{ slug: string }>) {
  const urls = [
    `${origin}/site/${slug}`,
    ...pages.filter((page) => page.slug !== 'home').map((page) => `${origin}/site/${slug}/${page.slug}`),
    ...posts.map((post) => `${origin}/site/${slug}/blog/${post.slug}`),
  ]
  const body = urls.map((url) => `<url><loc>${url}</loc></url>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`
}

export function robotsTxt(origin: string, slug: string) {
  return `User-agent: *\nAllow: /site/${slug}\nSitemap: ${origin}/site/${slug}/sitemap.xml\n`
}

export type { SiteBlock }
