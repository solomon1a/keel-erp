import type { Hono } from 'hono'
import { attendanceSchema, departmentSchema, employeeSchema, leaveSchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  createDepartment,
  createEmployee,
  decideLeave,
  getEmployee,
  listDepartments,
  listEmployees,
  markAttendance,
  requestLeave,
  updateEmployee,
} from './services/hr.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  return parsed.data
}

export function registerHrRoutes(app: Hono<AppEnv>) {
  app.get('/api/departments', async (c) => c.json(await listDepartments(c.get('user').companyId)))
  app.post('/api/departments', async (c) => {
    const input = parseBody(departmentSchema, await c.req.json())
    return c.json(await createDepartment(c.get('user').companyId, input), 201)
  })
  app.get('/api/employees', async (c) => c.json(await listEmployees(c.get('user').companyId)))
  app.post('/api/employees', async (c) => {
    const input = parseBody(employeeSchema, await c.req.json())
    return c.json(await createEmployee(c.get('user').companyId, input), 201)
  })
  app.get('/api/employees/:id', async (c) => c.json(await getEmployee(c.get('user').companyId, Number(c.req.param('id')))))
  app.patch('/api/employees/:id', async (c) => {
    const input = parseBody(employeeSchema, await c.req.json())
    return c.json(await updateEmployee(c.get('user').companyId, Number(c.req.param('id')), input))
  })
  app.post('/api/employees/:id/attendance', async (c) => {
    const input = parseBody(attendanceSchema, await c.req.json())
    return c.json(await markAttendance(c.get('user').companyId, Number(c.req.param('id')), input))
  })
  app.post('/api/employees/:id/leave', async (c) => {
    const input = parseBody(leaveSchema, await c.req.json())
    return c.json(await requestLeave(c.get('user').companyId, Number(c.req.param('id')), input), 201)
  })
  app.post('/api/employees/:id/leave/:leaveId/approve', async (c) => {
    return c.json(await decideLeave(c.get('user').companyId, Number(c.req.param('id')), Number(c.req.param('leaveId')), 'approved'))
  })
  app.post('/api/employees/:id/leave/:leaveId/refuse', async (c) => {
    return c.json(await decideLeave(c.get('user').companyId, Number(c.req.param('id')), Number(c.req.param('leaveId')), 'refused'))
  })
}
