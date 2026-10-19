import type { PrismaClient } from '@prisma/client'
import { demoTicketTimes } from '../server/services/demo-sla.ts'

type SeedTicket = {
  number: string
  partner: string
  subject: string
  description: string
  priority: string
  stage: string
  team: string
  assignee: string
  tags: string[]
  deadline: string | null
  created: string | null
  resolved: string | null
  note: string
  internal: boolean
}

const tickets: SeedTicket[] = [
  { number: 'HD0001', partner: 'Cedar & Co', subject: 'Dye lot came out grey', description: 'The canvas we received is grey, not the indigo on the swatch.', priority: 'high', stage: 'progress', team: 'Workshop', assignee: 'maya@northline.example', tags: ['dye'], deadline: null, created: null, resolved: null, note: 'Checking the last dye bath. Do not tell the customer yet.', internal: true },
  { number: 'HD0002', partner: 'Harbor Clinic', subject: 'Question on the April invoice', description: 'Which line is the extra notebook carton?', priority: 'normal', stage: 'new', team: 'Front desk', assignee: 'maya@northline.example', tags: ['billing'], deadline: null, created: null, resolved: null, note: 'Please point us at the line.', internal: false },
  { number: 'HD0003', partner: 'Milo Park', subject: 'Gift blankets have not arrived', description: 'The client event is this week and the carton is still in transit.', priority: 'urgent', stage: 'waiting', team: 'Front desk', assignee: 'jonah@northline.example', tags: ['delivery'], deadline: null, created: null, resolved: null, note: 'Waiting on the carrier scan.', internal: true },
  { number: 'HD0004', partner: 'Lin Xiao', subject: 'Shop order missing a notebook', description: 'The tote arrived. The field notebook did not.', priority: 'low', stage: 'solved', team: 'Front desk', assignee: 'maya@northline.example', tags: ['shop'], deadline: '2026-10-05T00:00:00.000Z', created: '2026-09-30T08:00:00.000Z', resolved: '2026-10-02T00:00:00.000Z', note: 'We posted a replacement the next morning.', internal: false },
  { number: 'HD0005', partner: 'Avery Lang', subject: 'Replacement notebook is the wrong size', description: 'A5 was ordered. The parcel is A6.', priority: 'normal', stage: 'solved', team: 'Workshop', assignee: 'jonah@northline.example', tags: ['shop'], deadline: '2026-10-06T00:00:00.000Z', created: '2026-10-04T08:00:00.000Z', resolved: '2026-10-08T00:00:00.000Z', note: 'The right size went out after the deadline.', internal: false },
  { number: 'HD0006', partner: 'Cedar & Co', subject: 'Duplicate charge on the retainer', description: 'Two identical lines on the same week.', priority: 'high', stage: 'closed', team: 'Front desk', assignee: 'maya@northline.example', tags: ['billing'], deadline: '2026-10-04T00:00:00.000Z', created: '2026-10-02T08:00:00.000Z', resolved: '2026-10-03T00:00:00.000Z', note: 'Credit note issued the same day.', internal: false },
  { number: 'HD0007', partner: 'Harbor Clinic', subject: 'One apron missing from the carton', description: 'The packing list says six. We counted five.', priority: 'normal', stage: 'progress', team: 'Workshop', assignee: 'jonah@northline.example', tags: ['delivery'], deadline: null, created: null, resolved: null, note: 'Recounting the finished-goods bin.', internal: true },
  { number: 'HD0008', partner: 'Milo Park', subject: 'Can the blankets be gift wrapped?', description: 'Plain kraft is fine. No ribbon.', priority: 'low', stage: 'new', team: 'Workshop', assignee: 'maya@northline.example', tags: ['shop'], deadline: null, created: null, resolved: null, note: 'Kraft wrap is in stock.', internal: false },
  { number: 'HD0009', partner: 'Lin Xiao', subject: 'Return the extra yarn spool', description: 'The shop checkout added a spool I did not mean to buy.', priority: 'normal', stage: 'waiting', team: 'Front desk', assignee: 'jonah@northline.example', tags: ['shop', 'billing'], deadline: null, created: null, resolved: null, note: 'Waiting for the spool to come back.', internal: false },
  { number: 'HD0010', partner: 'Avery Lang', subject: 'Which notebook fits a coat pocket?', description: 'Need a size before the next order.', priority: 'high', stage: 'solved', team: 'Front desk', assignee: 'maya@northline.example', tags: ['shop'], deadline: '2026-10-13T00:00:00.000Z', created: '2026-10-10T08:00:00.000Z', resolved: '2026-10-12T00:00:00.000Z', note: 'A6 is the pocket size. A5 is the desk size.', internal: false },
  { number: 'HD0011', partner: 'Cedar & Co', subject: 'Workshop visit next month', description: 'Two buyers want to see the dye room.', priority: 'urgent', stage: 'closed', team: 'Workshop', assignee: 'jonah@northline.example', tags: ['dye'], deadline: '2026-10-17T00:00:00.000Z', created: '2026-10-15T08:00:00.000Z', resolved: '2026-10-16T00:00:00.000Z', note: 'Thursday morning is held for them.', internal: false },
  { number: 'HD0012', partner: 'Harbor Clinic', subject: 'Renew the supply arrangement', description: 'The current arrangement ends in September.', priority: 'normal', stage: 'closed', team: 'Front desk', assignee: 'maya@northline.example', tags: ['billing'], deadline: '2026-09-02T00:00:00.000Z', created: '2026-08-28T08:00:00.000Z', resolved: '2026-09-10T00:00:00.000Z', note: 'The new arrangement was signed after the deadline.', internal: false },
]

