import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { createApp } from '../server/app.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let jonah = ''
let amira = ''

type Activity = { id: number; summary: string; overdue: boolean; done: boolean; lead: { name: string } }
type Board = { activities: Activity[] }
type Row = { label: string; count: number; open: number; won: number; lost: number; expected: number; conversion: number }
type Report = { rows: Row[]; totals: Row }

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
}, 180000)

afterAll(async () => {
  await prisma.$disconnect()
})

describe('crm activities and analysis', () => {
  it('schedules real activities and summarises the pipeline without moving the books', async () => {
    const before = await call('/api/reports/pnl', maya)
    const desk = await call('/api/desk', maya)
    expect(desk.body).toMatchObject({ pipelineValue: 6200, pipelineCount: 7 })

    const mine = await call('/api/crm/activities?mine=1', maya)
    const mayaRows = (mine.body as unknown as Board).activities
    const callback = mayaRows.find((row) => row.summary === 'Call back with the quote')
    expect(callback?.overdue).toBe(true)
    expect(callback?.lead.name).toBe('Spring fair — canvas totes')
    const finished = mayaRows.find((row) => row.summary === 'Send the restock list')
    expect(finished?.done).toBe(true)
    expect(finished?.overdue).toBe(false)

    const jonahRows = ((await call('/api/crm/activities?mine=1', jonah)).body as unknown as Board).activities
    expect(jonahRows.some((row) => row.summary === 'Walk the amenity kit' && row.overdue === false)).toBe(true)
    expect(jonahRows.some((row) => row.summary === 'Call back with the quote')).toBe(false)

    const late = ((await call('/api/crm/activities?overdue=1', maya)).body as unknown as Board).activities
    expect(late.every((row) => row.overdue)).toBe(true)
    expect(late.some((row) => row.summary === 'Ask why the catalogue stopped')).toBe(true)

    const done = await call(`/api/crm/activities/${late.find((row) => row.summary === 'Ask why the catalogue stopped')?.id}/done`, maya, { method: 'POST' })
    expect(done.status).toBe(200)

    const stage = (await call('/api/crm/analysis?group=stage', maya)).body as unknown as Report
    expect(stage.totals).toMatchObject({ open: 7, won: 2, lost: 2, expected: 9150, conversion: 50 })
    expect(stage.rows.find((row) => row.label === 'qualified')?.expected).toBe(3000)
    expect(stage.rows.reduce((sum, row) => sum + row.count, 0)).toBe(stage.totals.count)

    const people = (await call('/api/crm/analysis?group=user', maya)).body as unknown as Report
    expect(people.rows.find((row) => row.label === 'Jonah Ellis')).toMatchObject({ open: 3, won: 1, expected: 3300 })
    const source = (await call('/api/crm/analysis?group=source', maya)).body as unknown as Report
    expect(source.rows.find((row) => row.label === 'fair')?.expected).toBe(3600)
    const reasons = (await call('/api/crm/analysis?group=reason', maya)).body as unknown as Report
    expect(reasons.rows.find((row) => row.label === 'Price')?.expected).toBe(200)
    expect(reasons.totals.lost).toBe(2)

    const other = await call('/api/crm/tags', amira)
    expect(other.body).toEqual([])

    const csv = await createApp().request('/api/crm/analysis?group=stage&format=csv', { headers: { cookie: maya } })
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect(await csv.text()).toContain('qualified')

    const created = await call('/api/crm/tags', maya, { method: 'POST', body: JSON.stringify({ name: 'Rush' }) })
    expect(created.status).toBe(201)
    const removed = await call(`/api/crm/tags/${(created.body as { id: number }).id}`, maya, { method: 'DELETE' })
    expect(removed.status).toBe(200)

    const after = await call('/api/reports/pnl', maya)
    expect(before.body).toMatchObject({ profit: jiangbeiBooks.profit })
    expect(after.body).toEqual(before.body)
  })
})
