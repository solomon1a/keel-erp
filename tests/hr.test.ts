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

type Employee = {
  id: number
  name: string
  attendances: Array<{ status: string; workDate: string }>
  leaves: Array<{ id: number; kind: string; state: string; reason: string | null }>
}

describe('hr', () => {
  it('lists the seeded roster and records a late day', async () => {
    const departments = await call('/api/departments', maya)
    expect(departments.status).toBe(200)
    const names = (departments.body as unknown as Array<{ name: string }>).map((row) => row.name)
    expect(names).toContain('Sales')
    expect(names).toContain('Production')

    const listed = await call('/api/employees', maya)
    const people = listed.body as unknown as Employee[]
    const zhou = people.find((person) => person.name === 'Zhou Ning')
    const he = people.find((person) => person.name === 'He Gong')
    expect(zhou?.attendances[0]?.status).toBe('present')
    expect(zhou?.leaves[0]?.state).toBe('draft')
    expect(he?.leaves[0]?.state).toBe('approved')
    if (!zhou) throw new Error('missing employee')

    const late = await call(`/api/employees/${zhou.id}/attendance`, maya, {
      method: 'POST',
      body: JSON.stringify({ workDate: '2026-04-15', status: 'late', note: '地铁延误' }),
    })
    expect(late.status).toBe(200)
    expect((late.body as Employee).attendances.some((row) => row.status === 'late')).toBe(true)
  })

  it('approves leave once and rejects a backwards range', async () => {
    const plant = await prisma.department.findFirstOrThrow({ where: { name: 'Production' } })
    const created = await call('/api/employees', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: '李娜',
        email: 'li.na@northline.example',
        phone: '',
        jobTitle: '质检',
        departmentId: plant.id,
        active: true,
      }),
    })
    expect(created.status).toBe(201)
    const employee = created.body as Employee

    const backwards = await call(`/api/employees/${employee.id}/leave`, maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'personal', dateFrom: '2026-06-10', dateTo: '2026-06-01', reason: '' }),
    })
    expect(backwards.status).toBe(400)

    const asked = await call(`/api/employees/${employee.id}/leave`, maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'personal', dateFrom: '2026-06-01', dateTo: '2026-06-02', reason: '家事' }),
    })
    expect(asked.status).toBe(201)
    const leaveId = (asked.body as Employee).leaves.find((row) => row.reason === '家事')?.id
    const approved = await call(`/api/employees/${employee.id}/leave/${leaveId}/approve`, maya, { method: 'POST' })
    expect((approved.body as Employee).leaves.find((row) => row.id === leaveId)?.state).toBe('approved')
    const again = await call(`/api/employees/${employee.id}/leave/${leaveId}/refuse`, maya, { method: 'POST' })
    expect(again.status).toBe(409)

    const duplicate = await call('/api/departments', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Production' }),
    })
    expect(duplicate.status).toBe(409)
  })
})