const policies = [
  { priority: 'urgent', hours: 4 },
  { priority: 'high', hours: 8 },
  { priority: 'normal', hours: 24 },
  { priority: 'low', hours: 72 },
]

export async function seedHelpdesk(client: PrismaClient) {
  const admin = await client.user.findUnique({ where: { email: 'maya@northline.example' } })
  if (!admin) return
  const companyId = admin.companyId
  const existing = await client.ticket.findFirst({ where: { companyId, number: 'HD0001' } })
  if (existing) return

  const users = await client.user.findMany({ where: { companyId }, select: { id: true, email: true, name: true } })
  const userByEmail = new Map(users.map((user) => [user.email, user]))
  const partners = await client.contact.findMany({ where: { companyId }, select: { id: true, name: true } })
  const partnerByName = new Map(partners.map((partner) => [partner.name, partner]))

  const front = await client.helpdeskTeam.create({ data: { companyId, name: 'Front desk' } })
  const workshop = await client.helpdeskTeam.create({ data: { companyId, name: 'Workshop' } })
  const teamByName = new Map([[front.name, front], [workshop.name, workshop]])

  for (const policy of policies) {
    await client.slaPolicy.create({ data: { companyId, priority: policy.priority, hours: policy.hours } })
  }

  const tagNames = [...new Set(tickets.flatMap((ticket) => ticket.tags))]
  const tagByName = new Map<string, { id: number }>()
  for (const name of tagNames) {
    const tag = await client.helpdeskTag.create({ data: { companyId, name } })
    tagByName.set(name, tag)
  }

  for (const row of tickets) {
    const partner = partnerByName.get(row.partner)
    const assignee = userByEmail.get(row.assignee)
    const team = teamByName.get(row.team)
    if (!partner || !assignee || !team) throw new Error(`Helpdesk seed is missing ${row.partner}, ${row.assignee}, or ${row.team}.`)
    const openClock = demoTicketTimes(row.number)
    const ticket = await client.ticket.create({
      data: {
        companyId,
        number: row.number,
        partnerId: partner.id,
        subject: row.subject,
        description: row.description,
        teamId: team.id,
        assigneeId: assignee.id,
        priority: row.priority,
        stage: row.stage,
        slaDeadline: openClock?.slaDeadline ?? (row.deadline ? new Date(row.deadline) : null),
        resolvedAt: row.resolved ? new Date(row.resolved) : null,
        createdAt: openClock?.createdAt ?? (row.created ? new Date(row.created) : new Date()),
      },
    })
    for (const name of row.tags) {
      const tag = tagByName.get(name)
      if (!tag) throw new Error(`Helpdesk tag ${name} is missing.`)
      await client.ticketTag.create({ data: { ticketId: ticket.id, tagId: tag.id } })
    }
    await client.ticketMessage.create({
      data: { ticketId: ticket.id, authorName: partner.name, body: row.description, internal: false },
    })
    await client.ticketMessage.create({
      data: { ticketId: ticket.id, authorName: assignee.name, body: row.note, internal: row.internal },
    })
  }

  await client.sequence.upsert({
    where: { name: `helpdesk.ticket.${companyId}` },
    update: { next: 12 },
    create: { name: `helpdesk.ticket.${companyId}`, next: 12 },
  })
}
