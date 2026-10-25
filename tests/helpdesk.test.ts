import { createHmac } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { jiangbeiHelpdeskBoard } from '../prisma/volume-plan.ts'
import { createApp } from '../server/app.ts'
import { prisma } from '../server/db.ts'
import { inboundKey, primeInboundLimit } from '../server/rate-limit.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''

type Ticket = {
  id: number
  number: string
  subject: string
  stage: string
  priority: string
  breached: boolean
  resolvedAt: string | null
  slaDeadline: string | null
  createdAt: string
  partner: { name: string; email: string | null }
  messages: Array<{ internal: boolean; body: string }>
  tags: Array<{ name: string }>
}

type Board = {
  tickets: Ticket[]
  open: number
  overdue: number
  slaPercent: number
  teams: Array<{ name: string }>
  policies: Array<{ priority: string; hours: number }>
}

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
}, 180000)

afterAll(async () => {
  await prisma.$disconnect()
})

describe('helpdesk', () => {
  it('keeps Jiangbei tickets, SLA, and mail inside that company', async () => {
    const before = await call('/api/reports/pnl', maya)
    const board = await call('/api/helpdesk', maya)
    const data = board.body as unknown as Board
    expect(board.status).toBe(200)
    expect(data.tickets).toHaveLength(jiangbeiHelpdeskBoard.tickets)
    expect(data.tickets[0]?.number.startsWith('HDV-')).toBe(true)
    expect(data.tickets.map((ticket) => ticket.number)).toEqual(expect.arrayContaining([
      'HD0001', 'HD0002', 'HD0003', 'HD0004', 'HD0005', 'HD0006',
      'HD0007', 'HD0008', 'HD0009', 'HD0010', 'HD0011', 'HD0012',
    ]))
    expect(data.open).toBe(jiangbeiHelpdeskBoard.open)
    expect(data.overdue).toBe(jiangbeiHelpdeskBoard.overdue)
    expect(data.slaPercent).toBe(jiangbeiHelpdeskBoard.slaPercent)
    const left = (number: string) => {
      const row = data.tickets.find((ticket) => ticket.number === number)
      return new Date(row?.slaDeadline ?? 0).getTime() - Date.now()
    }
    expect(left('HD0002')).toBeGreaterThan(5 * 3_600_000)
    expect(left('HD0002')).toBeLessThan(7 * 3_600_000)
    expect(left('HD0003')).toBeGreaterThan(20 * 60_000)
    expect(left('HD0003')).toBeLessThan(50 * 60_000)
    expect(left('HD0001')).toBeLessThan(-2 * 3_600_000)
    expect(left('HD0001')).toBeGreaterThan(-4 * 3_600_000)
    const met = data.tickets.find((ticket) => ticket.number === 'HD0004')
    const missed = data.tickets.find((ticket) => ticket.number === 'HD0005')
    expect(met?.resolvedAt).toBeTruthy()
    expect(met?.breached).toBe(false)
    expect(missed?.resolvedAt).toBeTruthy()
    expect(missed?.breached).toBe(true)
    expect(data.teams.map((team) => team.name).sort()).toEqual(['Front desk', 'Workshop'])
    expect(data.policies.find((policy) => policy.priority === 'urgent')?.hours).toBe(4)

    const dye = data.tickets.find((ticket) => ticket.number === 'HD0001')
    expect(dye?.breached).toBe(true)
    expect(dye?.messages.some((message) => message.internal)).toBe(true)
    expect(dye?.tags.map((tag) => tag.name)).toContain('dye')

    const other = await call('/api/helpdesk', amira)
    expect(other.status).toBe(200)
    expect((other.body as unknown as Board).tickets).toHaveLength(0)
    expect((other.body as unknown as Board).slaPercent).toBe(100)

    const cedar = data.tickets.find((ticket) => ticket.number === 'HD0002')
    expect(cedar).toBeTruthy()
    const quiet = await call(`/api/helpdesk/${cedar?.id}/messages`, maya, {
      method: 'POST',
      body: JSON.stringify({ body: 'Checking the dye book.', internal: true }),
    })
    expect(quiet.status).toBe(201)
    expect(quiet.body).toMatchObject({ simulated: false, internal: true })

    const reply = await call(`/api/helpdesk/${cedar?.id}/messages`, maya, {
      method: 'POST',
      body: JSON.stringify({ body: 'The extra carton is the second line.', internal: false }),
    })
    expect(reply.status).toBe(201)
    expect(reply.body).toMatchObject({ simulated: true, internal: false })
    const logged = await prisma.mailLog.findFirst({
      where: { model: 'helpdesk.ticket', recordId: cedar?.id, channel: 'log' },
    })
    expect(logged?.to).toBe('purchasing@harborclinic.example')
    expect(logged?.subject).toContain('HD0002')

    const created = await call('/api/helpdesk', maya, {
      method: 'POST',
      body: JSON.stringify({
        partnerId: (await prisma.contact.findFirstOrThrow({ where: { email: 'hello@cedar.example' } })).id,
        subject: 'Swatch book',
        description: 'Send the indigo swatch.',
        priority: 'normal',
        tags: ['dye'],
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ number: 'HD0013', stage: 'new', priority: 'normal' })
    const createdTicket = created.body as unknown as Ticket

    const moved = await call(`/api/helpdesk/${createdTicket.id}`, maya, {
      method: 'PATCH',
      body: JSON.stringify({ stage: 'solved' }),
    })
    expect(moved.status).toBe(200)
    expect(moved.body).toMatchObject({ stage: 'solved' })
    expect((moved.body as unknown as Ticket).resolvedAt).toBeTruthy()

    const mayaSecret = await call('/api/helpdesk/inbound-token', maya)
    const amiraSecret = await call('/api/helpdesk/inbound-token', amira)
    expect(mayaSecret.status).toBe(200)
    expect(amiraSecret.status).toBe(200)
    const mayaToken = (mayaSecret.body as { token: string }).token
    const amiraToken = (amiraSecret.body as { token: string }).token
    expect(mayaToken).not.toBe(amiraToken)
    const jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
    expect((await call('/api/helpdesk/inbound-token', jonah)).status).toBe(403)

    const open = await createApp().request('/api/helpdesk/inbound', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { from: 'Cedar & Co <hello@cedar.example>', subject: 'Where is the tote?', text: 'The tracking page stopped.' } }),
    })
    expect(open.status).toBe(401)

    const inbound = await createApp().request(`/api/helpdesk/inbound/${mayaToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ data: { from: 'Cedar & Co <hello@cedar.example>', subject: 'Where is the tote?', text: 'The tracking page stopped.' } }),
    })
    expect(inbound.status).toBe(201)
    const inboundBody = await inbound.json() as Ticket
    expect(inboundBody.number).toBe('HD0014')
    expect(inboundBody.partner.name).toBe('Cedar & Co')
    expect(inboundBody.messages[0]?.body).toContain('tracking page')

    const generic = await createApp().request('/api/helpdesk/inbound', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-keel-inbound-secret': mayaToken },
      body: JSON.stringify({ from: 'milo.park@example.com', subject: 'One more blanket', body: 'Add a charcoal one if you still have it.' }),
    })
    expect(generic.status).toBe(201)
    expect((await generic.json() as Ticket).partner.name).toBe('Milo Park')

    const unknown = await createApp().request(`/api/helpdesk/inbound/${mayaToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'nobody@nope.example', subject: 'Hello from outside', text: 'Is anyone there?' }),
    })
    expect(unknown.status).toBe(201)
    const unknownBody = await unknown.json() as Ticket
    expect(unknownBody.partner.name).toBe('Unknown sender')
    expect(unknownBody.messages[0]?.body).toContain('nobody@nope.example')

    const crossed = await createApp().request(`/api/helpdesk/inbound/${amiraToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'hello@cedar.example', subject: 'Cross tenant dye', text: 'This must stay in Harbour.' }),
    })
    expect(crossed.status).toBe(201)
    expect((await crossed.json() as Ticket).partner.name).toBe('Unknown sender')
    const harbourBoard = (await call('/api/helpdesk', amira)).body as unknown as Board
    expect(harbourBoard.tickets.some((ticket) => ticket.subject === 'Cross tenant dye' && ticket.partner.name === 'Unknown sender')).toBe(true)
    const jiangbeiSubjects = ((await call('/api/helpdesk', maya)).body as unknown as Board).tickets.map((ticket) => ticket.subject)
    expect(jiangbeiSubjects).not.toContain('Cross tenant dye')

    const moss = await createApp().request('/api/helpdesk/inbound', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-keel-inbound-secret': mayaToken },
      body: JSON.stringify({ from: 'hello@mossgrey.example', subject: 'Harbour customer wrote here', text: 'Wrong company.' }),
    })
    expect(moss.status).toBe(201)
    expect((await moss.json() as Ticket).partner.name).toBe('Unknown sender')
    const harbourSubjects = ((await call('/api/helpdesk', amira)).body as unknown as Board).tickets.map((ticket) => ticket.subject)
    expect(harbourSubjects).not.toContain('Harbour customer wrote here')

    const mismatched = await createApp().request(`/api/helpdesk/inbound/${mayaToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-keel-inbound-secret': amiraToken },
      body: JSON.stringify({ from: 'hello@cedar.example', subject: 'Split secret', text: 'No.' }),
    })
    expect(mismatched.status).toBe(401)

    const previous = process.env.RESEND_WEBHOOK_SECRET
    const rawKey = Buffer.from('keel-test-secret')
    process.env.RESEND_WEBHOOK_SECRET = `whsec_${rawKey.toString('base64')}`
    const signedBody = JSON.stringify({ from: 'hello@cedar.example', subject: 'Signed tote', text: 'The webhook was signed.' })
    const stamp = String(Math.floor(Date.now() / 1000))
    const digest = createHmac('sha256', rawKey).update(`msg_1.${stamp}.${signedBody}`).digest('base64')
    const unsigned = await createApp().request(`/api/helpdesk/inbound/${mayaToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: signedBody,
    })
    expect(unsigned.status).toBe(401)
    const signed = await createApp().request(`/api/helpdesk/inbound/${mayaToken}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'svix-id': 'msg_1',
        'svix-timestamp': stamp,
        'svix-signature': `v1,${digest}`,
      },
      body: signedBody,
    })
    expect(signed.status).toBe(201)
    if (previous === undefined) delete process.env.RESEND_WEBHOOK_SECRET
    else process.env.RESEND_WEBHOOK_SECRET = previous

    primeInboundLimit(inboundKey(mayaToken))
    const flooded = await createApp().request(`/api/helpdesk/inbound/${mayaToken}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'hello@cedar.example', subject: 'Too fast', text: 'Stop.' }),
    })
    expect(flooded.status).toBe(429)

    const locked = await createApp().request('/api/helpdesk', { method: 'GET' })
    expect(locked.status).toBe(401)

    const company = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' }, select: { companyId: true } })
    await prisma.ticket.update({
      where: { companyId_number: { companyId: company.companyId, number: 'HD0002' } },
      data: { slaDeadline: new Date('2099-01-01T00:00:00.000Z'), createdAt: new Date('2020-01-01T00:00:00.000Z') },
    })
    const healed = (await call('/api/helpdesk', maya)).body as unknown as Board
    const restored = healed.tickets.find((ticket) => ticket.number === 'HD0002')
    const restoredLeft = new Date(restored?.slaDeadline ?? 0).getTime() - Date.now()
    expect(restoredLeft).toBeGreaterThan(5 * 3_600_000)
    expect(restoredLeft).toBeLessThan(7 * 3_600_000)

    const low = healed.tickets.find((ticket) => ticket.number === 'HD0008')
    const policy = await call('/api/helpdesk/sla', maya, {
      method: 'POST',
      body: JSON.stringify({ priority: 'low', hours: 48 }),
    })
    expect(policy.status).toBe(200)
    const refreshed = await call(`/api/helpdesk/${low?.id}`, maya)
    const nextDeadline = new Date(low?.createdAt ?? 0).getTime() + 48 * 3_600_000
    expect(new Date((refreshed.body as unknown as Ticket).slaDeadline ?? '').getTime()).toBe(nextDeadline)

    const after = await call('/api/reports/pnl', maya)
    expect(before.body).toMatchObject({ profit: jiangbeiBooks.profit })
    expect(after.body).toEqual(before.body)
  })
})
