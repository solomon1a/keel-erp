import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''

type Row = {
  employeeName: string
  status: string
  checkIn: string | null
  checkOut: string | null
  workedHours: number | null
  late: boolean
}

type Board = { rows: Row[]; shift: { name: string; start: string; end: string } | null }

type Balance = { employeeName: string; code: string; allocated: number; used: number; remaining: number }
type LeaveRequest = { id: number; kind: string; state: string; reason: string | null; employee: { name: string }; dateFrom: string; dateTo: string }
type LeaveBoard = { balances: Balance[]; requests: LeaveRequest[]; types: Array<{ id: number; code: string }> }

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
}, 180000)

afterAll(async () => {
  await prisma.$disconnect()
})

describe('attendance and leave', () => {
  it('marks late against the shift, keeps balances, and leaves the books alone', async () => {
    const before = await call('/api/reports/pnl', maya)
    const sheet = await call('/api/attendance?from=2026-10-16&to=2026-10-17', maya)
    expect(sheet.status).toBe(200)
    const rows = (sheet.body as unknown as Board).rows
    expect((sheet.body as unknown as Board).shift).toMatchObject({ name: 'Day', start: '09:00', end: '17:30' })
    const zhou = rows.find((row) => row.employeeName === 'Zhou Ning')
    const he = rows.find((row) => row.employeeName === 'He Gong')
    const wen = rows.find((row) => row.employeeName === 'Wen Li')
    expect(zhou).toMatchObject({ status: 'present', late: false, workedHours: 8.22 })
    expect(he).toMatchObject({ status: 'late', late: true, workedHours: 8.3 })
    expect(wen?.checkOut).toBeNull()
    expect(wen?.workedHours).toBeNull()
    expect(wen?.late).toBe(false)

    const other = await call('/api/attendance?from=2026-10-16&to=2026-10-17', amira)
    expect((other.body as unknown as Board).rows.some((row) => row.employeeName === 'Zhou Ning')).toBe(false)

    const leave = await call('/api/leave?year=2026', maya)
    const board = leave.body as unknown as LeaveBoard
    const annual = board.balances.find((row) => row.employeeName === 'He Gong' && row.code === 'annual')
    const sick = board.balances.find((row) => row.employeeName === 'Sara Iqbal' && row.code === 'sick')
    expect(annual).toMatchObject({ allocated: 15, used: 3, remaining: 12 })
    expect(sick).toMatchObject({ allocated: 10, used: 2, remaining: 8 })
    expect(board.requests.find((row) => row.reason === 'City errand')?.state).toBe('refused')

    const calendar = await call('/api/leave/calendar?from=2026-10-01&to=2026-10-31', maya)
    const days = calendar.body as unknown as Array<{ employeeName: string; dateFrom: string }>
    expect(days.some((row) => row.employeeName === 'Sara Iqbal')).toBe(true)
    expect(days.some((row) => row.employeeName === 'Zhou Ning')).toBe(false)

    const waiting = await call('/api/desk', maya)
    expect(waiting.body).toMatchObject({ staff: 10, leaveWaiting: 1, profit: jiangbeiBooks.profit })

    const person = await prisma.employee.findFirstOrThrow({ where: { name: 'Yves Moreau', company: { users: { some: { email: 'maya@northline.example' } } } } })
    const checked = await call('/api/attendance/punch', maya, {
      method: 'POST',
      body: JSON.stringify({ employeeId: person.id, action: 'in' }),
    })
    expect(checked.status).toBe(200)
    expect(checked.body).toMatchObject({ checkOut: null })
    const again = await call('/api/attendance/punch', maya, {
      method: 'POST',
      body: JSON.stringify({ employeeId: person.id, action: 'in' }),
    })
    expect(again.status).toBe(409)
    const closed = await call('/api/attendance/punch', maya, {
      method: 'POST',
      body: JSON.stringify({ employeeId: person.id, action: 'out' }),
    })
    expect(closed.status).toBe(200)
    expect((closed.body as { workedHours: number | null }).workedHours).toBeGreaterThanOrEqual(0)

    const personal = board.types.find((type) => type.code === 'personal')
    expect(personal).toBeTruthy()
    const tight = await call('/api/leave/allocations', maya, {
      method: 'POST',
      body: JSON.stringify({ employeeId: person.id, leaveTypeId: personal?.id, year: 2026, days: 1 }),
    })
    expect(tight.status).toBe(200)
    const tooMuch = await call('/api/leave/requests', maya, {
      method: 'POST',
      body: JSON.stringify({ employeeId: person.id, code: 'personal', dateFrom: '2026-11-02', dateTo: '2026-11-03', reason: 'Two days' }),
    })
    expect(tooMuch.status).toBe(201)
    const tooMuchId = (tooMuch.body as unknown as LeaveBoard).requests.find((row) => row.reason === 'Two days')?.id
    const blocked = await call(`/api/leave/${tooMuchId}/approve`, maya, { method: 'POST' })
    expect(blocked.status).toBe(409)
    const one = await call('/api/leave/requests', maya, {
      method: 'POST',
      body: JSON.stringify({ employeeId: person.id, code: 'personal', dateFrom: '2026-11-10', dateTo: '2026-11-10', reason: 'One day' }),
    })
    const oneId = (one.body as unknown as LeaveBoard).requests.find((row) => row.reason === 'One day')?.id
    const approved = await call(`/api/leave/${oneId}/approve`, maya, { method: 'POST' })
    expect(approved.status).toBe(200)
    const remaining = (approved.body as unknown as LeaveBoard).balances.find((row) => row.employeeName === 'Yves Moreau' && row.code === 'personal')
    expect(remaining).toMatchObject({ allocated: 1, used: 1, remaining: 0 })

    const after = await call('/api/reports/pnl', maya)
    expect(before.body).toMatchObject({ profit: jiangbeiBooks.profit })
    expect(after.body).toEqual(before.body)
  })
})
