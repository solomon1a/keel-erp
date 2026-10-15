import type { AttendanceInput, DepartmentInput, EmployeeInput, LeaveInput } from '../../shared/schemas.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'

const employeeInclude = {
  department: { select: { id: true, name: true } },
  attendances: { orderBy: { workDate: 'desc' as const }, take: 30 },
  leaves: { orderBy: { dateFrom: 'desc' as const } },
} as const

function day(value: string) {
  return new Date(`${value}T00:00:00.000Z`)
}

async function departmentInCompany(companyId: number, departmentId: number | null) {
  if (!departmentId) return null
  const department = await prisma.department.findFirst({ where: { id: departmentId, companyId } })
  if (!department) throw new AppError(400, 'Choose a department.')
  return department.id
}

export async function listDepartments(companyId: number) {
  return prisma.department.findMany({
    where: { companyId },
    orderBy: { name: 'asc' },
    include: { _count: { select: { employees: true } } },
  })
}

export async function createDepartment(companyId: number, input: DepartmentInput) {
  const existing = await prisma.department.findFirst({ where: { companyId, name: input.name } })
  if (existing) throw new AppError(409, 'That department already exists.')
  return prisma.department.create({ data: { name: input.name, companyId } })
}

export async function listEmployees(companyId: number) {
  return prisma.employee.findMany({
    where: { companyId },
    include: employeeInclude,
    orderBy: { name: 'asc' },
  })
}

export async function getEmployee(companyId: number, employeeId: number) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    include: employeeInclude,
  })
  if (!employee) throw new AppError(404, 'Employee not found.')
  return employee
}

export async function createEmployee(companyId: number, input: EmployeeInput) {
  const departmentId = await departmentInCompany(companyId, input.departmentId)
  return prisma.employee.create({
    data: { ...input, departmentId, companyId },
    include: employeeInclude,
  })
}

export async function updateEmployee(companyId: number, employeeId: number, input: EmployeeInput) {
  await getEmployee(companyId, employeeId)
  const departmentId = await departmentInCompany(companyId, input.departmentId)
  return prisma.employee.update({
    where: { id: employeeId },
    data: { ...input, departmentId },
    include: employeeInclude,
  })
}

export async function markAttendance(companyId: number, employeeId: number, input: AttendanceInput) {
  await getEmployee(companyId, employeeId)
  const workDate = day(input.workDate)
  await prisma.attendance.upsert({
    where: { employeeId_workDate: { employeeId, workDate } },
    create: { employeeId, workDate, status: input.status, note: input.note },
    update: { status: input.status, note: input.note },
  })
  return getEmployee(companyId, employeeId)
}

export async function requestLeave(companyId: number, employeeId: number, input: LeaveInput) {
  await getEmployee(companyId, employeeId)
  const dateFrom = day(input.dateFrom)
  const dateTo = day(input.dateTo)
  if (dateTo < dateFrom) throw new AppError(400, 'The end date is before the start date.')
  await prisma.leaveRequest.create({
    data: {
      employeeId,
      kind: input.kind,
      dateFrom,
      dateTo,
      reason: input.reason,
      state: 'draft',
    },
  })
  return getEmployee(companyId, employeeId)
}

export async function decideLeave(companyId: number, employeeId: number, leaveId: number, state: 'approved' | 'refused') {
  const leave = await prisma.leaveRequest.findFirst({
    where: { id: leaveId, employeeId, employee: { companyId } },
  })
  if (!leave) throw new AppError(404, 'Leave not found.')
  if (leave.state !== 'draft') throw new AppError(409, 'This leave is already decided.')
  await prisma.leaveRequest.update({ where: { id: leave.id }, data: { state } })
  return getEmployee(companyId, employeeId)
}
