import type { CrmActivityInput, CrmLeadInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { resolveWarehouseId } from './stock.ts'

const leadInclude = {
  user: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true } },
  lostReason: { select: { id: true, name: true } },
  tags: { include: { tag: { select: { id: true, name: true } } } },
  activities: {
    orderBy: { id: 'desc' as const },
    include: { assignee: { select: { id: true, name: true } } },
  },
} as const

const sources = ['', 'website', 'referral', 'fair', 'phone', 'email'] as const

function asSource(value: string | undefined) {
  if (value === undefined) return undefined
  if (sources.includes(value as (typeof sources)[number])) return value
  throw new AppError(400, 'Choose a source.')
}

async function replaceTags(companyId: number, leadId: number, names: string[]) {
  const clean = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  await prisma.leadTag.deleteMany({ where: { leadId } })
  for (const name of clean) {
    const tag = await prisma.crmTag.upsert({
      where: { companyId_name: { companyId, name } },
      update: {},
      create: { companyId, name },
    })
    await prisma.leadTag.create({ data: { leadId, tagId: tag.id } })
  }
}

function presentLead<T extends { tags: Array<{ tag: { id: number; name: string } }> }>(lead: T) {
  return { ...lead, tags: lead.tags.map((row) => row.tag) }
}

async function nextOrderName(tx: Tx) {
  const sequence = await tx.sequence.update({
    where: { name: 'sales.order' },
    data: { next: { increment: 1 } },
  })
  return `SO${String(sequence.next).padStart(4, '0')}`
}

export async function listLeads(companyId: number) {
  const rows = await prisma.lead.findMany({
    where: { companyId },
    include: leadInclude,
    orderBy: { id: 'desc' },
  })
  return rows.map(presentLead)
}

export async function getLead(companyId: number, leadId: number) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId }, include: leadInclude })
  if (!lead) throw new AppError(404, 'Lead not found.')
  return presentLead(lead)
}

async function reasonInCompany(companyId: number, lostReasonId: number | null | undefined) {
  if (lostReasonId === undefined) return undefined
  if (lostReasonId === null) return null
  const reason = await prisma.lostReason.findFirst({ where: { id: lostReasonId, companyId } })
  if (!reason) throw new AppError(400, 'Choose a lost reason from this company.')
  return reason.id
}

async function assigneeInCompany(companyId: number, assigneeId: number | null | undefined) {
  if (assigneeId === undefined) return undefined
  if (assigneeId === null) return null
  const user = await prisma.user.findFirst({ where: { id: assigneeId, companyId } })
  if (!user) throw new AppError(400, 'Choose a person from this company.')
  return user.id
}

export async function createLead(companyId: number, userId: number, input: CrmLeadInput) {
  const lostReasonId = await reasonInCompany(companyId, input.lostReasonId)
  const lead = await prisma.lead.create({
    data: {
      name: input.name,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      expectedRevenue: input.expectedRevenue,
      source: asSource(input.source) ?? '',
      lostReasonId: lostReasonId ?? null,
      stage: 'new',
      companyId,
      userId,
    },
  })
  if (input.tags) await replaceTags(companyId, lead.id, input.tags)
  return getLead(companyId, lead.id)
}

export async function updateLead(companyId: number, leadId: number, input: CrmLeadInput & { stage: string }) {
  await getLead(companyId, leadId)
  const lostReasonId = await reasonInCompany(companyId, input.lostReasonId)
  await prisma.lead.update({
    where: { id: leadId },
    data: {
      name: input.name,
      contactName: input.contactName,
      email: input.email,
      phone: input.phone,
      expectedRevenue: input.expectedRevenue,
      stage: input.stage,
      ...(input.source === undefined ? {} : { source: asSource(input.source) }),
      ...(lostReasonId === undefined ? {} : { lostReasonId }),
    },
  })
  if (input.tags) await replaceTags(companyId, leadId, input.tags)
  return getLead(companyId, leadId)
}

export async function addActivity(companyId: number, leadId: number, input: CrmActivityInput, fallbackAssignee?: number) {
  await getLead(companyId, leadId)
  const assigneeId = await assigneeInCompany(companyId, input.assigneeId === undefined ? fallbackAssignee : input.assigneeId)
  await prisma.activity.create({
    data: {
      leadId,
      kind: input.kind,
      summary: input.summary,
      dueOn: input.dueOn ? new Date(`${input.dueOn}T00:00:00.000Z`) : null,
      assigneeId: assigneeId ?? null,
    },
  })
  return getLead(companyId, leadId)
}

export async function completeActivity(companyId: number, leadId: number, activityId: number) {
  const activity = await prisma.activity.findFirst({ where: { id: activityId, leadId, lead: { companyId } } })
  if (!activity) throw new AppError(404, 'Activity not found.')
  await prisma.activity.update({ where: { id: activity.id }, data: { done: true } })
  return getLead(companyId, leadId)
}

