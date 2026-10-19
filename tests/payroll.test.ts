import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords, seedDatabase } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let jonah = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
})

afterAll(async () => {
  await prisma.$disconnect()
})

type Slip = { gross: number; deduction: number; net: number; lines: Array<{ code: string; amount: number }> }
type Run = { id: number; name: string; state: string; payslips: Slip[] }
type Claim = { id: number; name: string; state: string; amount: number }

describe('payroll and expenses', () => {
  it('seeds a posted China payslip and posts a later month once', async () => {
    const listed = await call('/api/payroll', maya)
    expect(listed.status).toBe(200)
    const runs = listed.body as unknown as Run[]
    const april = runs.find((run) => run.name === 'PR0001')
    expect(april?.state).toBe('posted')
    const slip = april?.payslips[0]
    expect(slip).toMatchObject({ gross: 12000, deduction: 2380, net: 9620 })
    expect(slip && slip.net + slip.deduction).toBe(slip?.gross)
    expect(slip?.lines.find((line) => line.code === 'CN_IIT')?.amount).toBe(280)

    const again = await call('/api/payroll', maya, { method: 'POST', body: JSON.stringify({ period: '2026-04' }) })
    expect(again.status).toBe(409)

    const created = await call('/api/payroll', maya, { method: 'POST', body: JSON.stringify({ period: '2099-06' }) })
    expect(created.status).toBe(201)
    const draft = created.body as Run
    expect(draft.state).toBe('draft')
    const blocked = await call(`/api/payroll/${draft.id}/post`, jonah, { method: 'POST' })
    expect(blocked.status).toBe(403)
    const posted = await call(`/api/payroll/${draft.id}/post`, maya, { method: 'POST' })
    expect(posted.status).toBe(200)
    expect((posted.body as Run).state).toBe('posted')
    const twice = await call(`/api/payroll/${draft.id}/post`, maya, { method: 'POST' })
    expect(twice.status).toBe(409)

    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { payrollRun: { id: draft.id } },
      include: { lines: true },
    })
    const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0)
    const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0)
    expect(debit).toBe(12000)
    expect(credit).toBe(12000)
  })

  it('approves and reimburses a claim, and keeps one seeded run', async () => {
    const listed = await call('/api/expenses', maya)
    const claims = listed.body as unknown as Claim[]
    const cafe = claims.find((claim) => claim.name === 'EX0002')
    expect(cafe?.state).toBe('submitted')
    expect(cafe?.amount).toBe(18)
    if (!cafe) throw new Error('missing claim')

    const denied = await call(`/api/expenses/${cafe.id}/approve`, jonah, { method: 'POST' })
    expect(denied.status).toBe(403)
    const approved = await call(`/api/expenses/${cafe.id}/approve`, maya, { method: 'POST' })
    expect((approved.body as Claim).state).toBe('approved')
    const paid = await call(`/api/expenses/${cafe.id}/reimburse`, maya, { method: 'POST' })
    expect((paid.body as Claim).state).toBe('reimbursed')
    const entry = await prisma.journalEntry.findFirstOrThrow({
      where: { expenseClaim: { id: cafe.id } },
      include: { lines: true },
    })
    expect(entry.lines.reduce((sum, line) => sum + line.debit, 0)).toBe(18)
    expect(entry.lines.reduce((sum, line) => sum + line.credit, 0)).toBe(18)

    const amira = await signIn('amira@harbourline.example', demoPasswords.amira)
    const uk = await call('/api/payroll', amira)
    const ukSlip = (uk.body as unknown as Run[]).find((run) => run.name === 'PR0001')?.payslips[0]
    expect(ukSlip).toMatchObject({ gross: 3200, deduction: 602.66, net: 2597.34 })

    const jordan = await signIn('jordan@hudsonyard.example', demoPasswords.jordan)
    const us = await call('/api/payroll', jordan)
    const usSlip = (us.body as unknown as Run[]).find((run) => run.name === 'PR0001')?.payslips[0]
    expect(usSlip).toMatchObject({ gross: 5200, deduction: 1000.8, net: 4199.2 })

    await seedDatabase(prisma)
    const china = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    expect(await prisma.payrollRun.count({ where: { companyId: china.companyId, name: 'PR0001' } })).toBe(1)
    expect(await prisma.expenseClaim.count({ where: { companyId: china.companyId, name: 'EX0001' } })).toBe(1)
    expect(await prisma.company.count()).toBe(3)
  })
})
