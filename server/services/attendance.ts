import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'
import { readSetting } from './company-settings.ts'

const defaultStart = 9 * 60

function dayStamp(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'Use a date, YYYY-MM-DD.')
  return new Date(`${value}T00:00:00.000Z`)
}

function stampOf(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function minutesOf(date: Date) {
  return date.getUTCHours() * 60 + date.getUTCMinutes()
}

function clock(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`
}

function parseClock(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const mins = Number(match[2])
  if (hours > 23 || mins > 59) return null
  return hours * 60 + mins
}

function dayCount(from: Date, to: Date) {
  return Math.round((stampOf(to).getTime() - stampOf(from).getTime()) / 86_400_000) + 1
}

function workedHours(checkIn: Date | null, checkOut: Date | null) {
  if (!checkIn || !checkOut) return null
  return Math.round(((checkOut.getTime() - checkIn.getTime()) / 3_600_000) * 100) / 100
}

function presentShift(shift: { id: number; name: string; startMinutes: number; endMinutes: number } | null) {
  if (!shift) return null
  return {
    id: shift.id,
    name: shift.name,
    start: clock(shift.startMinutes),
    end: clock(shift.endMinutes),
    startMinutes: shift.startMinutes,
    endMinutes: shift.endMinutes,
  }
}

async function companyShift(companyId: number) {
  return prisma.workShift.findFirst({ where: { companyId }, orderBy: { id: 'asc' } })
}

export async function attendanceBoard(companyId: number, from: string, to: string) {
  const start = dayStamp(from)
  const end = dayStamp(to)
  if (end < start) throw new AppError(400, 'The end date is before the start date.')
  const [shift, employees, rows] = await Promise.all([
    companyShift(companyId),
    prisma.employee.findMany({
      where: { companyId, active: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.attendance.findMany({
      where: { employee: { companyId }, workDate: { gte: start, lte: end } },
      include: { employee: { select: { id: true, name: true, shift: true } } },
      orderBy: [{ workDate: 'desc' }, { id: 'asc' }],
    }),
  ])
  const fallback = shift?.startMinutes ?? defaultStart
  return {
    shift: presentShift(shift),
    employees,
    rows: rows.map((row) => {
      const startMinutes = row.employee.shift?.startMinutes ?? fallback
      const late = row.checkIn ? minutesOf(row.checkIn) > startMinutes : row.status === 'late'
      return {
        id: row.id,
        employeeId: row.employee.id,
        employeeName: row.employee.name,
        workDate: row.workDate,
        status: row.status,
        note: row.note,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        workedHours: workedHours(row.checkIn, row.checkOut),
        late,
      }
    }),
  }
}

export async function saveShift(companyId: number, name: string, start: string, end: string) {
  const startMinutes = parseClock(start)
  const endMinutes = parseClock(end)
  if (startMinutes === null || endMinutes === null) throw new AppError(400, 'Use a time like 09:00.')
  if (endMinutes <= startMinutes) throw new AppError(400, 'The shift end is before the start.')
  const trimmed = name.trim() || 'Day'
  const existing = await companyShift(companyId)
  const shift = existing
    ? await prisma.workShift.update({
      where: { id: existing.id },
      data: { name: trimmed, startMinutes, endMinutes },
    })
    : await prisma.workShift.create({ data: { companyId, name: trimmed, startMinutes, endMinutes } })
  await prisma.employee.updateMany({ where: { companyId, shiftId: null }, data: { shiftId: shift.id } })
  return presentShift(shift)
}

export async function punch(companyId: number, employeeId: number, action: 'in' | 'out', now = new Date()) {
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId },
    include: { shift: true },
  })
  if (!employee) throw new AppError(404, 'Employee not found.')
  const workDate = stampOf(now)
  const shift = employee.shift ?? await companyShift(companyId)
  const startMinutes = shift?.startMinutes ?? defaultStart
  const existing = await prisma.attendance.findUnique({ where: { employeeId_workDate: { employeeId, workDate } } })
  switch (action) {
    case 'in': {
      if (existing?.checkIn) throw new AppError(409, 'Already checked in.')
      const grace = Number(await readSetting(prisma, companyId, 'attendance', 'grace', '10'))
      const allowance = Number.isFinite(grace) ? grace : 10
      const late = minutesOf(now) > startMinutes + allowance
      const row = await prisma.attendance.upsert({
        where: { employeeId_workDate: { employeeId, workDate } },
        create: { employeeId, workDate, status: late ? 'late' : 'present', checkIn: now },
        update: { checkIn: now, status: late ? 'late' : 'present' },
      })
      return {
        id: row.id,
        status: row.status,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        workedHours: workedHours(row.checkIn, row.checkOut),
        late,
      }
    }
    case 'out': {
      if (!existing?.checkIn) throw new AppError(400, 'Check in first.')
      if (existing.checkOut) throw new AppError(409, 'Already checked out.')
      const grace = Number(await readSetting(prisma, companyId, 'attendance', 'grace', '10'))
      const allowance = Number.isFinite(grace) ? grace : 10
      const end = shift?.endMinutes ?? 17 * 60 + 30
      const overtimeMinutes = Math.max(0, minutesOf(now) - end)
      const policy = await readSetting(prisma, companyId, 'attendance', 'overtime', 'Yes')
      const overtimeState = overtimeMinutes > 0 ? (policy === 'No' ? 'approved' : 'waiting') : ''
      const row = await prisma.attendance.update({
        where: { id: existing.id },
        data: { checkOut: now, overtimeMinutes, overtimeState },
      })
      return {
        id: row.id,
        status: row.status,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        workedHours: workedHours(row.checkIn, row.checkOut),
        late: existing.checkIn ? minutesOf(existing.checkIn) > startMinutes + allowance : false,
        overtimeMinutes,
        overtimeState,
      }
    }
    default: {
      const unexpected: never = action
      throw new AppError(400, unexpected)
    }
  }
}

async function usedDays(employeeId: number, kind: string, year: number) {
  const rows = await prisma.leaveRequest.findMany({
    where: { employeeId, kind, state: 'approved', dateFrom: { gte: new Date(`${year}-01-01T00:00:00.000Z`), lt: new Date(`${year + 1}-01-01T00:00:00.000Z`) } },
  })
  return rows.reduce((sum, row) => sum + dayCount(row.dateFrom, row.dateTo), 0)
}

export async function leaveBoard(companyId: number, year = new Date().getUTCFullYear()) {
  const [types, employees, allocations, requests] = await Promise.all([
    prisma.leaveType.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
    prisma.employee.findMany({ where: { companyId, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.leaveAllocation.findMany({
      where: { companyId, year },
      include: { employee: { select: { id: true, name: true } }, leaveType: true },
      orderBy: [{ employee: { name: 'asc' } }, { leaveType: { name: 'asc' } }],
    }),
    prisma.leaveRequest.findMany({
      where: { employee: { companyId } },
      include: { employee: { select: { id: true, name: true } } },
      orderBy: { dateFrom: 'desc' },
    }),
  ])
  const balances = []
  for (const allocation of allocations) {
    const used = await usedDays(allocation.employeeId, allocation.leaveType.code, year)
    balances.push({
      id: allocation.id,
      employeeId: allocation.employee.id,
      employeeName: allocation.employee.name,
      leaveTypeId: allocation.leaveType.id,
      code: allocation.leaveType.code,
      name: allocation.leaveType.name,
      year,
      allocated: allocation.days,
      used,
      remaining: Math.round((allocation.days - used) * 100) / 100,
    })
  }
  return { year, types, employees, balances, requests }
}

export async function createLeaveType(companyId: number, name: string, code: string, paid: boolean) {
  const trimmed = name.trim()
  const key = code.trim().toLowerCase()
  if (!trimmed || !key) throw new AppError(400, 'Name the leave type.')
  return prisma.leaveType.create({ data: { companyId, name: trimmed, code: key, paid } })
}

export async function saveAllocation(companyId: number, employeeId: number, leaveTypeId: number, year: number, days: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AppError(400, 'Choose a year.')
  if (!Number.isFinite(days) || days < 0 || days > 366) throw new AppError(400, 'Days must be between 0 and 366.')
  const employee = await prisma.employee.findFirst({ where: { id: employeeId, companyId } })
  if (!employee) throw new AppError(400, 'Choose an employee from this company.')
  const type = await prisma.leaveType.findFirst({ where: { id: leaveTypeId, companyId } })
  if (!type) throw new AppError(400, 'Choose a leave type.')
  return prisma.leaveAllocation.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } },
    update: { days },
    create: { companyId, employeeId, leaveTypeId, year, days },
  })
}

export async function askLeave(companyId: number, input: { employeeId: number; code: string; dateFrom: string; dateTo: string; reason?: string }) {
  const employee = await prisma.employee.findFirst({ where: { id: input.employeeId, companyId } })
  if (!employee) throw new AppError(400, 'Choose an employee from this company.')
  const type = await prisma.leaveType.findFirst({ where: { companyId, code: input.code } })
  if (!type) throw new AppError(400, 'Choose a leave type.')
  const dateFrom = dayStamp(input.dateFrom)
  const dateTo = dayStamp(input.dateTo)
  if (dateTo < dateFrom) throw new AppError(400, 'The end date is before the start date.')
  const week = await readSetting(prisma, companyId, 'hr', 'week', 'Mon–Fri')
  if (week === 'Mon–Fri' || week === 'Mon-Fri') {
    const cursor = new Date(dateFrom.getTime())
    while (cursor <= dateTo) {
      const day = cursor.getUTCDay()
      if (day === 0 || day === 6) throw new AppError(400, 'That leave includes a weekend.')
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
  }
  const leaveStart = await readSetting(prisma, companyId, 'hr', 'leave', 'waiting')
  const state = leaveStart === 'approved' || leaveStart === 'refused' ? leaveStart : 'draft'
  await prisma.leaveRequest.create({
    data: {
      employeeId: employee.id,
      kind: type.code,
      dateFrom,
      dateTo,
      state,
      reason: input.reason?.trim() || null,
    },
  })
  return leaveBoard(companyId, dateFrom.getUTCFullYear())
}

export async function decideLeaveRequest(companyId: number, id: number, state: 'approved' | 'refused') {
  const leave = await prisma.leaveRequest.findFirst({ where: { id, employee: { companyId } } })
  if (!leave) throw new AppError(404, 'Leave not found.')
  if (leave.state !== 'draft') throw new AppError(409, 'This leave is already decided.')
  if (state === 'approved') {
    const type = await prisma.leaveType.findFirst({ where: { companyId, code: leave.kind } })
    const year = leave.dateFrom.getUTCFullYear()
    const allocation = type
      ? await prisma.leaveAllocation.findUnique({
        where: { employeeId_leaveTypeId_year: { employeeId: leave.employeeId, leaveTypeId: type.id, year } },
      })
      : null
    if (!allocation) throw new AppError(400, 'Allocate days before approving.')
    const used = await usedDays(leave.employeeId, leave.kind, year)
    if (used + dayCount(leave.dateFrom, leave.dateTo) > allocation.days + 0.001) {
      throw new AppError(409, 'Not enough leave balance.')
    }
  }
  await prisma.leaveRequest.update({ where: { id: leave.id }, data: { state } })
  return leaveBoard(companyId, leave.dateFrom.getUTCFullYear())
}

export async function leaveCalendar(companyId: number, from: string, to: string) {
  const start = dayStamp(from)
  const end = dayStamp(to)
  if (end < start) throw new AppError(400, 'The end date is before the start date.')
  const requests = await prisma.leaveRequest.findMany({
    where: {
      employee: { companyId },
      state: { in: ['draft', 'approved'] },
      dateFrom: { lte: end },
      dateTo: { gte: start },
    },
    include: { employee: { select: { id: true, name: true } } },
    orderBy: { dateFrom: 'asc' },
  })
  return requests.map((row) => ({
    id: row.id,
    employeeId: row.employee.id,
    employeeName: row.employee.name,
    kind: row.kind,
    state: row.state,
    dateFrom: row.dateFrom,
    dateTo: row.dateTo,
    reason: row.reason,
  }))
}
