import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
})

afterAll(async () => {
  await prisma.$disconnect()
})

type Lead = {
  id: number
  name: string
  stage: string
  orderId: number | null
  activities: Array<{ id: number; summary: string; done: boolean }>
}

describe('crm', () => {
  it('moves a seeded lead, logs an activity, and converts it once', async () => {
    const listed = await call('/api/leads', maya)
    expect(listed.status).toBe(200)
    const leads = listed.body as unknown as Lead[]
    const tote = leads.find((lead) => lead.name === 'Spring fair — canvas totes')
    expect(tote?.stage).toBe('qualified')
    expect(tote?.activities.some((activity) => activity.summary === 'Call back with the quote')).toBe(true)
    if (!tote) throw new Error('missing lead')

    const moved = await call(`/api/leads/${tote.id}`, maya, {
      method: 'PATCH',
      body: JSON.stringify({
        name: tote.name,
        contactName: 'Chen Wei',
        email: 'chen@example.com',
        phone: '13900002222',
        expectedRevenue: 2400,
        stage: 'proposition',
      }),
    })
    expect(moved.status).toBe(200)
    expect((moved.body as { stage: string }).stage).toBe('proposition')

    const activity = await call(`/api/leads/${tote.id}/activities`, maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'meeting', summary: '看样品', dueOn: '2026-04-20' }),
    })
    expect(activity.status).toBe(201)
    const meeting = (activity.body as Lead).activities.find((row) => row.summary === '看样品')
    expect(meeting).toBeTruthy()
    const finished = await call(`/api/leads/${tote.id}/activities/${meeting?.id}/done`, maya, { method: 'POST' })
    expect((finished.body as Lead).activities.find((row) => row.summary === '看样品')?.done).toBe(true)

    const converted = await call(`/api/leads/${tote.id}/convert`, maya, { method: 'POST' })
    expect(converted.status).toBe(200)
    const won = converted.body as Lead
    expect(won.stage).toBe('won')
    expect(won.orderId).toBeTruthy()
    const order = await prisma.salesOrder.findFirstOrThrow({ where: { id: won.orderId ?? 0 } })
    expect(order.name).toBe('SO0003')
    expect(order.state).toBe('draft')
    expect(order.amountTotal).toBe(0)
    const customer = await prisma.contact.findFirst({ where: { email: 'chen@example.com' } })
    expect(customer?.isCustomer).toBe(true)

    const again = await call(`/api/leads/${tote.id}/convert`, maya, { method: 'POST' })
    expect(again.status).toBe(409)
  })

  it('refuses to convert a lost lead', async () => {
    const created = await call('/api/leads', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: '已放弃的询价',
        contactName: '周敏',
        email: 'zhou@example.com',
        expectedRevenue: 100,
      }),
    })
    expect(created.status).toBe(201)
    const lead = created.body as Lead
    const lost = await call(`/api/leads/${lead.id}`, maya, {
      method: 'PATCH',
      body: JSON.stringify({
        name: '已放弃的询价',
        contactName: '周敏',
        email: 'zhou@example.com',
        phone: '',
        expectedRevenue: 100,
        stage: 'lost',
      }),
    })
    expect(lost.status).toBe(200)
    const converted = await call(`/api/leads/${lead.id}/convert`, maya, { method: 'POST' })
    expect(converted.status).toBe(409)
  })
})