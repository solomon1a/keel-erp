import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { cached } from './cache.ts'
import { homeDashboard, homeSearch, parseHomeRange } from './services/home.ts'

const homeTtlMs = 15_000

export function registerHomeRoutes(app: Hono<AppEnv>) {
  app.get('/api/home', async (c) => {
    const user = c.get('user')
    const range = parseHomeRange(c.req.query('range'))
    const body = await cached(`home:${user.companyId}:${range}`, homeTtlMs, () => homeDashboard(user.companyId, range))
    return c.json(body)
  })

  app.get('/api/home/search', async (c) => {
    const user = c.get('user')
    return c.json(await homeSearch(user.companyId, c.req.query('q') ?? ''))
  })
}
