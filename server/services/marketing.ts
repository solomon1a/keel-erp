import { randomBytes } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { asMailBlocks, type MailBlock } from '../../shared/content-blocks.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'
import { sendMail } from './mailer.ts'

const batchLimit = 30

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function token() {
  return randomBytes(18).toString('hex')
}

function segmentOf(value: string) {
  switch (value) {
    case 'customers':
    case 'leads':
    case 'both':
      return value
    default:
      throw new AppError(400, 'Choose customers, leads, or both.')
  }
}

export async function listLists(companyId: number) {
  return prisma.mailList.findMany({
    where: { companyId },
    include: { _count: { select: { members: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function createList(companyId: number, input: { name: string; segment: string; tag?: string }) {
  const segment = segmentOf(input.segment)
  try {
    return await prisma.mailList.create({
      data: { companyId, name: input.name.trim(), segment, tag: input.tag?.trim() ?? '' },
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      throw new AppError(409, 'A list with that name already exists.')
    }
    throw error
  }
}

export async function fillList(companyId: number, listId: number) {
  const list = await prisma.mailList.findFirst({ where: { id: listId, companyId } })
  if (!list) throw new AppError(404, 'Mailing list not found.')
  const tag = list.tag.trim().toLowerCase()
  const suppressed = new Set(
    (await prisma.mailSuppression.findMany({ where: { companyId }, select: { email: true } })).map((row) => row.email.toLowerCase()),
  )
  const people: Array<{ email: string; name: string; contactId?: number; leadId?: number }> = []
  if (list.segment === 'customers' || list.segment === 'both') {
    const contacts = await prisma.contact.findMany({
      where: { companyId, isCustomer: true, email: { not: null } },
      select: { id: true, name: true, email: true, city: true, notes: true },
    })
    for (const contact of contacts) {
      if (!contact.email) continue
      const haystack = `${contact.name} ${contact.city ?? ''} ${contact.notes ?? ''}`.toLowerCase()
      if (tag && !haystack.includes(tag)) continue
      people.push({ email: contact.email, name: contact.name, contactId: contact.id })
    }
  }
  if (list.segment === 'leads' || list.segment === 'both') {
    const leads = await prisma.lead.findMany({
      where: { companyId, email: { not: null } },
      select: { id: true, name: true, email: true, contactName: true },
    })
    for (const lead of leads) {
      if (!lead.email) continue
      const haystack = `${lead.name} ${lead.contactName}`.toLowerCase()
      if (tag && !haystack.includes(tag)) continue
      people.push({ email: lead.email, name: lead.contactName || lead.name, leadId: lead.id })
    }
  }
  let added = 0
  for (const person of people) {
    const email = person.email.trim().toLowerCase()
    if (!email || suppressed.has(email)) continue
    const existing = await prisma.mailMember.findUnique({ where: { listId_email: { listId: list.id, email } } })
    if (existing) continue
    await prisma.mailMember.create({
      data: {
        companyId,
        listId: list.id,
        email,
        name: person.name,
        contactId: person.contactId,
        leadId: person.leadId,
      },
    })
    added += 1
  }
  return { added, list: await prisma.mailList.findFirst({ where: { id: list.id }, include: { members: true } }) }
}

export async function listSuppressions(companyId: number) {
  return prisma.mailSuppression.findMany({ where: { companyId }, orderBy: { email: 'asc' } })
}

export async function suppress(companyId: number, email: string, reason: string) {
  const address = email.trim().toLowerCase()
  if (!address.includes('@')) throw new AppError(400, 'Enter an email address.')
  await prisma.mailMember.updateMany({ where: { companyId, email: address }, data: { status: 'unsubscribed' } })
  return prisma.mailSuppression.upsert({
    where: { companyId_email: { companyId, email: address } },
    update: { reason },
    create: { companyId, email: address, reason },
  })
}

export async function listTemplates(companyId: number) {
  return prisma.mailTemplate.findMany({ where: { companyId }, orderBy: { name: 'asc' } })
}

export async function saveTemplate(companyId: number, input: { name: string; subject: string; blocks: unknown }) {
  const blocks = asMailBlocks(input.blocks)
  return prisma.mailTemplate.upsert({
    where: { companyId_name: { companyId, name: input.name.trim() } },
    update: { subject: input.subject.trim(), blocks: blocks as unknown as Prisma.InputJsonValue },
    create: { companyId, name: input.name.trim(), subject: input.subject.trim(), blocks: blocks as unknown as Prisma.InputJsonValue },
  })
}

const campaignInclude = {
  list: { select: { id: true, name: true } },
  recipients: { select: { id: true, email: true, status: true, variant: true, openCount: true, clickCount: true, subject: true } },
} as const

export async function listCampaigns(companyId: number) {
  const rows = await prisma.campaign.findMany({
    where: { companyId },
    include: campaignInclude,
    orderBy: { id: 'desc' },
  })
  return rows.map(withStats)
}

export async function getCampaign(companyId: number, campaignId: number) {
  const row = await prisma.campaign.findFirst({ where: { id: campaignId, companyId }, include: campaignInclude })
  if (!row) throw new AppError(404, 'Campaign not found.')
  return withStats(row)
}

function withStats<T extends { channel: string; recipients: Array<{ status: string; variant: string; openCount: number; clickCount: number }> }>(row: T) {
  const sent = row.recipients.filter((item) => item.status === 'sent' || item.status === 'bounced')
  const opened = sent.filter((item) => item.openCount > 0).length
  const clicked = sent.filter((item) => item.clickCount > 0).length
  const bounced = row.recipients.filter((item) => item.status === 'bounced').length
  const variant = (name: string) => {
    const group = sent.filter((item) => item.variant === name)
    const opens = group.filter((item) => item.openCount > 0).length
    return { sent: group.length, opened: opens }
  }
  return {
    ...row,
    blocks: asMailBlocks((row as { blocks?: unknown }).blocks),
    stats: {
      recipients: row.recipients.length,
      sent: sent.length,
      opened,
      clicked,
      bounced,
      openRate: sent.length === 0 ? null : Math.round((opened / sent.length) * 100),
      simulated: row.channel === 'simulate',
      variantA: variant('a'),
      variantB: variant('b'),
    },
  }
}

export async function saveCampaign(
  companyId: number,
  input: { id?: number; name: string; listId: number; subject: string; subjectB?: string; blocks: unknown; scheduledAt?: string | null },
) {
  const list = await prisma.mailList.findFirst({ where: { id: input.listId, companyId } })
  if (!list) throw new AppError(404, 'Mailing list not found.')
  const blocks = asMailBlocks(input.blocks) as unknown as Prisma.InputJsonValue
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null
  if (scheduledAt && Number.isNaN(scheduledAt.getTime())) throw new AppError(400, 'That schedule is not a date.')
  const data = {
    name: input.name.trim(),
    listId: list.id,
    subject: input.subject.trim(),
    subjectB: input.subjectB?.trim() ?? '',
    blocks,
    scheduledAt,
    state: scheduledAt ? 'scheduled' : 'draft',
  }
  if (input.id) {
    const existing = await prisma.campaign.findFirst({ where: { id: input.id, companyId } })
    if (!existing) throw new AppError(404, 'Campaign not found.')
    if (existing.state === 'sent') throw new AppError(409, 'A sent campaign stays as it was mailed.')
    return getCampaign(companyId, (await prisma.campaign.update({ where: { id: existing.id }, data })).id)
  }
  try {
    const created = await prisma.campaign.create({ data: { ...data, companyId } })
    return getCampaign(companyId, created.id)
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      throw new AppError(409, 'A campaign with that name already exists.')
    }
    throw error
  }
}

async function renderMail(
  blocks: MailBlock[],
  products: Map<number, { name: string; listPrice: number; currency: string }>,
  links: { open: string; click: (href: string) => string; unsubscribe: string },
) {
  const parts: string[] = []
  const text: string[] = []
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        parts.push(`<h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 12px">${escapeHtml(block.text)}</h1>`)
        text.push(block.text)
        break
      case 'text':
        parts.push(`<p style="font-size:16px;line-height:1.5;margin:0 0 12px">${escapeHtml(block.text)}</p>`)
        text.push(block.text)
        break
      case 'image':
        if (block.url) parts.push(`<img src="${escapeHtml(block.url)}" alt="${escapeHtml(block.alt)}" style="max-width:100%;height:auto;border:0" />`)
        break
      case 'button': {
        const href = links.click(block.href || links.unsubscribe)
        parts.push(`<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#0E6B5C;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">${escapeHtml(block.label || 'Open')}</a></p>`)
        text.push(`${block.label}: ${block.href}`)
        break
      }
      case 'columns':
        parts.push(`<table width="100%"><tr><td width="50%" valign="top" style="padding-right:8px">${escapeHtml(block.left)}</td><td width="50%" valign="top">${escapeHtml(block.right)}</td></tr></table>`)
        text.push(`${block.left} ${block.right}`)
        break
      case 'divider':
        parts.push('<hr style="border:0;border-top:1px solid #d5ddd8;margin:16px 0" />')
        break
      case 'product': {
        const product = products.get(block.productId)
        if (product) {
          parts.push(`<p style="margin:0 0 12px"><strong>${escapeHtml(product.name)}</strong><br />${escapeHtml(product.currency)} ${product.listPrice}</p>`)
          text.push(`${product.name} ${product.currency} ${product.listPrice}`)
        }
        break
      }
      default: {
        const unexpected: never = block
        throw new AppError(400, `Unknown block ${String(unexpected)}.`)
      }
    }
  }
  parts.push(`<img src="${escapeHtml(links.open)}" width="1" height="1" alt="" />`)
  parts.push(`<p style="font-size:12px;color:#5c6b66"><a href="${escapeHtml(links.unsubscribe)}">Unsubscribe</a></p>`)
  text.push(`Unsubscribe: ${links.unsubscribe}`)
  const html = `<div style="max-width:560px;margin:0 auto;color:#1C2B2A">${parts.join('')}</div>`
  return { html, text: text.join('\n\n') }
}

async function assertThrottle(companyId: number) {
  const since = new Date(Date.now() - 60_000)
  const recent = await prisma.campaignRecipient.count({ where: { companyId, status: 'sent', sentAt: { gte: since } } })
  if (recent >= batchLimit) throw new AppError(429, 'This company has sent enough mail for this minute. Try again shortly.')
}

export async function sendCampaign(companyId: number, campaignId: number, origin: string, testEmail?: string) {
  await assertThrottle(companyId)
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, companyId }, include: { list: true } })
  if (!campaign) throw new AppError(404, 'Campaign not found.')
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
  const blocks = asMailBlocks(campaign.blocks)
  const productIds = blocks.flatMap((block) => (block.type === 'product' ? [block.productId] : []))
  const products = new Map(
    (await prisma.product.findMany({ where: { companyId, id: { in: productIds } } })).map((product) => [
      product.id,
      { name: product.name, listPrice: product.listPrice, currency: company.currency },
    ]),
  )
  const suppressed = new Set(
    (await prisma.mailSuppression.findMany({ where: { companyId }, select: { email: true } })).map((row) => row.email.toLowerCase()),
  )
  let audience: Array<{ email: string; name: string }> = []
  if (testEmail) {
    audience = [{ email: testEmail.trim().toLowerCase(), name: 'Test' }]
  } else {
    const members = await prisma.mailMember.findMany({
      where: { listId: campaign.listId, companyId, status: 'subscribed' },
      take: batchLimit,
    })
    audience = members.filter((member) => !suppressed.has(member.email.toLowerCase())).map((member) => ({ email: member.email, name: member.name }))
  }
  if (audience.length === 0) throw new AppError(400, 'That list has nobody left to mail.')
  let channel = ''
  let index = 0
  for (const person of audience) {
    const variant = campaign.subjectB && index % 2 === 1 ? 'b' : 'a'
    const subject = variant === 'b' ? campaign.subjectB : campaign.subject
    const recipient = await prisma.campaignRecipient.create({
      data: { companyId, campaignId: campaign.id, email: person.email, name: person.name, subject, variant, token: token(), status: 'pending' },
    })
    const links = {
      open: `${origin}/api/mail/open/${recipient.token}`,
      click: (href: string) => `${origin}/api/mail/click/${recipient.token}?url=${encodeURIComponent(href)}`,
      unsubscribe: `${origin}/api/mail/unsubscribe/${recipient.token}`,
    }
    const body = await renderMail(blocks, products, links)
    const result = await sendMail({ to: person.email, subject, text: body.text, html: body.html })
    channel = result.channel === 'log' ? 'simulate' : result.channel
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: 'sent', sentAt: new Date() },
    })
    index += 1
  }
  if (!testEmail) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { state: 'sent', sentAt: new Date(), channel },
    })
  } else if (!campaign.channel) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { channel } })
  }
  return getCampaign(companyId, campaign.id)
}

