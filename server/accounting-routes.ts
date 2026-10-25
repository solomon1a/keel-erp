import type { Hono } from 'hono'
import { fapiaoSchema, invoiceCurrencySchema, invoicePaySchema, manualJournalSchema, numberSeriesSchema, paymentAllocateSchema, paymentDraftSchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { cached } from './cache.ts'
import { AppError } from './errors.ts'
import {
  balanceSheet,
  cancelInvoice,
  creditInvoice,
  ensureBooks,
  getInvoice,
  invoiceFromPos,
  listAccounts,
  listInvoices,
  listLedger,
  payInvoice,
  postInvoice,
  profitAndLoss,
  updateFapiao,
  vatReport,
} from './services/accounting.ts'
import { fxPosition, revalueFx, setInvoiceCurrency } from './services/fx.ts'
import { agingReport, applyChargeTemplate, assignCostCentre, centreReport, closeFiscalYear, listFiscalYears, openFiscalYear } from './services/books.ts'
import { agedCsv, agedStatement, cashFlow, type AgedSide } from './services/cash-reports.ts'
import { listNumberSeries, saveNumberSeries } from './services/number-series.ts'
import { allocatePayment, createPayment, listPayments, postManualJournal, postPayment, trialBalance } from './services/payments.ts'

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
    return c.json(await payInvoice(c.get('user').companyId, Number(c.req.param('id')), input.amount, input.method, input.rate))
  })

  app.patch('/api/invoices/:id/currency', async (c) => {
    const input = parseBody(invoiceCurrencySchema, await c.req.json())
    const companyId = c.get('user').companyId
    const invoiceId = Number(c.req.param('id'))
    await setInvoiceCurrency(companyId, invoiceId, input.currency, input.rate)
    return c.json(await getInvoice(companyId, invoiceId))
  })

  app.get('/api/reports/fx', async (c) => c.json(await fxPosition(c.get('user').companyId)))

  app.post('/api/fx/revalue', async (c) => c.json(await revalueFx(c.get('user').companyId)))

  app.post('/api/invoices/:id/credit', async (c) => {
    return c.json(await creditInvoice(c.get('user').companyId, Number(c.req.param('id'))), 201)
  })

  app.post('/api/invoices/:id/cancel', async (c) => c.json(await cancelInvoice(c.get('user').companyId, Number(c.req.param('id')))))

  app.get('/api/ledger', async (c) => c.json(await listLedger(c.get('user').companyId, c.req.query('account') || undefined)))

  app.get('/api/reports/pack', async (c) => {
    const companyId = c.get('user').companyId
    const asOf = c.req.query('asOf') || new Date().toISOString().slice(0, 10)
    const body = await cached(`reports:${companyId}:${asOf}`, 15_000, () =>
      Promise.all([
        profitAndLoss(companyId),
        balanceSheet(companyId),
        vatReport(companyId),
        agingReport(companyId, asOf),
      ]).then(([pnl, balance, vat, aging]) => ({ pnl, balance, vat, aging })),
    )
    return c.json(body)
  })

  app.get('/api/reports/pnl', async (c) => c.json(await profitAndLoss(c.get('user').companyId, c.req.query('from') || undefined, c.req.query('to') || undefined)))

  app.get('/api/reports/balance', async (c) => c.json(await balanceSheet(c.get('user').companyId, c.req.query('on') || undefined)))

  app.get('/api/reports/vat', async (c) => c.json(await vatReport(c.get('user').companyId, c.req.query('from') || undefined, c.req.query('to') || undefined)))

  app.get('/api/reports/aging', async (c) => {
    const asOf = c.req.query('asOf') || new Date().toISOString().slice(0, 10)
    return c.json(await agingReport(c.get('user').companyId, asOf))
  })

  app.get('/api/reports/aged', async (c) => {
    const side = c.req.query('side')
    if (side !== 'receivable' && side !== 'payable') throw new AppError(400, 'Choose receivable or payable.')
    const asOf = c.req.query('asOf') || new Date().toISOString().slice(0, 10)
    const report = await agedStatement(c.get('user').companyId, side as AgedSide, asOf)
    if (c.req.query('format') === 'csv') {
      return new Response(agedCsv(report), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="aged-${side}.csv"`,
        },
      })
    }
    return c.json(report)
  })

  app.get('/api/reports/cashflow', async (c) => {
    const from = c.req.query('from') || `${new Date().getUTCFullYear()}-01-01`
    const to = c.req.query('to') || new Date().toISOString().slice(0, 10)
    return c.json(await cashFlow(c.get('user').companyId, from, to))
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

  app.get('/api/number-series', async (c) => c.json(await listNumberSeries(c.get('user').companyId)))

  app.put('/api/number-series', async (c) => {
    const input = parseBody(numberSeriesSchema, await c.req.json())
    return c.json(await saveNumberSeries(c.get('user').companyId, input))
  })

  app.get('/api/payments', async (c) => c.json(await listPayments(c.get('user').companyId)))

  app.post('/api/payments', async (c) => {
    const input = parseBody(paymentDraftSchema, await c.req.json())
    return c.json(await createPayment(c.get('user').companyId, input), 201)
  })

  app.post('/api/payments/:id/post', async (c) => c.json(await postPayment(c.get('user').companyId, Number(c.req.param('id')))))

  app.post('/api/payments/:id/allocate', async (c) => {
    const input = parseBody(paymentAllocateSchema, await c.req.json())
    return c.json(await allocatePayment(c.get('user').companyId, Number(c.req.param('id')), input.invoiceId, input.amount))
  })

  app.post('/api/journal-entries', async (c) => {
    const input = parseBody(manualJournalSchema, await c.req.json())
    return c.json(await postManualJournal(c.get('user').companyId, input), 201)
  })

  app.get('/api/reports/trial-balance', async (c) => {
    const on = c.req.query('on') || new Date().toISOString().slice(0, 10)
    return c.json(await trialBalance(c.get('user').companyId, on))
  })
}
