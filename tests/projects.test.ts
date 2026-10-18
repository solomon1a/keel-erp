import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('projects', () => {
  it('invoices approved time, marks the timesheet, and reports profit', async () => {
    const company = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    const customer = await prisma.contact.findFirstOrThrow({ where: { companyId: company.companyId, name: 'Harbor Clinic' } })
    const employee = await prisma.employee.findFirstOrThrow({ where: { companyId: company.companyId, name: 'He Gong' } })
    await prisma.employee.update({ where: { id: employee.id }, data: { hourlyCost: 30, hourlyRate: 80 } })
    const created = await call('/api/projects', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Clinic refit', partnerId: customer.id, billingType: 'time', hourlyRate: 50 }),
    })
    expect(created.status).toBe(201)
    const projectId = (created.body as { id: number }).id
    const withTask = await call(`/api/projects/${projectId}/tasks`, maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Hang the sign', startDate: '2026-10-01', endDate: '2026-10-03' }),
    })
    const taskId = (withTask.body as { tasks: Array<{ id: number; name: string }> }).tasks.find((task) => task.name === 'Hang the sign')?.id
    if (!taskId) throw new Error('missing task')
    const sheet = await call(`/api/projects/${projectId}/timesheets`, maya, {
      method: 'POST',
      body: JSON.stringify({ taskId, employeeId: employee.id, workDate: '2026-10-02', hours: 2 }),
    })
    const timesheetId = (sheet.body as { timesheets: Array<{ id: number; state: string }> }).timesheets[0]?.id
    if (!timesheetId) throw new Error('missing timesheet')
    expect((await call(`/api/projects/timesheets/${timesheetId}/approve`, maya, { method: 'POST' })).status).toBe(200)
    const invoiced = await call(`/api/projects/${projectId}/invoice`, maya, { method: 'POST' })
    expect(invoiced.status).toBe(201)
    const invoice = invoiced.body as { id: number; state: string; amountUntaxed: number; amountTax: number; amountTotal: number; projectId: number }
    expect(invoice.state).toBe('posted')
    expect(invoice.amountUntaxed).toBe(160)
    expect(invoice.amountTotal).toBe(180.8)
    expect(invoice.projectId).toBe(projectId)
    const entry = await prisma.journalEntry.findFirstOrThrow({ where: { invoiceId: invoice.id }, include: { lines: true } })
    expect(entry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(entry.lines.reduce((sum, line) => sum + line.credit, 0))
    const marked = await prisma.timesheet.findUniqueOrThrow({ where: { id: timesheetId } })
    expect(marked.state).toBe('invoiced')
    expect(marked.invoiceId).toBe(invoice.id)
    const profit = await call(`/api/projects/${projectId}/profitability`, maya)
    expect(profit.body).toMatchObject({ revenue: 160, timesheetCost: 60, profit: 100 })
    expect((await call(`/api/projects/${projectId}`, amira)).status).toBe(404)
    expect((await call(`/api/projects/${projectId}/invoice`, maya, { method: 'POST' })).status).toBe(400)
  })

  it('invoices an approved fixed-price milestone', async () => {
    const company = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    const customer = await prisma.contact.findFirstOrThrow({ where: { companyId: company.companyId, name: 'Milo Park' } })
    const created = await call('/api/projects', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Park kiosk', partnerId: customer.id, billingType: 'fixed' }),
    })
    const projectId = (created.body as { id: number }).id
    const added = await call(`/api/projects/${projectId}/milestones`, maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Frame standing', amount: 1000 }),
    })
    const milestoneId = (added.body as { milestones: Array<{ id: number }> }).milestones[0]?.id
    if (!milestoneId) throw new Error('missing milestone')
    expect((await call(`/api/projects/milestones/${milestoneId}/approve`, maya, { method: 'POST' })).status).toBe(200)
    const invoiced = await call(`/api/projects/${projectId}/invoice`, maya, { method: 'POST' })
    expect((invoiced.body as { amountUntaxed: number; state: string }).amountUntaxed).toBe(1000)
    expect((invoiced.body as { state: string }).state).toBe('posted')
    const milestone = await prisma.projectMilestone.findUniqueOrThrow({ where: { id: milestoneId } })
    expect(milestone.state).toBe('invoiced')
  })
})
