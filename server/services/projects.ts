import { roundMoney } from '../../src/domain/money.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { ensureBooks, postInvoiceTx } from './accounting.ts'
import { readSetting } from './company-settings.ts'
import { allocateKnown } from './number-series.ts'

type Billing = 'fixed' | 'time'

const projectInclude = {
  partner: { select: { id: true, name: true } },
  stages: { orderBy: { sequence: 'asc' as const } },
  tasks: {
    orderBy: [{ sequence: 'asc' as const }, { id: 'asc' as const }],
    include: {
      assignee: { select: { id: true, name: true, hourlyCost: true, hourlyRate: true } },
      stage: { select: { id: true, name: true } },
      blockedBy: { select: { id: true, dependsOnId: true } },
    },
  },
  timesheets: {
    orderBy: { id: 'asc' as const },
    include: {
      employee: { select: { id: true, name: true, hourlyCost: true, hourlyRate: true } },
      task: { select: { id: true, name: true } },
      invoice: { select: { id: true, name: true } },
    },
  },
  milestones: { orderBy: { id: 'asc' as const } },
  expenses: { select: { id: true, name: true, amount: true, state: true, description: true } },
}

function asBilling(value: string): Billing {
  switch (value) {
    case 'fixed':
    case 'time':
      return value
    default:
      throw new AppError(400, 'Billing is fixed price or time and materials.')
  }
}

function parseDay(value: string | null | undefined, label: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new AppError(400, `${label} is not a date.`)
  return date
}

async function nextInvoiceName(tx: Tx, companyId: number) {
  return allocateKnown(tx, companyId, 'account.out')
}

export async function listProjects(companyId: number) {
  return prisma.project.findMany({
    where: { companyId },
    include: { partner: { select: { id: true, name: true } }, _count: { select: { tasks: true } } },
    orderBy: { id: 'desc' },
  })
}

export async function getProject(companyId: number, projectId: number) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, include: projectInclude })
  if (!project) throw new AppError(404, 'Project not found.')
  return { ...project, profitability: await profitability(companyId, projectId) }
}

export async function createProject(
  companyId: number,
  input: { name: string; partnerId?: number | null; billingType: string; hourlyRate?: number },
) {
  const billingType = asBilling(input.billingType)
  const partnerId = input.partnerId ?? null
  if (partnerId) {
    const partner = await prisma.contact.findFirst({ where: { id: partnerId, companyId } })
    if (!partner) throw new AppError(404, 'Customer not found.')
  }
  try {
    return await prisma.project.create({
      data: {
        companyId,
        name: input.name.trim(),
        partnerId,
        billingType,
        hourlyRate: input.hourlyRate ?? 0,
        stages: {
          create: [
            { companyId, name: 'To do', sequence: 1 },
            { companyId, name: 'Doing', sequence: 2 },
            { companyId, name: 'Done', sequence: 3 },
          ],
        },
      },
      include: projectInclude,
    })
  } catch (error) {
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      throw new AppError(409, 'A project with that name is already on this desk.')
    }
    throw error
  }
}

export async function addTask(
  companyId: number,
  projectId: number,
  input: { name: string; stageId?: number; assigneeId?: number | null; deadline?: string | null; startDate?: string | null; endDate?: string | null; dependsOnId?: number | null },
) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId }, include: { stages: { orderBy: { sequence: 'asc' } } } })
  if (!project) throw new AppError(404, 'Project not found.')
  const stage = input.stageId
    ? project.stages.find((row) => row.id === input.stageId)
    : project.stages[0]
  if (!stage) throw new AppError(400, 'Choose a stage on this project.')
  if (input.assigneeId) {
    const employee = await prisma.employee.findFirst({ where: { id: input.assigneeId, companyId } })
    if (!employee) throw new AppError(404, 'Employee not found.')
  }
  const task = await prisma.projectTask.create({
    data: {
      companyId,
      projectId: project.id,
      stageId: stage.id,
      name: input.name.trim(),
      assigneeId: input.assigneeId ?? null,
      deadline: parseDay(input.deadline, 'Deadline'),
      startDate: parseDay(input.startDate, 'Start'),
      endDate: parseDay(input.endDate, 'End'),
    },
  })
  if (input.dependsOnId) await addDependency(companyId, task.id, input.dependsOnId)
  return getProject(companyId, project.id)
}

