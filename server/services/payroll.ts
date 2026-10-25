import { roundMoney } from '../../src/domain/money.ts'
import type { ExpenseInput, PayrollRunInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { ensureBooks } from './accounting.ts'
import { readSetting } from './company-settings.ts'
import { allocateKnown } from './number-series.ts'

const runInclude = {
  payslips: {
    include: {
      employee: { select: { id: true, name: true } },
      lines: { orderBy: { id: 'asc' as const } },
    },
    orderBy: { id: 'asc' as const },
  },
} as const

const expenseInclude = {
  employee: { select: { id: true, name: true } },
} as const

export const payrollAccounts = [
  ['2241', 'Payroll payable', 'liability'],
  ['222103', 'Statutory deductions', 'liability'],
  ['6601', 'Salary expense', 'expense'],
  ['6602', 'Employee expenses', 'expense'],
] as const

type SlipLine = { code: string; label: string; kind: 'earning' | 'deduction'; amount: number }

export function countryForCurrency(currency: string) {
  switch (currency) {
    case 'CNY':
      return 'CN' as const
    case 'GBP':
      return 'GB' as const
    case 'USD':
      return 'US' as const
    default:
      return 'OTHER' as const
  }
}

function chinaIit(taxable: number) {
  const bands = [
    [3000, 0.03, 0],
    [12000, 0.1, 210],
    [25000, 0.2, 1410],
    [35000, 0.25, 2660],
    [55000, 0.3, 4410],
    [80000, 0.35, 7160],
    [Number.POSITIVE_INFINITY, 0.45, 15160],
  ] as const
  for (const [cap, rate, quick] of bands) {
    if (taxable <= cap) return roundMoney(taxable * rate - quick)
  }
  return 0
}

function finish(gross: number, parts: SlipLine[]) {
  const rounded = parts.map((line) => ({ ...line, amount: roundMoney(Math.max(0, line.amount)) }))
  const sum = roundMoney(rounded.reduce((total, line) => total + line.amount, 0))
  const net = roundMoney(gross - sum)
  const drift = roundMoney(gross - net - sum)
  if (drift !== 0 && rounded.length > 0) {
    const last = rounded[rounded.length - 1]
    if (last) last.amount = roundMoney(last.amount + drift)
  }
  const deduction = roundMoney(rounded.reduce((total, line) => total + line.amount, 0))
  return {
    gross,
    deduction,
    net: roundMoney(gross - deduction),
    lines: [{ code: 'GROSS', label: 'Gross pay', kind: 'earning' as const, amount: gross }, ...rounded],
  }
}

/** Demo rules only. Not a filing with a tax authority. */
export function estimatePayslip(currency: string, gross: number) {
  const pay = roundMoney(gross)
  const country = countryForCurrency(currency)
  switch (country) {
    case 'CN': {
      const pension = pay * 0.08
      const medical = pay * 0.02
      const unemployment = pay * 0.005
      const housing = pay * 0.07
      const social = roundMoney(pension) + roundMoney(medical) + roundMoney(unemployment) + roundMoney(housing)
      const taxable = Math.max(0, roundMoney(pay - 5000 - social))
      return finish(pay, [
        { code: 'CN_PENSION', label: 'Pension 8%', kind: 'deduction', amount: pension },
        { code: 'CN_MEDICAL', label: 'Medical 2%', kind: 'deduction', amount: medical },
        { code: 'CN_UNEMPLOY', label: 'Unemployment 0.5%', kind: 'deduction', amount: unemployment },
        { code: 'CN_HOUSING', label: 'Housing fund 7%', kind: 'deduction', amount: housing },
        { code: 'CN_IIT', label: 'Individual income tax', kind: 'deduction', amount: chinaIit(taxable) },
      ])
    }
    case 'GB': {
      const allowance = roundMoney(12570 / 12)
      const taxable = Math.max(0, pay - allowance)
      const ni = Math.max(0, pay - 1048) * 0.08
      return finish(pay, [
        { code: 'GB_PAYE', label: 'PAYE income tax 20%', kind: 'deduction', amount: taxable * 0.2 },
        { code: 'GB_NI', label: 'National Insurance 8%', kind: 'deduction', amount: ni },
      ])
    }
    case 'US': {
      const federal = Math.max(0, pay - 1250) * 0.1
      return finish(pay, [
        { code: 'US_FED', label: 'Federal withholding 10%', kind: 'deduction', amount: federal },
        { code: 'US_SS', label: 'Social Security 6.2%', kind: 'deduction', amount: pay * 0.062 },
        { code: 'US_MED', label: 'Medicare 1.45%', kind: 'deduction', amount: pay * 0.0145 },
        { code: 'US_NY', label: 'NY state withholding 4%', kind: 'deduction', amount: pay * 0.04 },
      ])
    }
    default:
      throw new AppError(400, 'This demo payroll covers CNY, GBP, and USD only.')
  }
}

export async function ensurePayrollAccounts(tx: Tx, companyId: number) {
  for (const [code, name, type] of payrollAccounts) {
    const found = await tx.account.findFirst({ where: { companyId, code } })
    if (!found) await tx.account.create({ data: { code, name, type, companyId } })
  }
}

async function nextEntryName(tx: Tx, companyId: number) {
  return allocateKnown(tx, companyId, 'account.entry')
}

export async function listSalaries(companyId: number) {
  return prisma.employee.findMany({
    where: { companyId },
    include: { salary: true, department: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function setSalary(companyId: number, employeeId: number, monthlyGross: number) {
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } })
  if (!employee) throw new AppError(400, 'Choose an employee.')
  const gross = roundMoney(monthlyGross)
  return prisma.salaryStructure.upsert({
    where: { employeeId: employee.id },
    update: { monthlyGross: gross },
    create: { companyId, employeeId: employee.id, monthlyGross: gross },
  })
}

export async function listRuns(companyId: number) {
  return prisma.payrollRun.findMany({
    where: { companyId },
    include: runInclude,
    orderBy: { id: 'desc' },
  })
}

export async function getRun(companyId: number, runId: number) {
  const run = await prisma.payrollRun.findFirst({ where: { id: runId, companyId }, include: runInclude })
  if (!run) throw new AppError(404, 'Payroll run not found.')
  return run
}

export async function createRun(companyId: number, input: PayrollRunInput) {
  const company = await prisma.company.findFirstOrThrow({ where: { id: companyId } })
  const country = await readSetting(prisma, companyId, 'payroll', 'country', 'Company country')
  const currency = country === 'CNY' || country === 'GBP' || country === 'USD' ? country : company.currency
  const existing = await prisma.payrollRun.findFirst({ where: { companyId, period: input.period } })
  if (existing) throw new AppError(409, 'That month already has a payroll run.')
  const structures = await prisma.salaryStructure.findMany({
    where: { companyId, employee: { active: true } },
    include: { employee: true },
  })
  if (structures.length === 0) throw new AppError(400, 'Add a salary before running payroll.')
  const count = await prisma.payrollRun.count({ where: { companyId } })
  const name = `PR${String(count + 1).padStart(4, '0')}`
  return prisma.payrollRun.create({
    data: {
      name,
      period: input.period,
      state: 'draft',
      companyId,
      payslips: {
        create: structures.map((structure) => {
          const slip = estimatePayslip(currency, structure.monthlyGross)
          return {
            employeeId: structure.employeeId,
            gross: slip.gross,
            deduction: slip.deduction,
            net: slip.net,
            lines: { create: slip.lines },
          }
        }),
      },
    },
    include: runInclude,
  })
}

export async function postRun(companyId: number, runId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findFirst({ where: { id: runId, companyId }, include: { payslips: true } })
    if (!run) throw new AppError(404, 'Payroll run not found.')
    if (run.state !== 'draft') throw new AppError(409, 'Only a draft payroll run can be posted.')
    await ensurePayrollAccounts(tx, companyId)
    const accounts = await tx.account.findMany({ where: { companyId } })
    const byCode = new Map(accounts.map((row) => [row.code, row]))
    const gross = roundMoney(run.payslips.reduce((sum, slip) => sum + slip.gross, 0))
    const net = roundMoney(run.payslips.reduce((sum, slip) => sum + slip.net, 0))
    const deduction = roundMoney(gross - net)
    const journalCode = await readSetting(tx, companyId, 'payroll', 'journal', 'GEN')
    const journal = await tx.journal.findFirst({ where: { companyId, code: journalCode } })
    if (!journal) throw new AppError(400, `Journal ${journalCode} is not in this company.`)
    const salary = byCode.get('6601')
    const payable = byCode.get('2241')
    const statutory = byCode.get('222103')
    if (!salary || !payable || !statutory) throw new AppError(500, 'Payroll accounts are missing.')
    const entry = await tx.journalEntry.create({
      data: {
        name: await nextEntryName(tx, companyId),
        journalId: journal.id,
        date: new Date(`${run.period}-01T00:00:00.000Z`),
        companyId,
        lines: {
          create: [
            { accountId: salary.id, label: run.name, debit: gross, credit: 0 },
            { accountId: payable.id, label: run.name, debit: 0, credit: net },
            { accountId: statutory.id, label: run.name, debit: 0, credit: deduction },
          ],
        },
      },
    })
    return tx.payrollRun.update({
      where: { id: run.id },
      data: { state: 'posted', entryId: entry.id },
      include: runInclude,
    })
  })
}

