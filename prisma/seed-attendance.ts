import type { PrismaClient } from '@prisma/client'

const types = [
  { code: 'annual', name: 'Annual', paid: true, days: 15 },
  { code: 'sick', name: 'Sick', paid: true, days: 10 },
  { code: 'personal', name: 'Personal', paid: false, days: 5 },
] as const

export async function seedAttendance(client: PrismaClient) {
  const admin = await client.user.findUnique({ where: { email: 'maya@northline.example' } })
  if (!admin) return
  const companyId = admin.companyId
  const existing = await client.leaveType.findFirst({ where: { companyId, code: 'annual' } })
  if (existing) return

  const shift = await client.workShift.create({
    data: { companyId, name: 'Day', startMinutes: 9 * 60, endMinutes: 17 * 60 + 30 },
  })
  await client.employee.updateMany({ where: { companyId }, data: { shiftId: shift.id } })

  const typeByCode = new Map<string, { id: number; days: number }>()
  for (const type of types) {
    const row = await client.leaveType.create({
      data: { companyId, code: type.code, name: type.name, paid: type.paid },
    })
    typeByCode.set(type.code, { id: row.id, days: type.days })
  }

  const employees = await client.employee.findMany({ where: { companyId }, select: { id: true, name: true } })
  for (const employee of employees) {
    for (const type of typeByCode.values()) {
      await client.leaveAllocation.create({
        data: { companyId, employeeId: employee.id, leaveTypeId: type.id, year: 2026, days: type.days },
      })
    }
  }

  const zhou = employees.find((person) => person.name === 'Zhou Ning')
  const he = employees.find((person) => person.name === 'He Gong')
  const wen = employees.find((person) => person.name === 'Wen Li')
  const sara = employees.find((person) => person.name === 'Sara Iqbal')
  if (!zhou || !he || !wen || !sara) throw new Error('Attendance seed is missing Zhou Ning, He Gong, Wen Li, or Sara Iqbal.')

  await client.attendance.create({
    data: {
      employeeId: zhou.id,
      workDate: new Date('2026-10-16T00:00:00.000Z'),
      status: 'present',
      checkIn: new Date('2026-10-16T08:52:00.000Z'),
      checkOut: new Date('2026-10-16T17:05:00.000Z'),
    },
  })
  await client.attendance.create({
    data: {
      employeeId: he.id,
      workDate: new Date('2026-10-16T00:00:00.000Z'),
      status: 'late',
      checkIn: new Date('2026-10-16T09:22:00.000Z'),
      checkOut: new Date('2026-10-16T17:40:00.000Z'),
      note: 'Train delay',
    },
  })
  await client.attendance.create({
    data: {
      employeeId: wen.id,
      workDate: new Date('2026-10-17T00:00:00.000Z'),
      status: 'present',
      checkIn: new Date('2026-10-17T08:55:00.000Z'),
    },
  })

  await client.leaveRequest.create({
    data: {
      employeeId: zhou.id,
      kind: 'personal',
      dateFrom: new Date('2026-03-02T00:00:00.000Z'),
      dateTo: new Date('2026-03-02T00:00:00.000Z'),
      state: 'refused',
      reason: 'City errand',
    },
  })
  await client.leaveRequest.create({
    data: {
      employeeId: sara.id,
      kind: 'sick',
      dateFrom: new Date('2026-10-20T00:00:00.000Z'),
      dateTo: new Date('2026-10-21T00:00:00.000Z'),
      state: 'approved',
      reason: 'Clinic',
    },
  })
}
