import type { Prisma, PrismaClient } from '@prisma/client'
import type { MailBlock, SiteBlock } from '../shared/content-blocks.ts'

function slugFor(name: string, id: number) {
  if (name.includes('Jiangbei') || name.includes('江北')) return 'jiangbei'
  if (name.includes('Harbour')) return 'harbour'
  if (name.includes('Hudson')) return 'hudson'
  return `company-${id}`
}

export async function seedReach(client: PrismaClient) {
  const companies = await client.company.findMany({ select: { id: true, name: true, slug: true, currency: true } })
  for (const company of companies) {
    if (company.slug) continue
    const slug = slugFor(company.name, company.id)
    const taken = await client.company.findFirst({ where: { slug, NOT: { id: company.id } }, select: { id: true } })
    if (!taken) await client.company.update({ where: { id: company.id }, data: { slug } })
  }
  const jiangbei = await client.company.findFirst({ where: { slug: 'jiangbei' } })
  if (!jiangbei) return
  await seedJiangbeiSite(client, jiangbei.id)
  await seedJiangbeiMail(client, jiangbei.id)
}

async function seedJiangbeiSite(client: PrismaClient, companyId: number) {
  const existing = await client.sitePage.findFirst({ where: { companyId, slug: 'home' } })
  if (existing) return
  await client.siteTheme.upsert({
    where: { companyId },
    update: {},
    create: { companyId, siteName: 'Jiangbei Goods', primary: '#0E6B5C', ink: '#1C2B2A', paper: '#F3F6F4', font: 'serif', logoUrl: '' },
  })
  const pages: Array<{ title: string; slug: string; seoTitle: string; seoDescription: string; blocks: SiteBlock[] }> = [
    {
      title: 'Home',
      slug: 'home',
      seoTitle: 'Jiangbei Goods',
      seoDescription: 'Cloth, notebooks, and blankets from a Shanghai workroom.',
      blocks: [
        { id: 'hero', type: 'hero', title: 'Goods for a working shop', subtitle: 'Jiangbei cuts cloth, stitches aprons, and keeps a small shelf of notebooks and blankets in Shanghai.', button: 'See the goods', href: '/site/jiangbei/products' },
        { id: 'features', type: 'features', items: [
          { title: 'Cut in house', text: 'Floor cloth is inspected before it reaches the shelf.' },
          { title: 'Sold by the piece', text: 'Notebooks, totes, and blankets ship from the same warehouse as the shop.' },
          { title: 'A person answers', text: 'The contact form lands as a lead on the desk, not in a forgotten inbox.' },
        ] },
        { id: 'products', type: 'products' },
        { id: 'quotes', type: 'testimonials', items: [
          { quote: 'The apron arrived hemmed and the notebook fits a coat pocket.', name: 'Cedar & Co' },
          { quote: 'They told us the cloth failed the width check instead of shipping it anyway.', name: 'Harbor Clinic' },
        ] },
        { id: 'journal', type: 'blog' },
        { id: 'cta', type: 'cta', title: 'Visit the workroom list', button: 'Write to us', href: '/site/jiangbei/contact' },
      ],
    },
    {
      title: 'About',
      slug: 'about',
      seoTitle: 'About Jiangbei Goods',
      seoDescription: 'A Shanghai company that buys cloth, makes aprons, and sells a short list of goods.',
      blocks: [
        { id: 'about', type: 'text', text: 'Jiangbei Goods Co. buys floor cloth, cuts it on the bench, and sells what the shop floor finishes. The public site is the same company as the desk: one warehouse, one set of books, one list of customers.' },
      ],
    },
    {
      title: 'Products',
      slug: 'products',
      seoTitle: 'Goods',
      seoDescription: 'What Jiangbei currently publishes on the shop.',
      blocks: [{ id: 'grid', type: 'products' }],
    },
    {
      title: 'Contact',
      slug: 'contact',
      seoTitle: 'Contact Jiangbei',
      seoDescription: 'Send a note. It becomes a lead.',
      blocks: [
        { id: 'note', type: 'text', text: 'Tell us what you need made or which goods you want. The note is saved and a lead is opened for the desk.' },
        { id: 'form', type: 'contact' },
      ],
    },
  ]
  for (const [sequence, page] of pages.entries()) {
    await client.sitePage.create({
      data: {
        companyId,
        title: page.title,
        slug: page.slug,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        state: 'published',
        sequence,
        blocks: page.blocks as unknown as Prisma.InputJsonValue,
      },
    })
  }
  await client.siteMenuItem.createMany({
    data: [
      { companyId, label: 'Home', href: '/site/jiangbei', sequence: 0 },
      { companyId, label: 'About', href: '/site/jiangbei/about', sequence: 1 },
      { companyId, label: 'Goods', href: '/site/jiangbei/products', sequence: 2 },
      { companyId, label: 'Journal', href: '/site/jiangbei/blog/cutting-the-apron', sequence: 3 },
      { companyId, label: 'Contact', href: '/site/jiangbei/contact', sequence: 4 },
      { companyId, label: 'Shop', href: '/shop', sequence: 5 },
    ],
  })
  await client.blogPost.create({
    data: {
      companyId,
      title: 'Cutting the shop apron',
      slug: 'cutting-the-apron',
      excerpt: 'One panel, a short hem, and a scrap that stays off the customer order.',
      body: 'The apron starts as floor cloth. We check the width before the receipt is accepted. A short piece goes to quarantine instead of the shelf. The rest is cut, hemmed, and the offcut is recorded as process loss rather than hidden in the cost.\n\nThe public price is the notebook and the blanket. The apron is made when a shop asks for it.',
      seoTitle: 'Cutting the shop apron',
      seoDescription: 'How Jiangbei turns floor cloth into a shop apron.',
      state: 'published',
      publishedAt: new Date('2026-10-02'),
    },
  })
}