export async function payRun(companyId: number, runId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const run = await tx.payrollRun.findFirst({ where: { id: runId, companyId }, include: { payslips: true } })
    if (!run) throw new AppError(404, 'Payroll run not found.')
    if (run.state !== 'posted') throw new AppError(409, 'Post the payroll run before paying it.')
    await ensurePayrollAccounts(tx, companyId)
    const accounts = await tx.account.findMany({ where: { companyId } })
    const byCode = new Map(accounts.map((row) => [row.code, row]))
    const net = roundMoney(run.payslips.reduce((sum, slip) => sum + slip.net, 0))
    const journal = await tx.journal.findFirst({ where: { companyId, code: 'BNK' } })
    const payable = byCode.get('2241')
    const bank = byCode.get('1002')
    if (!journal || !payable || !bank) throw new AppError(500, 'Bank or payroll accounts are missing.')
    await tx.journalEntry.create({
      data: {
        name: await nextEntryName(tx, companyId),
        journalId: journal.id,
        date: new Date(),
        companyId,
        lines: {
          create: [
            { accountId: payable.id, label: `${run.name} payment`, debit: net, credit: 0 },
            { accountId: bank.id, label: `${run.name} payment`, debit: 0, credit: net },
          ],
        },
      },
    })
    return tx.payrollRun.update({ where: { id: run.id }, data: { state: 'paid' }, include: runInclude })
  })
}

