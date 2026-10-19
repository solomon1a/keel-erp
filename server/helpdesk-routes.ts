import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import { inboundAllowed, inboundKey } from './rate-limit.ts'
import { verifyResendSignature } from './services/inbound-signature.ts'
import {
  addTicketMessage,
  companyIdForInboundToken,
  createTeam,
  createTicket,
  ensureInboundToken,
  getTicket,
  helpdeskBoard,
  inboundTicket,
  rotateInboundToken,
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

function presentedToken(pathToken: string | undefined, headerToken: string | undefined) {
  const path = pathToken?.trim()
  const header = headerToken?.trim()
  if (path && header && path !== header) throw new AppError(401, 'That inbound secret is not valid.')
  const token = path || header
  if (!token) throw new AppError(401, 'That inbound secret is not valid.')
  return token
}

async function receiveInbound(c: { req: { text: () => Promise<string>; header: (name: string) => string | undefined } }, token: string) {
  if (!inboundAllowed(inboundKey(token))) throw new AppError(429, 'Too many inbound messages. Try again shortly.')
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET?.trim()
  const raw = await c.req.text()
  if (webhookSecret) {
    const valid = verifyResendSignature(raw, {
      id: c.req.header('svix-id') ?? c.req.header('webhook-id'),
      timestamp: c.req.header('svix-timestamp') ?? c.req.header('webhook-timestamp'),
      signature: c.req.header('svix-signature') ?? c.req.header('webhook-signature'),
    }, webhookSecret)
    if (!valid) throw new AppError(401, 'The inbound signature is not valid.')
  }
  let body: unknown = {}
  if (raw.trim()) {
    try {
      body = JSON.parse(raw) as unknown
    } catch {
      throw new AppError(400, 'The inbound message needs a sender, subject, and body.')
    }
  }
  const companyId = await companyIdForInboundToken(token)
  return inboundTicket(companyId, body)
}

export function registerHelpdeskRoutes(app: Hono<AppEnv>) {
  app.post('/api/helpdesk/inbound', async (c) => {
    const token = presentedToken(undefined, c.req.header('x-keel-inbound-secret'))
    return c.json(await receiveInbound(c, token), 201)
  })

  app.post('/api/helpdesk/inbound/:companyToken', async (c) => {
    const token = presentedToken(c.req.param('companyToken'), c.req.header('x-keel-inbound-secret'))
    return c.json(await receiveInbound(c, token), 201)
  })

  app.get('/api/helpdesk/inbound-token', async (c) => {
    const user = c.get('user')
    if (user.role !== 'admin') throw new AppError(403, 'Only an admin can see the inbound secret.')
    return c.json(await ensureInboundToken(user.companyId))
  })

  app.post('/api/helpdesk/inbound-token', async (c) => {
    const user = c.get('user')
    if (user.role !== 'admin') throw new AppError(403, 'Only an admin can see the inbound secret.')
    return c.json(await rotateInboundToken(user.companyId))
  })

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
