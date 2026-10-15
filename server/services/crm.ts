import type { CrmActivityInput, CrmLeadInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { resolveWarehouseId } from './stock.ts'

const leadInclude = {
  user: { select: { id: true, name: true } },
  contact: { select: { id: true, name: true } },
  activities: { orderBy: { id: 'desc' as const } },
} as const

async function nextOrderName(tx: Tx) {
  const sequence = await tx.sequence.update({
    where: { name: 'sales.order' },
    data: { next: { increment: 1 } },
  })
  return `SO${String(sequence.next).padStart(4, '0')}`
}

export async function listLeads(companyId: number) {
  return prisma.lead.findMany({
    where: { companyId },
    include: leadInclude,
    orderBy: { id: 'desc' },
  })
}

export async function getLead(companyId: number, leadId: number) {
  const lead = await prisma.lead.findFirst({ where: { id: leadId, companyId }, include: leadInclude })
  if (!lead) throw new AppError(404, 'Lead not found.')
  return lead
}

export async function createLead(companyId: number, userId: number, input: CrmLeadInput) {
  return prisma.lead.create({
    data: { ...input, stage: 'new', companyId, userId },
    include: leadInclude,
  })
}

export async function updateLead(companyId: number, leadId: number, input: CrmLeadInput & { stage: string }) {
  await getLead(companyId, leadId)
  return prisma.lead.update({
    where: { id: leadId },
    data: input,
    include: leadInclude,
  })
}

export async function addActivity(companyId: number, leadId: number, input: CrmActivityInput) {
  await getLead(companyId, leadId)
  await prisma.activity.create({
    data: {
      leadId,
      kind: input.kind,
      summary: input.summary,
      dueOn: input.dueOn ? new Date(`${input.dueOn}T00:00:00.000Z`) : null,
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
    return tx.lead.update({
      where: { id: lead.id },
      data: { stage: 'won', contactId: contact.id, orderId: order.id },
      include: leadInclude,
    })
  })
}