export async function listExpenses(companyId: number) {
  return prisma.expenseClaim.findMany({
    where: { companyId },
    include: expenseInclude,
    orderBy: { id: 'desc' },
  })
}

export async function createExpense(companyId: number, input: ExpenseInput) {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } })
  if (!employee) throw new AppError(400, 'Choose an employee.')
  const count = await prisma.expenseClaim.count({ where: { companyId } })
  return prisma.expenseClaim.create({
    data: {
      name: `EX${String(count + 1).padStart(4, '0')}`,
      companyId,
      employeeId: employee.id,
      merchant: input.merchant,
      description: input.description,
      receiptRef: input.receiptRef,
      amount: roundMoney(input.amount),
      spentOn: new Date(`${input.spentOn}T00:00:00.000Z`),
      state: 'submitted',
    },
    include: expenseInclude,
  })
}

export async function decideExpense(companyId: number, expenseId: number, state: 'approved' | 'refused') {
  const claim = await prisma.expenseClaim.findFirst({ where: { id: expenseId, companyId } })
  if (!claim) throw new AppError(404, 'Expense not found.')
  if (claim.state !== 'submitted') throw new AppError(409, 'Only a submitted claim can be decided.')
  return prisma.expenseClaim.update({ where: { id: claim.id }, data: { state }, include: expenseInclude })
}

export async function reimburseExpense(companyId: number, expenseId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const claim = await tx.expenseClaim.findFirst({ where: { id: expenseId, companyId } })
    if (!claim) throw new AppError(404, 'Expense not found.')
    if (claim.state !== 'approved') throw new AppError(409, 'Approve the claim before reimbursing it.')
    await ensurePayrollAccounts(tx, companyId)
    const accounts = await tx.account.findMany({ where: { companyId } })
    const byCode = new Map(accounts.map((row) => [row.code, row]))
    const journalCode = await readSetting(tx, companyId, 'expenses', 'journal', 'BNK')
    const journal = await tx.journal.findFirst({ where: { companyId, code: journalCode } })
    const expense = byCode.get('6602')
    const bank = byCode.get('1002')
    if (!journal) throw new AppError(400, `Journal ${journalCode} is not in this company.`)
    if (!expense || !bank) throw new AppError(500, 'Expense accounts are missing.')
    const entry = await tx.journalEntry.create({
      data: {
        name: await nextEntryName(tx, companyId),
        journalId: journal.id,
        date: claim.spentOn,
        companyId,
        lines: {
          create: [
            { accountId: expense.id, label: claim.name, debit: claim.amount, credit: 0 },
            { accountId: bank.id, label: claim.name, debit: 0, credit: claim.amount },
          ],
        },
      },
    })
    return tx.expenseClaim.update({
      where: { id: claim.id },
      data: { state: 'reimbursed', entryId: entry.id },
      include: expenseInclude,
    })
  })
}
