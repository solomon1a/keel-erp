import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { seedDatabase } from '../prisma/seed.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { createApp } from '../server/app.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let jonah = ''
let amira = ''
let companyId = 0

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
  companyId = (await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })).companyId
})

afterAll(async () => {
  await prisma.$disconnect()
})

async function raw(path: string, cookie = '', init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (cookie) headers.set('cookie', cookie)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await createApp().request(path, { ...init, headers })
  return { status: response.status, text: await response.text(), location: response.headers.get('location') }
}

type Campaign = {
  id: number
  name: string
  state: string
  channel: string
  stats: { simulated: boolean; sent: number; opened: number; bounced: number }
}

describe('email and website', () => {
  it('seeds a Jiangbei site and a sent campaign without moving the books', async () => {
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.body).toMatchObject({ profit: jiangbeiBooks.profit })
    const october = await prisma.bankStatement.findFirst({
      where: { companyId, name: 'Jiangbei October statement' },
      include: { lines: true },
    })
    expect(october?.lines.every((line) => line.reconciled === 0)).toBe(true)

    const campaigns = (await call('/api/campaigns', maya)).body as unknown as Campaign[]
    const sent = campaigns.find((row) => row.name === 'October linen note')
    const draft = campaigns.find((row) => row.name === 'Winter shop hours')
    expect(sent?.state).toBe('sent')
    expect(sent?.channel).toBe('simulate')
    expect(sent?.stats.simulated).toBe(true)
    expect(sent?.stats.sent).toBeGreaterThan(0)
    expect(sent?.stats.opened).toBeGreaterThan(0)
    expect(sent?.stats.bounced).toBe(1)
    expect(draft?.state).toBe('draft')

    const foreign = (await call('/api/campaigns', amira)).body as unknown as Campaign[]
    expect(foreign.some((row) => row.name === 'October linen note')).toBe(false)

    const site = await call('/api/site/jiangbei', '')
    expect(site.status).toBe(200)
    const pages = site.body?.pages as unknown as Array<{ slug: string; state: string }>
    expect(pages.map((page) => page.slug)).toEqual(expect.arrayContaining(['home', 'about', 'products', 'contact']))
    const posts = site.body?.posts as unknown as Array<{ slug: string }>
    expect(posts.some((post) => post.slug === 'cutting-the-apron')).toBe(true)
    const products = site.body?.products as unknown as Array<{ sku: string }>
    expect(products.some((product) => product.sku === 'NB-01')).toBe(true)

    const sitemap = await raw('/api/site/jiangbei/sitemap.xml')
    expect(sitemap.status).toBe(200)
    expect(sitemap.text).toContain('/site/jiangbei')
    expect(sitemap.text).toContain('/site/jiangbei/blog/cutting-the-apron')
    const robots = await raw('/api/site/jiangbei/robots.txt')
    expect(robots.text).toContain('Sitemap:')
  })

  it('keeps send and publish for admins, and labels a simulated send', async () => {
    const winter = await prisma.campaign.findFirstOrThrow({ where: { companyId, name: 'Winter shop hours' } })
    const deniedSend = await call(`/api/campaigns/${winter.id}/send`, jonah, { method: 'POST', body: JSON.stringify({}) })
    expect(deniedSend.status).toBe(403)

    const page = await call('/api/sites/pages', maya, {
      method: 'POST',
      body: JSON.stringify({
        title: 'Hours draft',
        slug: 'hours-draft',
        seoTitle: 'Hours',
        seoDescription: 'Winter hours at the workroom',
        blocks: [{ id: 't1', type: 'text', text: 'The bench closes early.' }],
      }),
    })
    expect(page.status).toBe(200)
    const pageId = (page.body as { id: number }).id
    const deniedPublish = await call(`/api/sites/pages/${pageId}/publish`, jonah, {
      method: 'POST',
      body: JSON.stringify({ state: 'published' }),
    })
    expect(deniedPublish.status).toBe(403)
    const hidden = await call('/api/site/jiangbei', '')
    const hiddenPages = hidden.body?.pages as unknown as Array<{ slug: string }>
    expect(hiddenPages.some((row) => row.slug === 'hours-draft')).toBe(false)
    const preview = await call('/api/site/jiangbei?preview=1', maya)
    const previewPages = preview.body?.pages as unknown as Array<{ slug: string }>
    expect(previewPages.some((row) => row.slug === 'hours-draft')).toBe(true)
    expect((await call('/api/site/jiangbei?preview=1', amira)).status).toBe(403)

    const list = await call('/api/mail/lists', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Bench notes', segment: 'customers', tag: '' }),
    })
    expect(list.status).toBe(201)
    const listId = (list.body as { id: number }).id
    const filled = await call(`/api/mail/lists/${listId}/fill`, maya, { method: 'POST' })
    expect(filled.status).toBe(200)
    expect((filled.body as { added: number }).added).toBeGreaterThan(0)

    const campaign = await call('/api/campaigns', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Bench note',
        listId,
        subject: 'A note from the bench',
        subjectB: 'Cloth is in',
        blocks: [
          { type: 'heading', text: 'From the bench' },
          { type: 'text', text: 'A short note for the counter.' },
          { type: 'button', label: 'Goods', href: 'https://jiangbei.example/goods' },
        ],
      }),
    })
    expect(campaign.status).toBe(200)
    const campaignId = (campaign.body as { id: number }).id
    const sent = await call(`/api/campaigns/${campaignId}/send`, maya, { method: 'POST', body: JSON.stringify({}) })
    expect(sent.status).toBe(200)
    const sentBody = sent.body as unknown as Campaign
    expect(sentBody.channel).toBe('simulate')
    expect(sentBody.stats.simulated).toBe(true)
    expect(sentBody.state).toBe('sent')

    const recipients = await prisma.campaignRecipient.findMany({ where: { campaignId }, orderBy: { id: 'asc' } })
    expect(recipients.length).toBeGreaterThan(1)
    expect(recipients.some((row) => row.variant === 'b')).toBe(true)
    const first = recipients[0]
    if (!first) throw new Error('missing recipient')
    const opened = await raw(`/api/mail/open/${first.token}`)
    expect(opened.status).toBe(200)
    expect(opened.text.startsWith('GIF')).toBe(true)
    expect((await prisma.campaignRecipient.findUniqueOrThrow({ where: { id: first.id } })).openCount).toBe(1)
    const clicked = await raw(`/api/mail/click/${first.token}?url=${encodeURIComponent('https://jiangbei.example/goods')}`)
    expect(clicked.status).toBe(302)
    expect(clicked.location).toContain('jiangbei.example/goods')

    const unsubscribed = await raw(`/api/mail/unsubscribe/${first.token}`)
    expect(unsubscribed.status).toBe(200)
    expect(unsubscribed.text).toContain('unsubscribed')
    const member = await prisma.mailMember.findFirst({ where: { companyId, email: first.email } })
    expect(member?.status).toBe('unsubscribed')
    const suppressed = await prisma.mailSuppression.findFirst({ where: { companyId, email: first.email } })
    expect(suppressed?.reason).toContain('unsubscribe')
  })

  it('throttles a company that has already mailed this minute', async () => {
    const list = await prisma.mailList.findFirstOrThrow({ where: { companyId, name: 'Shop customers' } })
    const burst = await prisma.campaign.create({
      data: { companyId, listId: list.id, name: 'Throttle burst', subject: 'Burst', blocks: [] },
    })
    await prisma.campaignRecipient.createMany({
      data: Array.from({ length: 30 }, (_, index) => ({
        companyId,
        campaignId: burst.id,
        email: `burst-${index}@example.com`,
        subject: 'Burst',
        token: `burst-${companyId}-${index}`,
        status: 'sent',
        sentAt: new Date(),
      })),
    })
    const blocked = await call(`/api/campaigns/${burst.id}/send`, maya, { method: 'POST', body: JSON.stringify({ email: 'one-more@example.com' }) })
    expect(blocked.status).toBe(429)
  })

  it('turns a public contact form into a lead, and a second seed does not duplicate the site', async () => {
    const posted = await call('/api/site/jiangbei/contact', '', {
      method: 'POST',
      body: JSON.stringify({ name: 'Lin Wei', email: 'lin.wei@example.com', message: 'Can you cut two aprons this week?' }),
    })
    expect(posted.status).toBe(201)
    const leadId = (posted.body as { leadId: number }).leadId
    const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId } })
    expect(lead?.name).toBe('Website · Lin Wei')
    expect(lead?.email).toBe('lin.wei@example.com')

    await seedDatabase(prisma)
    expect(await prisma.campaign.count({ where: { companyId, name: 'October linen note' } })).toBe(1)
    expect(await prisma.sitePage.count({ where: { companyId, slug: 'home' } })).toBe(1)
    const pnl = await call('/api/reports/pnl', maya)
    expect(pnl.body).toMatchObject({ profit: jiangbeiBooks.profit })
  })
})
