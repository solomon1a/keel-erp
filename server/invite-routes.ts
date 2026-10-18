import type { Context, Hono } from 'hono'
import { acceptInviteSchema, inviteSchema } from '../shared/schemas.ts'
import { openSession, requireAdmin, writeSessionCookie, type AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import { acceptInvite, createInvite, listInvites, previewInvite, resendInvite, revokeInvite } from './services/invites.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  return parsed.data
}

export function requestOrigin(c: Context) {
  const origin = c.req.header('origin')
  if (origin && /^https?:\/\//.test(origin)) return origin.replace(/\/$/, '')
  const forwardedHost = c.req.header('x-forwarded-host')
  const host = forwardedHost || c.req.header('host')
  const proto = c.req.header('x-forwarded-proto') || (host?.includes('localhost') || host?.startsWith('127.') ? 'http' : 'https')
  if (host) return `${proto}://${host}`
  const configured = process.env.APP_ORIGIN?.replace(/\/$/, '')
  return configured || 'http://127.0.0.1:43123'
}

export function registerInviteRoutes(app: Hono<AppEnv>) {
  app.get('/api/invites/:token', async (c) => c.json(await previewInvite(c.req.param('token'))))
  app.post('/api/invites/accept', async (c) => {
    const input = parseBody(acceptInviteSchema, await c.req.json())
    const userId = await acceptInvite(input.token, input.name, input.password)
    const session = await openSession(userId)
    writeSessionCookie(c, session.token, session.maxAge)
    return c.json({ ok: true })
  })
  app.get('/api/invites', async (c) => {
    requireAdmin(c.get('user'))
    return c.json(await listInvites(c.get('user').companyId))
  })
  app.post('/api/invites', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const input = parseBody(inviteSchema, await c.req.json())
    return c.json(await createInvite(user.companyId, user.id, input.email, input.role, requestOrigin(c)), 201)
  })
  app.post('/api/invites/:id/resend', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    return c.json(await resendInvite(user.companyId, Number(c.req.param('id')), user.id, requestOrigin(c)))
  })
  app.post('/api/invites/:id/revoke', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    return c.json(await revokeInvite(user.companyId, Number(c.req.param('id'))))
  })
}
