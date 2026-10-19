import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''
let companyId = 0

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
  companyId = (await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })).companyId
})

afterAll(async () => {
  await prisma.$disconnect()
})

type Station = {
  id: number
  name: string
  hourRate: number
  capacityHours: number
  efficiency: number
  startMinutes: number
  endMinutes: number
  availability: number | null
  performance: number | null
  quality: number | null
  oee: number | null
}

type Routing = {
  name: string
  hours: number
  workstation: { id: number; name: string; hourRate: number }
  bom: { product: { name: string } }
}

type Card = {
  id: number
  name: string
  status: string
  loggedCost: number
  loggedMinutes: number
  logs: Array<{ operatorName: string; minutes: number; endedAt: string | null }>
}

describe('work centers, routings, and job cards', () => {
  it('measures capacity, cost, and OEE from the shop that was seeded', async () => {
    const listed = await call('/api/workstations', maya)
    expect(listed.status).toBe(200)
    const stations = listed.body as unknown as Station[]
    const bench = stations.find((row) => row.name === 'Cutting bench')
    const dye = stations.find((row) => row.name === 'Dye vat')
    const hem = stations.find((row) => row.name === 'Hem station')
    expect(bench).toMatchObject({ hourRate: 60, capacityHours: 8, efficiency: 100, startMinutes: 540, endMinutes: 1020 })
    expect(dye).toMatchObject({ hourRate: 48, capacityHours: 8, efficiency: 92, oee: 62.5, availability: 83.3, performance: 75, quality: 100 })
    expect(hem).toMatchObject({ hourRate: 36, capacityHours: 6, efficiency: 88, startMinutes: 480, endMinutes: 840, oee: 53.3, availability: 83.3, performance: 80, quality: 80 })
    expect(bench?.oee).toBe(33.9)

    const other = await call('/api/workstations', amira)
    const foreign = other.body as unknown as Station[]
    const mine = new Set(stations.map((row) => row.id))
    expect(foreign.some((row) => mine.has(row.id))).toBe(false)
    expect(foreign.some((row) => row.name === 'Dye vat')).toBe(true)
  })

  it('lists operations on active bills with work center and cost', async () => {
    const listed = await call('/api/manufacturing/routings', maya)
    expect(listed.status).toBe(200)
    const rows = listed.body as unknown as Routing[]
    const cut = rows.find((row) => row.name === 'Cut and hem' && row.bom.product.name === 'Shop apron')
    const dye = rows.find((row) => row.name === 'Dye')
    const hem = rows.find((row) => row.name === 'Hem')
    expect(cut).toMatchObject({ hours: 0.5, workstation: { name: 'Cutting bench', hourRate: 60 } })
    expect(dye).toMatchObject({ hours: 1.2, workstation: { name: 'Dye vat' } })
    expect(hem).toMatchObject({ hours: 0.4, workstation: { name: 'Hem station' } })
    const hidden = await call('/api/manufacturing/routings', amira)
    const mine = new Set(rows.map((row) => row.workstation.id))
    expect((hidden.body as unknown as Routing[]).some((row) => mine.has(row.workstation.id))).toBe(false)
    expect((hidden.body as unknown as Routing[]).some((row) => row.name === 'Dye')).toBe(true)
  })

  it('starts, pauses, and finishes a job card without posting a journal', async () => {
    const journals = await prisma.journalEntry.count({ where: { companyId } })
    const card = await prisma.jobCard.findFirstOrThrow({ where: { companyId, name: `JC-QUEUE-${companyId}` } })
    const started = await call(`/api/job-cards/${card.id}/start`, maya, {
      method: 'POST',
      body: JSON.stringify({ operatorName: 'Lin' }),
    })
    expect(started.status).toBe(200)
    expect((started.body as { status?: string }).status).toBe('running')
    const open = await prisma.jobTimeLog.findFirstOrThrow({ where: { jobCardId: card.id, endedAt: null } })
    await prisma.jobTimeLog.update({ where: { id: open.id }, data: { startedAt: new Date(Date.now() - 20 * 60 * 1000) } })
    const paused = await call(`/api/job-cards/${card.id}/pause`, maya, { method: 'POST' })
    expect(paused.status).toBe(200)
    const pausedBody = paused.body as { status?: string; logs?: Array<{ minutes: number; operatorName: string }> }
    expect(pausedBody.status).toBe('paused')
    const minutes = pausedBody.logs?.find((log) => log.operatorName === 'Lin')?.minutes ?? 0
    expect(minutes).toBeGreaterThanOrEqual(20)
    expect(minutes).toBeLessThan(20.2)
    const blocked = await call(`/api/job-cards/${card.id}/start`, amira, {
      method: 'POST',
      body: JSON.stringify({ operatorName: 'Amira' }),
    })
    expect(blocked.status).toBe(404)
    const finished = await call(`/api/job-cards/${card.id}/finish`, maya, {
      method: 'POST',
      body: JSON.stringify({ completedQty: 2, rejectedQty: 1 }),
    })
    expect(finished.status).toBe(200)
    expect((finished.body as { status?: string; completedQty?: number; rejectedQty?: number }).status).toBe('done')
    expect((finished.body as { completedQty?: number }).completedQty).toBe(2)
    expect((finished.body as { rejectedQty?: number }).rejectedQty).toBe(1)
    expect(await prisma.journalEntry.count({ where: { companyId } })).toBe(journals)

    const cards = await call('/api/job-cards', maya)
    const fin = (cards.body as unknown as Card[]).find((row) => row.name === `JC-FIN-${companyId}`)
    expect(fin?.status).toBe('done')
    expect(fin?.loggedMinutes).toBe(360)
    expect(fin?.loggedCost).toBe(360)
    const foreign = await call('/api/job-cards', amira)
    expect((foreign.body as unknown as Card[]).some((row) => row.name === `JC-RUN-${companyId}`)).toBe(false)
  })

  it('rejects a duplicate work center and a shift that ends before it starts', async () => {
    const duplicate = await call('/api/workstations', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Cutting bench',
        hourRate: 60,
        capacityHours: 8,
        startMinutes: 540,
        endMinutes: 1020,
        workingDays: '1,2,3,4,5',
        efficiency: 100,
      }),
    })
    expect(duplicate.status).toBe(409)
    const backwards = await call('/api/workstations', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Night bench',
        hourRate: 10,
        capacityHours: 8,
        startMinutes: 1020,
        endMinutes: 540,
        workingDays: '1,2,3,4,5',
        efficiency: 100,
      }),
    })
    expect(backwards.status).toBe(400)
  })
})
