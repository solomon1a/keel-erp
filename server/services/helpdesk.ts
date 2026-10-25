import { randomBytes } from 'node:crypto'
import { nextName } from './accounting.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { demoClockStale, demoOpenClocks, demoTicketTimes } from './demo-sla.ts'
import { sendMail } from './mailer.ts'

const stages = ['new', 'progress', 'waiting', 'solved', 'closed'] as const
const priorities = ['low', 'normal', 'high', 'urgent'] as const

export type TicketStage = (typeof stages)[number]
export type TicketPriority = (typeof priorities)[number]

const defaultHours: Record<TicketPriority, number> = {
  low: 72,
  normal: 24,
  high: 8,
  urgent: 4,
}

const ticketInclude = {
  partner: { select: { id: true, name: true, email: true } },
  team: { select: { id: true, name: true } },
  assignee: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  messages: { orderBy: { createdAt: 'asc' as const } },
} as const

function asStage(value: unknown): TicketStage {
  if (value === 'new' || value === 'progress' || value === 'waiting' || value === 'solved' || value === 'closed') return value
  throw new AppError(400, 'Choose a stage.')
}

function asPriority(value: unknown): TicketPriority {
  if (value === 'low' || value === 'normal' || value === 'high' || value === 'urgent') return value
  throw new AppError(400, 'Choose a priority.')
}

function closedStage(stage: TicketStage) {
  return stage === 'solved' || stage === 'closed'
}

function present(ticket: {
  id: number
  number: string
  subject: string
  description: string
  priority: string
  stage: string
  slaDeadline: Date | null
  resolvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  partner: { id: number; name: string; email: string | null }
  team: { id: number; name: string } | null
  assignee: { id: number; name: string } | null
  tags: Array<{ tag: { id: number; name: string } }>
  messages: Array<{ id: number; authorName: string; body: string; internal: boolean; createdAt: Date }>
}, now = new Date()) {
  const mark = ticket.resolvedAt ?? now
  const breached = ticket.slaDeadline ? mark.getTime() > ticket.slaDeadline.getTime() : false
  const remainingMs = ticket.slaDeadline ? ticket.slaDeadline.getTime() - now.getTime() : null
  return {
    id: ticket.id,
    number: ticket.number,
    subject: ticket.subject,
    description: ticket.description,
    priority: ticket.priority,
    stage: ticket.stage,
    slaDeadline: ticket.slaDeadline,
    resolvedAt: ticket.resolvedAt,
    createdAt: ticket.createdAt,
    breached,
    remainingMs,
    partner: ticket.partner,
    team: ticket.team,
    assignee: ticket.assignee,
    tags: ticket.tags.map((row) => row.tag),
    messages: ticket.messages,
  }
}

async function hoursFor(tx: Tx, companyId: number, priority: TicketPriority) {
  const policy = await tx.slaPolicy.findUnique({ where: { companyId_priority: { companyId, priority } } })
  return policy?.hours ?? defaultHours[priority]
}

async function deadlineFor(tx: Tx, companyId: number, priority: TicketPriority, createdAt: Date) {
  const hours = await hoursFor(tx, companyId, priority)
  return new Date(createdAt.getTime() + hours * 3_600_000)
}

function mailbox(from: string) {
  const wrapped = from.match(/<([^>]+)>/)
  return (wrapped?.[1] ?? from).trim().toLowerCase()
}

async function owned(companyId: number, id: number) {
  const ticket = await prisma.ticket.findFirst({ where: { id, companyId }, include: ticketInclude })
  if (!ticket) throw new AppError(404, 'Ticket not found.')
  return ticket
}

async function replaceTags(tx: Tx, companyId: number, ticketId: number, names: string[]) {
  const clean = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  await tx.ticketTag.deleteMany({ where: { ticketId } })
  for (const name of clean) {
    const tag = await tx.helpdeskTag.upsert({
      where: { companyId_name: { companyId, name } },
      update: {},
      create: { companyId, name },
    })
    await tx.ticketTag.create({ data: { ticketId, tagId: tag.id } })
  }
}

async function healDemoClocks(companyId: number) {
  const company = await prisma.company.findFirst({
    where: { id: companyId, users: { some: { email: 'maya@northline.example' } } },
    select: { id: true },
  })
  if (!company) return
  const numbers = Object.keys(demoOpenClocks)
  const open = await prisma.ticket.findMany({
    where: { companyId, resolvedAt: null, number: { in: numbers } },
    select: { id: true, number: true, createdAt: true, slaDeadline: true },
  })
  const now = new Date()
  for (const ticket of open) {
    if (!demoClockStale(ticket.createdAt, ticket.slaDeadline, now)) continue
    const times = demoTicketTimes(ticket.number, now)
    if (!times) continue
    await prisma.ticket.update({ where: { id: ticket.id }, data: times })
  }
}

