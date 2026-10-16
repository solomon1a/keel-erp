import type { Hono } from 'hono'
import { parseRole } from '../shared/roles.ts'
import { signupSchema } from '../shared/schemas.ts'
import { type AppEnv, openSession, writeSessionCookie } from './auth.ts'
import { AppError } from './errors.ts'
import { clientKey, signupAllowed } from './rate-limit.ts'
import { provisionCompany } from './services/provision.ts'

function parseSignup(body: unknown) {
  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  }
  return parsed.data
}

export function registerSignupRoutes(app: Hono<AppEnv>) {
  app.post('/api/signup', async (c) => {
    const key = clientKey(c.req.header('x-forwarded-for'))
    if (!signupAllowed(key)) {
      throw new AppError(429, 'Too many signups from this network. Try again in an hour.')
    }
    let body: unknown
    try {
      body = await c.req.json()
    } catch {
      throw new AppError(400, 'Check the form and try again.')
    }
    const input = parseSignup(body)
    const created = await provisionCompany(input)
    const role = parseRole(created.user.role)
    if (!role) throw new AppError(500, 'This account has an unknown role.')
    const session = await openSession(created.user.id)
    writeSessionCookie(c, session.token, session.maxAge)
    return c.json(
      {
        id: created.user.id,
        name: created.user.name,
        email: created.user.email,
        role,
        companyId: created.user.companyId,
        company: created.user.company,
        locale: created.locale,
      },
      201,
    )
  })
}
