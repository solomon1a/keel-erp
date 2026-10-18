import type { Hono } from 'hono'
import { requireAdmin, type AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  createPoint,
  listAlerts,
  listChecks,
  listPoints,
  overrideCheck,
  qualityDashboard,
  recordCheck,
  resolveAlert,
} from './services/quality.ts'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function registerQualityRoutes(app: Hono<AppEnv>) {
  app.get('/api/quality/dashboard', async (c) => c.json(await qualityDashboard(c.get('user').companyId)))
  app.get('/api/quality/points', async (c) => c.json(await listPoints(c.get('user').companyId)))
  app.post('/api/quality/points', async (c) => {
    const body = await c.req.json() as {
      name?: string
      productId?: number
      trigger?: string
      operationName?: string
      checkType?: string
      minValue?: number | null
      maxValue?: number | null
      checklist?: string
    }
    if (!text(body.name) || !body.productId || !body.trigger || !body.checkType) {
      throw new AppError(400, 'Name the check, the product, when it runs, and what kind it is.')
    }
    return c.json(await createPoint(c.get('user').companyId, {
      name: text(body.name),
      productId: body.productId,
      trigger: body.trigger,
      operationName: body.operationName,
      checkType: body.checkType,
      minValue: body.minValue,
      maxValue: body.maxValue,
      checklist: body.checklist,
    }), 201)
  })
  app.get('/api/quality/checks', async (c) => c.json(await listChecks(c.get('user').companyId)))
  app.post('/api/quality/checks/:id/record', async (c) => {
    const body = await c.req.json() as { status?: 'pass' | 'fail'; measured?: number | null; checklist?: string[]; notes?: string }
    return c.json(await recordCheck(c.get('user').companyId, Number(c.req.param('id')), body))
  })
  app.post('/api/quality/checks/:id/override', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const body = await c.req.json() as { reason?: string }
    return c.json(await overrideCheck(user.companyId, user.id, Number(c.req.param('id')), text(body.reason)))
  })
  app.get('/api/quality/alerts', async (c) => c.json(await listAlerts(c.get('user').companyId)))
  app.post('/api/quality/alerts/:id/resolve', async (c) => {
    const body = await c.req.json() as { action?: string }
    if (!body.action) throw new AppError(400, 'Choose rework, scrap, or return to vendor.')
    return c.json(await resolveAlert(c.get('user').companyId, Number(c.req.param('id')), body.action))
  })
}