export async function recordOpen(openToken: string) {
  const row = await prisma.campaignRecipient.findUnique({ where: { token: openToken } })
  if (row && row.status !== 'pending') {
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: { openCount: { increment: 1 }, openedAt: row.openedAt ?? new Date() },
    })
  }
}

export async function recordClick(clickToken: string, url: string) {
  const target = safeUrl(url)
  const row = await prisma.campaignRecipient.findUnique({ where: { token: clickToken } })
  if (row) {
    await prisma.campaignRecipient.update({
      where: { id: row.id },
      data: { clickCount: { increment: 1 }, clickedAt: row.clickedAt ?? new Date(), openCount: row.openCount > 0 ? undefined : { increment: 1 } },
    })
  }
  return target
}

function safeUrl(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.toString()
  } catch {
    return 'about:blank'
  }
  return 'about:blank'
}

export async function unsubscribe(unsubToken: string) {
  const row = await prisma.campaignRecipient.findUnique({ where: { token: unsubToken }, include: { campaign: true } })
  if (!row) return false
  await prisma.mailMember.updateMany({ where: { companyId: row.companyId, email: row.email }, data: { status: 'unsubscribed' } })
  await prisma.mailSuppression.upsert({
    where: { companyId_email: { companyId: row.companyId, email: row.email } },
    update: { reason: 'unsubscribe link' },
    create: { companyId: row.companyId, email: row.email, reason: 'unsubscribe link' },
  })
  return true
}
