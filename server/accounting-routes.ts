import type { Hono } from 'hono'
import { fapiaoSchema, invoicePaySchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  balanceSheet,
  cancelInvoice,
  creditInvoice,
  ensureBooks,
  getInvoice,
  invoiceFromPos,
  invoiceFromPurchase,
  invoiceFromSales,
  listAccounts,
  listInvoices,
  listLedger,
  payInvoice,
  postInvoice,
  profitAndLoss,
  updateFapiao,
  vatReport,
} from './services/accounting.ts'
import { agingReport, applyChargeTemplate, assignCostCentre, centreReport, closeFiscalYear, listFiscalYears, openFiscalYear } from './services/books.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  return parsed.data
}

export function registerAccountingRoutes(app: Hono<AppEnv>) {
  app.get('/api/accounts', async (c) => c.json(await listAccounts(c.get('user').companyId)))

  app.get('/api/invoices', async (c) => {
    const moveType = c.req.query('moveType') || undefined
    return c.json(await listInvoices(c.get('user').companyId, moveType))
  })

  app.get('/api/invoices/:id', async (c) => c.json(await getInvoice(c.get('user').companyId, Number(c.req.param('id')))))

  app.post('/api/invoices/from/sales/:id', async (c) => {
    return c.json(await invoiceFromSales(c.get('user').companyId, Number(c.req.param('id'))), 201)
  })

  app.post('/api/invoices/from/purchase/:id', async (c) => {
    return c.json(await invoiceFromPurchase(c.get('user').companyId, Number(c.req.param('id'))), 201)
  })

  app.post('/api/invoices/from/pos/:id', async (c) => {
    return c.json(await invoiceFromPos(c.get('user').companyId, Number(c.req.param('id'))), 201)
  })

  app.patch('/api/invoices/:id', async (c) => {
    const input = parseBody(fapiaoSchema, await c.req.json())
    return c.json(await updateFapiao(c.get('user').companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/invoices/:id/post', async (c) => c.json(await postInvoice(c.get('user').companyId, Number(c.req.param('id')))))

  app.post('/api/invoices/:id/pay', async (c) => {
    const input = parseBody(invoicePaySchema, await c.req.json())
    return c.json(await payInvoice(c.get('user').companyId, Number(c.req.param('id')), input.amount, input.method))
  })

  app.post('/api/invoices/:id/credit', async (c) => {
    return c.json(await creditInvoice(c.get('user').companyId, Number(c.req.param('id'))), 201)
  })

  app.post('/api/invoices/:id/cancel', async (c) => c.json(await cancelInvoice(c.get('user').companyId, Number(c.req.param('id')))))

  app.get('/api/ledger', async (c) => c.json(await listLedger(c.get('user').companyId, c.req.query('account') || undefined)))

  app.get('/api/reports/pnl', async (c) => c.json(await profitAndLoss(c.get('user').companyId, c.req.query('from') || undefined, c.req.query('to') || undefined)))

  app.get('/api/reports/balance', async (c) => c.json(await balanceSheet(c.get('user').companyId, c.req.query('on') || undefined)))

  app.get('/api/reports/vat', async (c) => c.json(await vatReport(c.get('user').companyId, c.req.query('from') || undefined, c.req.query('to') || undefined)))

  app.get('/api/reports/aging', async (c) => {
    const asOf = c.req.query('asOf') || new Date().toISOString().slice(0, 10)
    return c.json(await agingReport(c.get('user').companyId, asOf))
  })

  app.get('/api/reports/centres', async (c) => c.json(await centreReport(c.get('user').companyId)))

  app.get('/api/fiscal-years', async (c) => c.json(await listFiscalYears(c.get('user').companyId)))

  app.post('/api/fiscal-years', async (c) => {
    const body = await c.req.json() as { name?: string; startsOn?: string; endsOn?: string }
    if (!body.name || !body.startsOn || !body.endsOn) throw new AppError(400, 'Name the year and give it dates.')
    return c.json(await openFiscalYear(c.get('user').companyId, body.name, body.startsOn, body.endsOn), 201)
  })

  app.post('/api/fiscal-years/:name/close', async (c) => {
    await ensureBooks(c.get('user').companyId)
    return c.json(await closeFiscalYear(c.get('user').companyId, c.req.param('name')))
  })

  app.post('/api/invoices/:id/charge', async (c) => {
    const body = await c.req.json() as { template?: string }
    if (!body.template) throw new AppError(400, 'Name the charges template.')
    return c.json(await applyChargeTemplate(c.get('user').companyId, Number(c.req.param('id')), body.template))
  })

  app.post('/api/invoices/:id/centre', async (c) => {
    const body = await c.req.json() as { code?: string }
    if (!body.code) throw new AppError(400, 'Choose a cost centre.')
    return c.json(await assignCostCentre(c.get('user').companyId, Number(c.req.param('id')), body.code))
  })
}