async function seedJiangbeiMail(client: PrismaClient, companyId: number) {
  const existing = await client.campaign.findFirst({ where: { companyId, name: 'October linen note' } })
  if (existing) return
  const contacts = await client.contact.findMany({
    where: { companyId, isCustomer: true, email: { not: null } },
    select: { id: true, name: true, email: true },
    take: 8,
  })
  const list = await client.mailList.create({
    data: { companyId, name: 'Shop customers', segment: 'customers', tag: '' },
  })
  if (contacts.length > 0) {
    await client.mailMember.createMany({
      data: contacts.flatMap((contact) => contact.email ? [{
        companyId,
        listId: list.id,
        email: contact.email.toLowerCase(),
        name: contact.name,
        contactId: contact.id,
        status: 'subscribed',
      }] : []),
    })
  }
  const blocks: MailBlock[] = [
    { type: 'heading', text: 'October on the bench' },
    { type: 'text', text: 'The linen receipt is in, the aprons are cut, and the notebook is still on the shelf. Reply if you want a bundle for the counter.' },
    { type: 'button', label: 'See the goods', href: 'https://jiangbei.example/goods' },
    { type: 'divider' },
    { type: 'product', productId: (await client.product.findFirst({ where: { companyId, sku: 'NB-01' }, select: { id: true } }))?.id ?? 0 },
  ]
  const sent = await client.campaign.create({
    data: {
      companyId,
      listId: list.id,
      name: 'October linen note',
      subject: 'October linen, cut and counted',
      subjectB: 'The October cloth is in',
      state: 'sent',
      channel: 'simulate',
      sentAt: new Date('2026-10-12'),
      blocks: blocks as unknown as Prisma.InputJsonValue,
    },
  })
  const audience = contacts.filter((contact) => contact.email)
  for (const [index, contact] of audience.entries()) {
    const opened = index < 5
    const clicked = index < 3
    const bounced = index === audience.length - 1 && audience.length > 3
    await client.campaignRecipient.create({
      data: {
        companyId,
        campaignId: sent.id,
        email: (contact.email ?? '').toLowerCase(),
        name: contact.name,
        subject: index % 2 === 1 ? sent.subjectB : sent.subject,
        variant: index % 2 === 1 ? 'b' : 'a',
        token: `seed-oct-${companyId}-${index}`,
        status: bounced ? 'bounced' : 'sent',
        openCount: opened && !bounced ? 1 : 0,
        clickCount: clicked && !bounced ? 1 : 0,
        openedAt: opened && !bounced ? new Date('2026-10-13') : null,
        clickedAt: clicked && !bounced ? new Date('2026-10-13') : null,
        sentAt: new Date('2026-10-12'),
      },
    })
  }
  await client.campaign.create({
    data: {
      companyId,
      listId: list.id,
      name: 'Winter shop hours',
      subject: 'Winter hours at the workroom',
      subjectB: '',
      state: 'draft',
      blocks: [
        { type: 'heading', text: 'Winter hours' },
        { type: 'text', text: 'The bench closes early in December. This draft has not been sent.' },
      ] as unknown as Prisma.InputJsonValue,
    },
  })
}