export async function convertLead(companyId: number, userId: number, leadId: number) {
  return prisma.$transaction(async (tx) => {
    const lead = await tx.lead.findFirst({ where: { id: leadId, companyId } })
    if (!lead) throw new AppError(404, 'Lead not found.')
    if (lead.stage === 'won' || lead.orderId) throw new AppError(409, 'This lead is already a quotation.')
    if (lead.stage === 'lost') throw new AppError(409, 'A lost lead is not converted.')
    let contact = lead.email
      ? await tx.contact.findFirst({ where: { companyId, email: lead.email } })
      : null
    if (!contact && lead.contactId) {
      contact = await tx.contact.findFirst({ where: { id: lead.contactId, companyId } })
    }
    if (!contact) {
      contact = await tx.contact.create({
        data: {
          name: lead.contactName,
          email: lead.email,
          phone: lead.phone,
          isCustomer: true,
          companyId,
          createdById: userId,
          updatedById: userId,
        },
      })
    } else if (!contact.isCustomer) {
      contact = await tx.contact.update({ where: { id: contact.id }, data: { isCustomer: true } })
    }
    const warehouseId = await resolveWarehouseId(tx, companyId, null)
    const order = await tx.salesOrder.create({
      data: {
        name: await nextOrderName(tx),
        state: 'draft',
        customerId: contact.id,
        companyId,
        warehouseId,
        dateOrder: new Date(),
        amountUntaxed: 0,
        amountTax: 0,
        amountTotal: 0,
        createdById: userId,
      },
    })
    return presentLead(await tx.lead.update({
      where: { id: lead.id },
      data: { stage: 'won', contactId: contact.id, orderId: order.id },
      include: leadInclude,
    }))
  })
}

function startOfToday(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

function presentActivity(row: {
  id: number
  leadId: number
  kind: string
  summary: string
  dueOn: Date | null
  done: boolean
  assignee: { id: number; name: string } | null
  lead: { id: number; name: string; user: { id: number; name: string } | null }
}, today: Date) {
  const overdue = !row.done && row.dueOn !== null && row.dueOn.getTime() < today.getTime()
  return { ...row, overdue }
}

export async function activityBoard(companyId: number, userId: number, mine: boolean, overdue: boolean) {
  const today = startOfToday()
  const [rows, leads, users] = await Promise.all([
    prisma.activity.findMany({
      where: {
        lead: { companyId },
        ...(mine ? { OR: [{ assigneeId: userId }, { assigneeId: null, lead: { userId } }] } : {}),
        ...(overdue ? { done: false, dueOn: { lt: today } } : {}),
      },
      include: {
        assignee: { select: { id: true, name: true } },
        lead: { select: { id: true, name: true, user: { select: { id: true, name: true } } } },
      },
      orderBy: [{ dueOn: 'asc' }, { id: 'asc' }],
    }),
    prisma.lead.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ])
  return { activities: rows.map((row) => presentActivity(row, today)), leads, users }
}

export async function completeActivityById(companyId: number, activityId: number) {
  const activity = await prisma.activity.findFirst({ where: { id: activityId, lead: { companyId } } })
  if (!activity) throw new AppError(404, 'Activity not found.')
  await prisma.activity.update({ where: { id: activity.id }, data: { done: true } })
  return { id: activity.id, done: true }
}

export async function scheduleActivity(companyId: number, userId: number, input: CrmActivityInput) {
  if (!input.leadId) throw new AppError(400, 'Choose a lead.')
  await addActivity(companyId, input.leadId, input, input.assigneeId === undefined ? userId : undefined)
  return activityBoard(companyId, userId, false, false)
}

export async function listTags(companyId: number) {
  return prisma.crmTag.findMany({ where: { companyId }, orderBy: { name: 'asc' }, include: { _count: { select: { leads: true } } } })
}

export async function createTag(companyId: number, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new AppError(400, 'Name the tag.')
  return prisma.crmTag.create({ data: { companyId, name: trimmed } })
}

export async function removeTag(companyId: number, id: number) {
  const tag = await prisma.crmTag.findFirst({ where: { id, companyId } })
  if (!tag) throw new AppError(404, 'Tag not found.')
  await prisma.crmTag.delete({ where: { id: tag.id } })
  return { ok: true }
}

export async function listLostReasons(companyId: number) {
  return prisma.lostReason.findMany({ where: { companyId }, orderBy: { name: 'asc' }, include: { _count: { select: { leads: true } } } })
}

export async function createLostReason(companyId: number, name: string) {
  const trimmed = name.trim()
  if (!trimmed) throw new AppError(400, 'Name the reason.')
  return prisma.lostReason.create({ data: { companyId, name: trimmed } })
}

export async function removeLostReason(companyId: number, id: number) {
  const reason = await prisma.lostReason.findFirst({ where: { id, companyId } })
  if (!reason) throw new AppError(404, 'Lost reason not found.')
  await prisma.lostReason.delete({ where: { id: reason.id } })
  return { ok: true }
}
