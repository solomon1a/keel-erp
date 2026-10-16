import type { PrismaClient } from '@prisma/client'
import { roundMoney } from '../src/domain/money.ts'
import type { Tx } from '../server/db.ts'
import { ensurePayrollAccounts, estimatePayslip } from '../server/services/payroll.ts'

const demoPay = [
  { email: 'maya@northline.example', employeeEmail: 'zhou.ning@northline.example', gross: 12000, claim: 128, merchant: 'Shanghai Metro', receipt: 'metro-2026-04-02.pdf' },
  { email: 'amira@harbourline.example', employeeName: 'Noah Blake', gross: 3200, claim: 42, merchant: 'TfL', receipt: 'tfl-2026-04-03.pdf' },
  { email: 'jordan@hudsonyard.example', employeeName: 'Chris Adelman', gross: 5200, claim: 36, merchant: 'MTA', receipt: 'mta-2026-04-04.pdf' },
] as const

async function entryName(tx: Tx, companyId: number) {
  const name = `account.entry.${companyId}`
  await tx.sequence.upsert({ where: { name }, update: {}, create: { name, next: 0 } })
  const sequence = await tx.sequence.update({ where: { name }, data: { next: { increment: 1 } } })
  return `JE${String(sequence.next).padStart(4, '0')}`
}

async function seedOne(client: PrismaClient, row: (typeof demoPay)[number]) {
  const admin = await client.user.findUnique({ where: { email: row.email }, include: { company: true } })
  if (!admin) return
  const company = admin.company
  const employee = 'employeeEmail' in row
    ? await client.employee.findFirst({ where: { companyId: company.id, email: row.employeeEmail } })
    : await client.employee.findFirst({ where: { companyId: company.id, name: row.employeeName } })
  if (!employee) return
  const structure = await client.salaryStructure.findUnique({ where: { employeeId: employee.id } })
  if (!structure) {
    await client.salaryStructure.create({
      data: { companyId: company.id, employeeId: employee.id, monthlyGross: row.gross },
    })
  }
  const run = await client.payrollRun.findFirst({ where: { companyId: company.id, name: 'PR0001' } })
  if (!run) {
    const slip = estimatePayslip(company.currency, row.gross)
    await client.$transaction(async (tx) => {
      await ensurePayrollAccounts(tx, company.id)
      const accounts = await tx.account.findMany({ where: { companyId: company.id } })
      const byCode = new Map(accounts.map((account) => [account.code, account]))
      const journal = await tx.journal.findFirstOrThrow({ where: { companyId: company.id, code: 'GEN' } })
      const entry = await tx.journalEntry.create({
        data: {
          name: await entryName(tx, company.id),
          journalId: journal.id,
          date: new Date('2026-04-30T00:00:00.000Z'),
          companyId: company.id,
          lines: {
            create: [
              { accountId: byCode.get('6601')!.id, label: 'PR0001', debit: slip.gross, credit: 0 },
              { accountId: byCode.get('2241')!.id, label: 'PR0001', debit: 0, credit: slip.net },
              { accountId: byCode.get('222103')!.id, label: 'PR0001', debit: 0, credit: slip.deduction },
            ],
          },
        },
      })
      await tx.payrollRun.create({
        data: {
          name: 'PR0001',
          period: '2026-04',
          state: 'posted',
          companyId: company.id,
          entryId: entry.id,
          payslips: {
            create: [{
              employeeId: employee.id,
              gross: slip.gross,
              deduction: slip.deduction,
              net: slip.net,
              lines: { create: slip.lines },
            }],
          },
        },
      })
    })
  }
  const reimbursed = await client.expenseClaim.findFirst({ where: { companyId: company.id, name: 'EX0001' } })
  if (!reimbursed) {
    const amount = roundMoney(row.claim)
    await client.$transaction(async (tx) => {
      await ensurePayrollAccounts(tx, company.id)
      const accounts = await tx.account.findMany({ where: { companyId: company.id } })
      const byCode = new Map(accounts.map((account) => [account.code, account]))
      const journal = await tx.journal.findFirstOrThrow({ where: { companyId: company.id, code: 'BNK' } })
      const entry = await tx.journalEntry.create({
        data: {
          name: await entryName(tx, company.id),
          journalId: journal.id,
          date: new Date('2026-04-02T00:00:00.000Z'),
          companyId: company.id,
          lines: {
            create: [
              { accountId: byCode.get('6602')!.id, label: 'EX0001', debit: amount, credit: 0 },
              { accountId: byCode.get('1002')!.id, label: 'EX0001', debit: 0, credit: amount },
            ],
          },
        },
      })
      await tx.expenseClaim.create({
        data: {
          name: 'EX0001',
          companyId: company.id,
          employeeId: employee.id,
          merchant: row.merchant,
          description: 'Travel to the customer',
          receiptRef: row.receipt,
          amount,
          spentOn: new Date('2026-04-02T00:00:00.000Z'),
          state: 'reimbursed',
          entryId: entry.id,
        },
      })
    })
  }
  const waiting = await client.expenseClaim.findFirst({ where: { companyId: company.id, name: 'EX0002' } })
  if (!waiting) {
    await client.expenseClaim.create({
      data: {
        name: 'EX0002',
        companyId: company.id,
        employeeId: employee.id,
        merchant: 'City Cafe',
        description: 'Client coffee',
        receiptRef: 'cafe-2026-04-11.pdf',
        amount: 18,
        spentOn: new Date('2026-04-11T00:00:00.000Z'),
        state: 'submitted',
      },
    })
  }
}

export async function seedPayrollAndExpenses(client: PrismaClient) {
  for (const row of demoPay) await seedOne(client, row)
}
