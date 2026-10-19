import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  addTicketMessage,
  createTeam,
  createTicket,
  getTicket,
  helpdeskBoard,
  inboundTicket,
  saveSlaPolicy,
  updateTicket,
} from './services/helpdesk.ts'

function optionalId(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'Choose a record from the list.')
  return id
}

function tagsOf(value: unknown) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) throw new AppError(400, 'Tags must be a list of names.')
  return value.map((tag) => String(tag))
}

export function registerHelpdeskRoutes(app: Hono<AppEnv>) {
  app.post('/api/helpdesk/inbound', async (c) => c.json(await inboundTicket(await c.req.json()), 201))

  app.get('/api/helpdesk', async (c) => c.json(await helpdeskBoard(c.get('user').companyId)))

  app.post('/api/helpdesk/teams', async (c) => {
    const body = await c.req.json() as { name?: unknown }
    return c.json(await createTeam(c.get('user').companyId, String(body.name ?? '')), 201)
  })

  app.post('/api/helpdesk/sla', async (c) => {
    const body = await c.req.json() as { priority?: unknown; hours?: unknown }
    return c.json(await saveSlaPolicy(c.get('user').companyId, String(body.priority ?? ''), Number(body.hours)))
  })

  app.post('/api/helpdesk', async (c) => {
    const body = await c.req.json() as Record<string, unknown>
    const user = c.get('user')
    return c.json(await createTicket(user.companyId, user.name, {
      partnerId: Number(body.partnerId),
      subject: String(body.subject ?? ''),
      description: body.description === undefined ? undefined : String(body.description),
      teamId: body.teamId === undefined ? undefined : optionalId(body.teamId),
      assigneeId: body.assigneeId === undefined ? undefined : optionalId(body.assigneeId),
      priority: body.priority === undefined ? undefined : String(body.priority),
      tags: tagsOf(body.tags),
    }), 201)
  })

  app.get('/api/helpdesk/:id', async (c) => c.json(await getTicket(c.get('user').companyId, Number(c.req.param('id')))))

  app.patch('/api/helpdesk/:id', async (c) => {
    const body = await c.req.json() as Record<string, unknown>
    return c.json(await updateTicket(c.get('user').companyId, Number(c.req.param('id')), {
      subject: body.subject === undefined ? undefined : String(body.subject),
      description: body.description === undefined ? undefined : String(body.description),
      teamId: body.teamId === undefined ? undefined : optionalId(body.teamId),
      assigneeId: body.assigneeId === undefined ? undefined : optionalId(body.assigneeId),
      priority: body.priority === undefined ? undefined : String(body.priority),
      stage: body.stage === undefined ? undefined : String(body.stage),
      tags: tagsOf(body.tags),
    }))
  })

  app.post('/api/helpdesk/:id/messages', async (c) => {
    const body = await c.req.json() as { body?: unknown; internal?: unknown }
    const user = c.get('user')
    return c.json(await addTicketMessage(
      user.companyId,
      Number(c.req.param('id')),
      user.name,
      String(body.body ?? ''),
      body.internal === true,
    ), 201)
  })
}