export async function helpdeskBoard(companyId: number) {
  await healDemoClocks(companyId)
  const [rows, teams, tags, policies, users, customers] = await Promise.all([
    prisma.ticket.findMany({ where: { companyId }, include: ticketInclude, orderBy: { id: 'desc' } }),
    prisma.helpdeskTeam.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
    prisma.helpdeskTag.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
    prisma.slaPolicy.findMany({ where: { companyId }, orderBy: { priority: 'asc' } }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.contact.findMany({
      where: { companyId, isCustomer: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    }),
  ])
  const now = new Date()
  const tickets = rows.map((row) => present(row, now))
  const open = tickets.filter((ticket) => ticket.stage !== 'solved' && ticket.stage !== 'closed')
  const overdue = open.filter((ticket) => ticket.breached).length
  const met = tickets.filter((ticket) => !ticket.breached).length
  const slaPercent = tickets.length === 0 ? 100 : Math.round((met / tickets.length) * 100)
  return { tickets, teams, tags, policies, users, customers, open: open.length, overdue, slaPercent }
}

export async function getTicket(companyId: number, id: number) {
  await healDemoClocks(companyId)
  return present(await owned(companyId, id))
}

export async function createTicket(
  companyId: number,
  authorName: string,
  input: { partnerId: number; subject: string; description?: string; teamId?: number | null; assigneeId?: number | null; priority?: string; tags?: string[] },
) {
  const subject = input.subject.trim()
  if (!subject) throw new AppError(400, 'Write a subject.')
  const priority = asPriority(input.priority ?? 'normal')
  return prisma.$transaction(async (tx) => {
    const partner = await tx.contact.findFirst({ where: { id: input.partnerId, companyId } })
    if (!partner) throw new AppError(400, 'Choose a customer from this company.')
    if (input.teamId) {
      const team = await tx.helpdeskTeam.findFirst({ where: { id: input.teamId, companyId } })
      if (!team) throw new AppError(400, 'Choose a team from this company.')
    }
    if (input.assigneeId) {
      const user = await tx.user.findFirst({ where: { id: input.assigneeId, companyId } })
      if (!user) throw new AppError(400, 'Choose an assignee from this company.')
    }
    await tx.sequence.upsert({
      where: { name: `helpdesk.ticket.${companyId}` },
      update: {},
      create: { name: `helpdesk.ticket.${companyId}`, next: 0 },
    })
    const number = await nextName(tx, `helpdesk.ticket.${companyId}`, 'HD')
    const createdAt = new Date()
    const ticket = await tx.ticket.create({
      data: {
        companyId,
        number,
        partnerId: partner.id,
        subject,
        description: input.description?.trim() ?? '',
        teamId: input.teamId ?? null,
        assigneeId: input.assigneeId ?? null,
        priority,
        stage: 'new',
        slaDeadline: await deadlineFor(tx, companyId, priority, createdAt),
        createdAt,
      },
    })
    await replaceTags(tx, companyId, ticket.id, input.tags ?? [])
    if (input.description?.trim()) {
      await tx.ticketMessage.create({
        data: { ticketId: ticket.id, authorName, body: input.description.trim(), internal: false },
      })
    }
    const stored = await tx.ticket.findFirstOrThrow({ where: { id: ticket.id }, include: ticketInclude })
    return present(stored)
  })
}

export async function updateTicket(
  companyId: number,
  id: number,
  input: { subject?: string; description?: string; teamId?: number | null; assigneeId?: number | null; priority?: string; stage?: string; tags?: string[] },
) {
  const current = await owned(companyId, id)
  const stage = input.stage === undefined ? asStage(current.stage) : asStage(input.stage)
  const priority = input.priority === undefined ? asPriority(current.priority) : asPriority(input.priority)
  if (input.teamId) {
    const team = await prisma.helpdeskTeam.findFirst({ where: { id: input.teamId, companyId } })
    if (!team) throw new AppError(400, 'Choose a team from this company.')
  }
  if (input.assigneeId) {
    const user = await prisma.user.findFirst({ where: { id: input.assigneeId, companyId } })
    if (!user) throw new AppError(400, 'Choose an assignee from this company.')
  }
  return prisma.$transaction(async (tx) => {
    const slaDeadline = priority === current.priority
      ? current.slaDeadline
      : await deadlineFor(tx, companyId, priority, current.createdAt)
    let resolvedAt = current.resolvedAt
    if (closedStage(stage) && !resolvedAt) resolvedAt = new Date()
    if (!closedStage(stage)) resolvedAt = null
    await tx.ticket.update({
      where: { id: current.id },
      data: {
        subject: input.subject?.trim() || current.subject,
        description: input.description === undefined ? current.description : input.description.trim(),
        teamId: input.teamId === undefined ? current.teamId : input.teamId,
        assigneeId: input.assigneeId === undefined ? current.assigneeId : input.assigneeId,
        priority,
        stage,
        slaDeadline,
        resolvedAt,
      },
    })
    if (input.tags) await replaceTags(tx, companyId, current.id, input.tags)
    const stored = await tx.ticket.findFirstOrThrow({ where: { id: current.id }, include: ticketInclude })
    return present(stored)
  })
}

export async function addTicketMessage(companyId: number, id: number, authorName: string, body: string, internal: boolean) {
  const text = body.trim()
  if (!text) throw new AppError(400, 'Write a message.')
  const ticket = await owned(companyId, id)
  const message = await prisma.ticketMessage.create({
    data: { ticketId: ticket.id, authorName, body: text, internal },
  })
  let simulated = false
  if (!internal && ticket.partner.email) {
    const subject = `Re: ${ticket.subject} (${ticket.number})`
    const result = await sendMail({ to: ticket.partner.email, subject, text })
    simulated = result.channel === 'log'
    await prisma.mailLog.create({
      data: {
        companyId,
        model: 'helpdesk.ticket',
        recordId: ticket.id,
        to: ticket.partner.email,
        subject,
        body: text,
        channel: result.channel,
      },
    })
  }
  return { ...message, simulated }
}

export async function saveSlaPolicy(companyId: number, priority: string, hours: number) {
  const kind = asPriority(priority)
  if (!Number.isInteger(hours) || hours < 1 || hours > 24 * 30) throw new AppError(400, 'SLA hours must be between 1 and 720.')
  const policy = await prisma.slaPolicy.upsert({
    where: { companyId_priority: { companyId, priority: kind } },
    update: { hours },
    create: { companyId, priority: kind, hours },
  })
  const tickets = await prisma.ticket.findMany({ where: { companyId, priority: kind, resolvedAt: null } })
  for (const ticket of tickets) {
    await prisma.ticket.update({
      where: { id: ticket.id },
      data: { slaDeadline: new Date(ticket.createdAt.getTime() + hours * 3_600_000) },
    })
  }
  return policy
}

export async function createTeam(companyId: number, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new AppError(400, 'Name the team.')
  return prisma.helpdeskTeam.create({ data: { companyId, name: trimmed } })
}

const unknownSenderName = 'Unknown sender'

type Inbound = { from: string; subject: string; text: string }

function inboundFrom(body: unknown): Inbound {
  const row = body as { from?: unknown; subject?: unknown; text?: unknown; body?: unknown; html?: unknown; data?: { from?: unknown; subject?: unknown; text?: unknown; html?: unknown } }
  const data = row.data
  const from = String(data?.from ?? row.from ?? '')
  const subject = String(data?.subject ?? row.subject ?? '').trim()
  const text = String(data?.text ?? data?.html ?? row.text ?? row.body ?? row.html ?? '').trim()
  if (!from.trim() || !subject || !text) throw new AppError(400, 'The inbound message needs a sender, subject, and body.')
  return { from, subject, text }
}

function newInboundToken() {
  return randomBytes(24).toString('base64url')
}

export async function ensureInboundToken(companyId: number) {
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { inboundToken: true } })
  if (!company) throw new AppError(404, 'Company not found.')
  if (company.inboundToken) return { token: company.inboundToken }
  const token = newInboundToken()
  const saved = await prisma.company.update({
    where: { id: companyId },
    data: { inboundToken: token },
    select: { inboundToken: true },
  })
  return { token: saved.inboundToken ?? token }
}

