import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { asTradeGroup, tradeAnalysis, tradeCsv, type TradeSide } from './services/trade-analysis.ts'

function register(app: Hono<AppEnv>, path: string, side: TradeSide) {
  app.get(path, async (c) => {
    const year = new Date().getUTCFullYear()
    const from = c.req.query('from') || `${year}-01-01`
    const to = c.req.query('to') || new Date().toISOString().slice(0, 10)
    const report = await tradeAnalysis(c.get('user').companyId, side, asTradeGroup(c.req.query('group') ?? 'product'), from, to)
    if (c.req.query('format') === 'csv') {
      return new Response(tradeCsv(report), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="${side}-${report.group}.csv"`,
        },
      })
    }
    return c.json(report)
  })
}

export function registerAnalysisRoutes(app: Hono<AppEnv>) {
  register(app, '/api/reports/sales', 'sales')
  register(app, '/api/reports/purchases', 'purchase')
}
