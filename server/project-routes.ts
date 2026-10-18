import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  addDependency,
  addMilestone,
  addTask,
  addTimesheet,
  approveMilestone,
  approveTimesheet,
  createProject,
  getProject,
  invoiceProject,
  listProjects,
  profitability,
  updateTask,
} from './services/projects.ts'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function registerProjectRoutes(app: Hono<AppEnv>) {
  app.get('/api/projects', async (c) => c.json(await listProjects(c.get('user').companyId)))
  app.post('/api/projects', async (c) => {
    const body = await c.req.json() as { name?: string; partnerId?: number | null; billingType?: string; hourlyRate?: number }
    if (!text(body.name) || !body.billingType) throw new AppError(400, 'Name the project and choose how it is billed.')
    return c.json(await createProject(c.get('user').companyId, {
      name: text(body.name),
      partnerId: body.partnerId,
      billingType: body.billingType,
      hourlyRate: body.hourlyRate,
    }), 201)
  })
  app.get('/api/projects/:id', async (c) => c.json(await getProject(c.get('user').companyId, Number(c.req.param('id')))))
  app.get('/api/projects/:id/profitability', async (c) => c.json(await profitability(c.get('user').companyId, Number(c.req.param('id')))))
  app.post('/api/projects/:id/tasks', async (c) => {
    const body = await c.req.json() as { name?: string; stageId?: number; assigneeId?: number | null; deadline?: string | null; startDate?: string | null; endDate?: string | null; dependsOnId?: number | null }
    if (!text(body.name)) throw new AppError(400, 'Name the task.')
    return c.json(await addTask(c.get('user').companyId, Number(c.req.param('id')), { ...body, name: text(body.name) }), 201)
  })
  app.patch('/api/projects/tasks/:id', async (c) => {
    const body = await c.req.json() as { stageId?: number; assigneeId?: number | null; deadline?: string | null; startDate?: string | null; endDate?: string | null; name?: string }
    return c.json(await updateTask(c.get('user').companyId, Number(c.req.param('id')), body))
  })
  app.post('/api/projects/tasks/:id/dependencies', async (c) => {
    const body = await c.req.json() as { dependsOnId?: number }
    if (!body.dependsOnId) throw new AppError(400, 'Choose the task this one waits on.')
    return c.json(await addDependency(c.get('user').companyId, Number(c.req.param('id')), body.dependsOnId), 201)
  })
  app.post('/api/projects/:id/timesheets', async (c) => {
    const body = await c.req.json() as { taskId?: number; employeeId?: number; workDate?: string; hours?: number; description?: string }
    if (!body.taskId || !body.employeeId || !body.workDate || body.hours == null) {
      throw new AppError(400, 'Choose a task, a person, a date, and the hours.')
    }
    return c.json(await addTimesheet(c.get('user').companyId, Number(c.req.param('id')), {
      taskId: body.taskId,
      employeeId: body.employeeId,
      workDate: body.workDate,
      hours: body.hours,
      description: body.description,
    }), 201)
  })
  app.post('/api/projects/timesheets/:id/approve', async (c) => c.json(await approveTimesheet(c.get('user').companyId, Number(c.req.param('id')))))
  app.post('/api/projects/:id/milestones', async (c) => {
    const body = await c.req.json() as { name?: string; amount?: number; dueDate?: string | null }
    if (!text(body.name) || body.amount == null) throw new AppError(400, 'Name the milestone and its amount.')
    return c.json(await addMilestone(c.get('user').companyId, Number(c.req.param('id')), { name: text(body.name), amount: body.amount, dueDate: body.dueDate }), 201)
  })
  app.post('/api/projects/milestones/:id/approve', async (c) => c.json(await approveMilestone(c.get('user').companyId, Number(c.req.param('id')))))
  app.post('/api/projects/:id/invoice', async (c) => c.json(await invoiceProject(c.get('user').companyId, Number(c.req.param('id'))), 201))
}
