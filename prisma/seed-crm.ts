import type { PrismaClient } from '@prisma/client'

const tags = ['Wholesale', 'Retail', 'Fair']
const reasons = ['Price', 'Timing', 'Went elsewhere']

export async function seedCrm(client: PrismaClient) {
  const maya = await client.user.findUnique({ where: { email: 'maya@northline.example' } })
  const jonah = await client.user.findUnique({ where: { email: 'jonah@northline.example' } })
  if (!maya || !jonah || maya.companyId !== jonah.companyId) return
  const companyId = maya.companyId
  const marked = await client.crmTag.findFirst({ where: { companyId, name: 'Wholesale' } })
  if (marked) return

  for (const name of tags) await client.crmTag.create({ data: { companyId, name } })
  const reasonByName = new Map<string, number>()
  for (const name of reasons) {
    const reason = await client.lostReason.create({ data: { companyId, name } })
    reasonByName.set(name, reason.id)
  }
  const tagByName = new Map((await client.crmTag.findMany({ where: { companyId } })).map((tag) => [tag.name, tag.id]))

  const leads = await client.lead.findMany({ where: { companyId }, select: { id: true, name: true } })
  const byName = new Map(leads.map((lead) => [lead.name, lead.id]))
  const touch = async (name: string, data: { source: string; userId?: number; lostReasonId?: number; tags?: string[] }) => {
    const id = byName.get(name)
    if (!id) throw new Error(`CRM seed is missing ${name}.`)
    await client.lead.update({
      where: { id },
      data: { source: data.source, userId: data.userId, lostReasonId: data.lostReasonId },
    })
    for (const tagName of data.tags ?? []) {
      const tagId = tagByName.get(tagName)
      if (!tagId) throw new Error(`CRM tag ${tagName} is missing.`)
      await client.leadTag.create({ data: { leadId: id, tagId } })
    }
  }

  await touch('Spring fair — canvas totes', { source: 'fair', userId: maya.id, tags: ['Fair', 'Wholesale'] })
  await touch('Store restock enquiry', { source: 'phone', userId: maya.id, tags: ['Retail'] })
  await touch('North window bid', { source: 'website', userId: jonah.id })
  await touch('Pop-up weekend', { source: 'fair', userId: maya.id, tags: ['Fair'] })
  await touch('Hotel amenity kit', { source: 'referral', userId: jonah.id, tags: ['Wholesale'] })
  await touch('Seasonal catalogue', { source: 'email', userId: maya.id })
  await touch('Trade show follow-up', { source: 'fair', userId: jonah.id, tags: ['Fair'] })
  await touch('Airport kiosk', { source: 'referral', userId: maya.id, tags: ['Wholesale'] })
  await touch('Museum shop pass', { source: 'website', userId: maya.id, lostReasonId: reasonByName.get('Price'), tags: ['Retail'] })

  const school = await client.lead.create({
    data: {
      name: 'School uniform trial',
      contactName: 'Orchard School',
      email: 'hello@orchard.example',
      expectedRevenue: 1500,
      stage: 'won',
      source: 'referral',
      companyId,
      userId: jonah.id,
    },
  })
  const dropped = await client.lead.create({
    data: {
      name: 'Catalogue dropped',
      contactName: 'West Archive',
      email: 'buying@westarchive.example',
      expectedRevenue: 350,
      stage: 'lost',
      source: 'email',
      lostReasonId: reasonByName.get('Timing'),
      companyId,
      userId: maya.id,
    },
  })

  const spring = byName.get('Spring fair — canvas totes')
  const hotel = byName.get('Hotel amenity kit')
  const restock = byName.get('Store restock enquiry')
  if (!spring || !hotel || !restock) throw new Error('CRM activities are missing their leads.')
  await client.activity.updateMany({
    where: { leadId: spring, summary: 'Call back with the quote' },
    data: { assigneeId: maya.id },
  })
  await client.activity.create({
    data: { leadId: hotel, kind: 'meeting', summary: 'Walk the amenity kit', dueOn: new Date('2099-06-01T00:00:00.000Z'), assigneeId: jonah.id },
  })
  await client.activity.create({
    data: { leadId: restock, kind: 'todo', summary: 'Send the restock list', dueOn: new Date('2026-03-01T00:00:00.000Z'), done: true, assigneeId: maya.id },
  })
  await client.activity.create({
    data: { leadId: dropped.id, kind: 'call', summary: 'Ask why the catalogue stopped', dueOn: new Date('2026-02-01T00:00:00.000Z'), assigneeId: maya.id },
  })
  await client.leadTag.create({ data: { leadId: school.id, tagId: tagByName.get('Wholesale')! } })
}
