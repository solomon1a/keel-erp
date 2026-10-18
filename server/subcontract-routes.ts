import type { Hono } from 'hono'
import { subcontractDraftSchema, subcontractFinishSchema, subcontractSendSchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  createSubcontractOrder,
  getSubcontractOrder,
  listSubcontractOrders,
  receiveFinished,
  sendComponents,
  subcontractStock,
} from './services/subcontract.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  return parsed.data
}

export function registerSubcontractRoutes(app: Hono<AppEnv>) {
  app.get('/api/subcontracting', async (c) => c.json(await listSubcontractOrders(c.get('user').companyId)))
  app.get('/api/subcontracting/stock', async (c) => c.json(await subcontractStock(c.get('user').companyId)))
  app.post('/api/subcontracting', async (c) => {
    const input = parseBody(subcontractDraftSchema, await c.req.json())
    return c.json(await createSubcontractOrder(c.get('user').companyId, input), 201)
  })
  app.get('/api/subcontracting/:id', async (c) => c.json(await getSubcontractOrder(c.get('user').companyId, Number(c.req.param('id')))))
  app.post('/api/subcontracting/:id/send', async (c) => {
    const input = parseBody(subcontractSendSchema, await c.req.json())
    return c.json(await sendComponents(c.get('user').companyId, Number(c.req.param('id')), input.lines, input.date))
  })
  app.post('/api/subcontracting/:id/receive', async (c) => {
    const input = parseBody(subcontractFinishSchema, await c.req.json())
    return c.json(await receiveFinished(c.get('user').companyId, Number(c.req.param('id')), input.quantity, input.date))
  })
}
