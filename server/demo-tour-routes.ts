import type { Hono } from 'hono'
import { type AppEnv, requireAdmin } from './auth.ts'
import { AppError } from './errors.ts'
import { actDemo, demoTourState, moveDemo, resetDemoData, startDemo } from './services/demo-tour.ts'

function readObject(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return {}
  return body as Record<string, unknown>
}

function readStep(body: Record<string, unknown>) {
  if (!Number.isInteger(body.step)) throw new AppError(400, 'Choose a step.')
  return body.step as number
}

export function registerDemoTourRoutes(app: Hono<AppEnv>) {
  app.get('/api/demo-tour', async (c) => c.json(await demoTourState(c.get('user').companyId)))

  app.post('/api/demo-tour/start', async (c) => {
    const body = readObject(await c.req.json().catch(() => ({})))
    const restart = body.restart === true
    if (restart) requireAdmin(c.get('user'))
    return c.json(await startDemo(c.get('user'), restart))
  })

  app.post('/api/demo-tour/act', async (c) => {
    const body = readObject(await c.req.json().catch(() => ({})))
    return c.json(await actDemo(c.get('user'), readStep(body)))
  })

  app.post('/api/demo-tour/step', async (c) => {
    const body = readObject(await c.req.json().catch(() => ({})))
    const status = typeof body.status === 'string' ? body.status : undefined
    return c.json(await moveDemo(c.get('user').companyId, readStep(body), status))
  })

  app.post('/api/demo-tour/reset', async (c) => {
    requireAdmin(c.get('user'))
    return c.json(await resetDemoData(c.get('user').companyId))
  })
}
