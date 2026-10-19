import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  askLeave,
  attendanceBoard,
  createLeaveType,
  decideLeaveRequest,
  leaveBoard,
  leaveCalendar,
  punch,
  saveAllocation,
  saveShift,
} from './services/attendance.ts'

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

function monthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10)
}

export function registerAttendanceRoutes(app: Hono<AppEnv>) {
  app.get('/api/attendance', async (c) => {
    const from = c.req.query('from') || monthStart()
    const to = c.req.query('to') || todayStamp()
    return c.json(await attendanceBoard(c.get('user').companyId, from, to))
  })

  app.put('/api/attendance/shift', async (c) => {
    const body = await c.req.json() as { name?: unknown; start?: unknown; end?: unknown }
    return c.json(await saveShift(c.get('user').companyId, String(body.name ?? ''), String(body.start ?? ''), String(body.end ?? '')))
  })

  app.post('/api/attendance/punch', async (c) => {
    const body = await c.req.json() as { employeeId?: unknown; action?: unknown }
    const employeeId = Number(body.employeeId)
    if (!Number.isInteger(employeeId) || employeeId <= 0) throw new AppError(400, 'Choose an employee.')
    if (body.action !== 'in' && body.action !== 'out') throw new AppError(400, 'Choose check in or check out.')
    return c.json(await punch(c.get('user').companyId, employeeId, body.action))
  })

  app.get('/api/leave', async (c) => {
    const year = Number(c.req.query('year') || new Date().getUTCFullYear())
    return c.json(await leaveBoard(c.get('user').companyId, year))
  })

  app.get('/api/leave/calendar', async (c) => {
    const from = c.req.query('from') || monthStart()
    const to = c.req.query('to') || todayStamp()
    return c.json(await leaveCalendar(c.get('user').companyId, from, to))
  })

  app.post('/api/leave/types', async (c) => {
    const body = await c.req.json() as { name?: unknown; code?: unknown; paid?: unknown }
    return c.json(await createLeaveType(c.get('user').companyId, String(body.name ?? ''), String(body.code ?? ''), body.paid !== false), 201)
  })

  app.post('/api/leave/allocations', async (c) => {
    const body = await c.req.json() as { employeeId?: unknown; leaveTypeId?: unknown; year?: unknown; days?: unknown }
    return c.json(await saveAllocation(
      c.get('user').companyId,
      Number(body.employeeId),
      Number(body.leaveTypeId),
      Number(body.year),
      Number(body.days),
    ))
  })

  app.post('/api/leave/requests', async (c) => {
    const body = await c.req.json() as { employeeId?: unknown; code?: unknown; dateFrom?: unknown; dateTo?: unknown; reason?: unknown }
    return c.json(await askLeave(c.get('user').companyId, {
      employeeId: Number(body.employeeId),
      code: String(body.code ?? ''),
      dateFrom: String(body.dateFrom ?? ''),
      dateTo: String(body.dateTo ?? ''),
      reason: body.reason === undefined ? undefined : String(body.reason),
    }), 201)
  })

  app.post('/api/leave/:id/approve', async (c) => {
    return c.json(await decideLeaveRequest(c.get('user').companyId, Number(c.req.param('id')), 'approved'))
  })

  app.post('/api/leave/:id/refuse', async (c) => {
    return c.json(await decideLeaveRequest(c.get('user').companyId, Number(c.req.param('id')), 'refused'))
  })
}
