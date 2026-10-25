import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { cached } from './cache.ts'
import { readSetting } from './services/company-settings.ts'
import { prisma } from './db.ts'
import { homeDashboard, homeSearch, parseHomeRange, type HomeRange } from './services/home.ts'

const homeTtlMs = 15_000

export function registerHomeRoutes(app: Hono<AppEnv>) {
  app.get('/api/home', async (c) => {
    const user = c.get('user')
    const query = c.req.query('range')
    const showCurrency = (await readSetting(prisma, user.companyId, 'dashboard', 'currency', 'yes')) !== 'no'
    let range: HomeRange
    if (query) range = parseHomeRange(query)
    else {
      const saved = await readSetting(prisma, user.companyId, 'dashboard', 'range', 'This month')
      range = saved === 'This year' ? 'year' : saved === 'Today' ? 'today' : saved === 'This week' ? 'week' : 'month'
    }
    const body = await cached(`home:${user.companyId}:${range}:${showCurrency}`, homeTtlMs, () => homeDashboard(user.companyId, range))
    return c.json({ ...body, showCurrency, range })
  })

  app.get('/api/home/search', async (c) => {
    const user = c.get('user')
    return c.json(await homeSearch(user.companyId, c.req.query('q') ?? ''))
  })
}