export async function updateTask(
  companyId: number,
  taskId: number,
  input: { stageId?: number; assigneeId?: number | null; deadline?: string | null; startDate?: string | null; endDate?: string | null; name?: string },
) {
  const task = await prisma.projectTask.findFirst({ where: { id: taskId, companyId } })
  if (!task) throw new AppError(404, 'Task not found.')
  if (input.stageId) {
    const stage = await prisma.projectStage.findFirst({ where: { id: input.stageId, projectId: task.projectId } })
    if (!stage) throw new AppError(400, 'That stage is not on this project.')
  }
  if (input.assigneeId) {
    const employee = await prisma.employee.findFirst({ where: { id: input.assigneeId, companyId } })
    if (!employee) throw new AppError(404, 'Employee not found.')
  }
  await prisma.projectTask.update({
    where: { id: task.id },
    data: {
      stageId: input.stageId,
      assigneeId: input.assigneeId === undefined ? undefined : input.assigneeId,
      name: input.name?.trim(),
      deadline: input.deadline === undefined ? undefined : parseDay(input.deadline, 'Deadline'),
      startDate: input.startDate === undefined ? undefined : parseDay(input.startDate, 'Start'),
      endDate: input.endDate === undefined ? undefined : parseDay(input.endDate, 'End'),
    },
  })
  return getProject(companyId, task.projectId)
}

export async function addDependency(companyId: number, taskId: number, dependsOnId: number) {
  const task = await prisma.projectTask.findFirst({ where: { id: taskId, companyId } })
  const other = await prisma.projectTask.findFirst({ where: { id: dependsOnId, companyId } })
  if (!task || !other || task.projectId !== other.projectId) throw new AppError(404, 'Both tasks must be on the same project.')
  if (task.id === other.id) throw new AppError(400, 'A task cannot depend on itself.')
  await prisma.taskDependency.upsert({
    where: { taskId_dependsOnId: { taskId: task.id, dependsOnId: other.id } },
    update: {},
    create: { companyId, taskId: task.id, dependsOnId: other.id },
  })
  return getProject(companyId, task.projectId)
}

export async function addTimesheet(
  companyId: number,
  projectId: number,
  input: { taskId: number; employeeId: number; workDate: string; hours: number; description?: string },
) {
  const task = await prisma.projectTask.findFirst({ where: { id: input.taskId, projectId, companyId } })
  if (!task) throw new AppError(404, 'Task not found.')
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } })
  if (!employee) throw new AppError(404, 'Employee not found.')
  if (input.hours <= 0) throw new AppError(400, 'Hours must be greater than zero.')
  const unit = await readSetting(prisma, companyId, 'projects', 'hours', 'Hours')
  const hours = unit === 'Days' ? input.hours * 8 : input.hours
  await prisma.timesheet.create({
    data: {
      companyId,
      projectId,
      taskId: task.id,
      employeeId: employee.id,
      workDate: parseDay(input.workDate, 'Date') ?? new Date(),
      hours,
      description: input.description?.trim() ?? '',
    },
  })
  return getProject(companyId, projectId)
}

export async function approveTimesheet(companyId: number, timesheetId: number) {
  const row = await prisma.timesheet.findFirst({ where: { id: timesheetId, companyId } })
  if (!row) throw new AppError(404, 'Timesheet not found.')
  if (row.state === 'invoiced') throw new AppError(409, 'That timesheet is already on an invoice.')
  await prisma.timesheet.update({ where: { id: row.id }, data: { state: 'approved' } })
  return getProject(companyId, row.projectId)
}

export async function addMilestone(companyId: number, projectId: number, input: { name: string; amount: number; dueDate?: string | null }) {
  const project = await prisma.project.findFirst({ where: { id: projectId, companyId } })
  if (!project) throw new AppError(404, 'Project not found.')
  if (project.billingType !== 'fixed') throw new AppError(409, 'Milestones belong on a fixed-price project.')
  if (input.amount <= 0) throw new AppError(400, 'Amount must be greater than zero.')
  await prisma.projectMilestone.create({
    data: {
      companyId,
      projectId,
      name: input.name.trim(),
      amount: roundMoney(input.amount),
      dueDate: parseDay(input.dueDate, 'Due date'),
    },
  })
  return getProject(companyId, projectId)
}

export async function approveMilestone(companyId: number, milestoneId: number) {
  const row = await prisma.projectMilestone.findFirst({ where: { id: milestoneId, companyId } })
  if (!row) throw new AppError(404, 'Milestone not found.')
  if (row.state === 'invoiced') throw new AppError(409, 'That milestone is already on an invoice.')
  await prisma.projectMilestone.update({ where: { id: row.id }, data: { state: 'approved' } })
  return getProject(companyId, row.projectId)
}

