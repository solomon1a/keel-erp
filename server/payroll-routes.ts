import type { Hono } from 'hono'
import { expenseSchema, payrollRunSchema, salarySchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { requireAdmin } from './auth.ts'
import { AppError } from './errors.ts'
import {
  createExpense,
  createRun,
  decideExpense,
  getRun,
  listExpenses,
  listRuns,
  listSalaries,
  payRun,
  postRun,
  reimburseExpense,
  setSalary,
} from './services/payroll.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  return parsed.data
}

export function registerPayrollRoutes(app: Hono<AppEnv>) {
  app.get('/api/payroll/salaries', async (c) => c.json(await listSalaries(c.get('user').companyId)))
  app.put('/api/payroll/salaries/:employeeId', async (c) => {
    requireAdmin(c.get('user'))
    const input = parseBody(salarySchema, await c.req.json())
    return c.json(await setSalary(c.get('user').companyId, Number(c.req.param('employeeId')), input.monthlyGross))
  })
  app.get('/api/payroll', async (c) => c.json(await listRuns(c.get('user').companyId)))
  app.post('/api/payroll', async (c) => {
    const input = parseBody(payrollRunSchema, await c.req.json())
    return c.json(await createRun(c.get('user').companyId, input), 201)
  })
  app.get('/api/payroll/:id', async (c) => c.json(await getRun(c.get('user').companyId, Number(c.req.param('id')))))
  app.post('/api/payroll/:id/post', async (c) => {
    requireAdmin(c.get('user'))
    return c.json(await postRun(c.get('user').companyId, Number(c.req.param('id'))))
  })
  app.post('/api/payroll/:id/pay', async (c) => {
    requireAdmin(c.get('user'))
    return c.json(await payRun(c.get('user').companyId, Number(c.req.param('id'))))
  })
  app.get('/api/expenses', async (c) => c.json(await listExpenses(c.get('user').companyId)))
  app.post('/api/expenses', async (c) => {
    const input = parseBody(expenseSchema, await c.req.json())
    return c.json(await createExpense(c.get('user').companyId, input), 201)
  })
  app.post('/api/expenses/:id/approve', async (c) => {
    requireAdmin(c.get('user'))
    return c.json(await decideExpense(c.get('user').companyId, Number(c.req.param('id')), 'approved'))
  })
  app.post('/api/expenses/:id/refuse', async (c) => {
    requireAdmin(c.get('user'))
    return c.json(await decideExpense(c.get('user').companyId, Number(c.req.param('id')), 'refused'))
  })
  app.post('/api/expenses/:id/reimburse', async (c) => {
    requireAdmin(c.get('user'))
    return c.json(await reimburseExpense(c.get('user').companyId, Number(c.req.param('id'))))
  })
}
