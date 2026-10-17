import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { homeDashboard, homeSearch, parseHomeRange } from './services/home.ts'

export function registerHomeRoutes(app: Hono<AppEnv>) {
  app.get('/api/home', async (c) => {
    const user = c.get('user')
    return c.json(await homeDashboard(user.companyId, parseHomeRange(c.req.query('range'))))
  })

  app.get('/api/home/search', async (c) => {
    const user = c.get('user')
    return c.json(await homeSearch(user.companyId, c.req.query('q') ?? ''))
  })
}