export async function invoiceProject(companyId: number, projectId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: projectId, companyId },
      include: {
        timesheets: { where: { state: 'approved' }, include: { employee: true, task: true } },
        milestones: { where: { state: 'approved' } },
      },
    })
    if (!project) throw new AppError(404, 'Project not found.')
    if (!project.partnerId) throw new AppError(400, 'Choose a customer before invoicing.')
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
    const taxRate = company.defaultTaxRate
    const billing = asBilling(project.billingType)
    const billingSetting = await readSetting(tx, companyId, 'projects', 'billing', 'Milestones')
    if ((billingSetting === 'Timesheets' || billingSetting === 'Hours') && billing === 'fixed') {
      throw new AppError(409, 'This company bills projects from timesheets.')
    }
    const draft: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; subtotal: number; taxAmount: number }> = []
    switch (billing) {
      case 'time':
        if (project.timesheets.length === 0) throw new AppError(400, 'Approve a timesheet before invoicing.')
        for (const row of project.timesheets) {
          const rate = row.employee.hourlyRate > 0 ? row.employee.hourlyRate : project.hourlyRate
          if (rate <= 0) throw new AppError(400, `${row.employee.name} has no hourly bill rate.`)
          const subtotal = roundMoney(row.hours * rate)
          draft.push({
            description: `${row.task.name} · ${row.employee.name}`,
            quantity: row.hours,
            unitPrice: rate,
            taxRate,
            subtotal,
            taxAmount: roundMoney(subtotal * (taxRate / 100)),
          })
        }
        break
      case 'fixed':
        if (project.milestones.length === 0) throw new AppError(400, 'Approve a milestone before invoicing.')
        for (const row of project.milestones) {
          const subtotal = roundMoney(row.amount)
          draft.push({
            description: row.name,
            quantity: 1,
            unitPrice: subtotal,
            taxRate,
            subtotal,
            taxAmount: roundMoney(subtotal * (taxRate / 100)),
          })
        }
        break
      default: {
        const neverBilling: never = billing
        throw new AppError(400, `Unknown billing ${String(neverBilling)}.`)
      }
    }
    const amountUntaxed = roundMoney(draft.reduce((sum, line) => sum + line.subtotal, 0))
    const amountTax = roundMoney(draft.reduce((sum, line) => sum + line.taxAmount, 0))
    const amountTotal = roundMoney(amountUntaxed + amountTax)
    const invoice = await tx.invoice.create({
      data: {
        name: await nextInvoiceName(tx, companyId),
        moveType: 'out_invoice',
        state: 'draft',
        partnerId: project.partnerId,
        companyId,
        projectId: project.id,
        invoiceDate: new Date(),
        amountUntaxed,
        amountTax,
        amountTotal,
        residual: amountTotal,
        fapiaoType: 'electronic',
        lines: { create: draft },
      },
    })
    const posted = await postInvoiceTx(tx, companyId, invoice.id)
    switch (billing) {
      case 'time':
        await tx.timesheet.updateMany({
          where: { id: { in: project.timesheets.map((row) => row.id) } },
          data: { state: 'invoiced', invoiceId: posted.id },
        })
        break
      case 'fixed':
        await tx.projectMilestone.updateMany({
          where: { id: { in: project.milestones.map((row) => row.id) } },
          data: { state: 'invoiced', invoiceId: posted.id },
        })
        break
      default: {
        const neverBilling: never = billing
        throw new AppError(400, `Unknown billing ${String(neverBilling)}.`)
      }
    }
    return posted
  })
}

export async function profitability(companyId: number, projectId: number) {
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId },
    include: {
      timesheets: { where: { state: { in: ['approved', 'invoiced'] } }, include: { employee: { select: { hourlyCost: true } } } },
      expenses: { where: { state: { in: ['approved', 'reimbursed'] } } },
      invoices: { where: { state: { in: ['posted', 'paid'] }, moveType: 'out_invoice' } },
    },
  })
  if (!project) throw new AppError(404, 'Project not found.')
  const revenue = roundMoney(project.invoices.reduce((sum, row) => sum + row.amountUntaxed, 0))
  const timesheetCost = roundMoney(project.timesheets.reduce((sum, row) => sum + row.hours * row.employee.hourlyCost, 0))
  const expenses = roundMoney(project.expenses.reduce((sum, row) => sum + row.amount, 0))
  const cost = roundMoney(timesheetCost + expenses)
  return { revenue, timesheetCost, expenses, cost, profit: roundMoney(revenue - cost) }
}