export async function rotateInboundToken(companyId: number) {
  const token = newInboundToken()
  await prisma.company.update({ where: { id: companyId }, data: { inboundToken: token } })
  return { token }
}

export async function companyIdForInboundToken(token: string) {
  const company = await prisma.company.findUnique({ where: { inboundToken: token }, select: { id: true } })
  if (!company) throw new AppError(401, 'That inbound secret is not valid.')
  return company.id
}

async function senderInCompany(companyId: number, email: string) {
  const partner = await prisma.contact.findFirst({
    where: { companyId, email: { equals: email, mode: 'insensitive' } },
  })
  if (partner) return partner
  const existing = await prisma.contact.findFirst({ where: { companyId, name: unknownSenderName } })
  if (existing) return existing
  return prisma.contact.create({
    data: {
      companyId,
      name: unknownSenderName,
      isCustomer: true,
      notes: 'Mail that did not match a customer in this company.',
    },
  })
}

export async function inboundTicket(companyId: number, body: unknown) {
  const message = inboundFrom(body)
  const email = mailbox(message.from)
  const partner = await senderInCompany(companyId, email)
  const fromLine = partner.name === unknownSenderName ? `\n\nFrom: ${email}` : ''
  return createTicket(companyId, partner.name, {
    partnerId: partner.id,
    subject: message.subject,
    description: `${message.text}${fromLine}`,
    priority: 'normal',
  })
}

export { stages, priorities }
