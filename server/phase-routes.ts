import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import { requestOrigin } from './invite-routes.ts'
import {
  assignCommercial,
  commercialOptions,
  commitImport,
  documentMail,
  exportFile,
  importKinds,
  invoiceTerms,
  listCompanyTaxes,
  listFiles,
  listRecurring,
  addPriceItem,
  createPriceList,
  listPriceLists,
  listTerms,
  previewImport,
  removePriceItem,
  savePaymentTerm,
  updatePriceItem,
  previewTax,
  readFile,
  removeFile,
  runJobs,
  saveFile,
  sendDocument,
  tableFromUpload,
  taxReport,
} from './services/phase.ts'

function sheet(header: string[], rows: string[][]) {
  const escape = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return [header, ...rows].map((line) => line.map(escape).join(',')).join('\n')
}

function nullableId(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const id = Number(value)
  if (!Number.isInteger(id) || id <= 0) throw new AppError(400, 'Choose a record from the list.')
  return id
}

export function registerPhaseRoutes(app: Hono<AppEnv>) {
  app.get('/api/cron', async (c) => {
    const secret = process.env.CRON_SECRET?.trim()
    if (!secret) throw new AppError(503, 'Set CRON_SECRET before running scheduled jobs.')
    const header = c.req.header('authorization') ?? ''
    if (header !== `Bearer ${secret}`) throw new AppError(401, 'Sign in to continue.')
    return c.json(await runJobs(new Date()))
  })

  app.get('/api/taxes/company', async (c) => c.json(await listCompanyTaxes(c.get('user').companyId)))

  app.get('/api/taxes/report', async (c) => c.json(await taxReport(c.get('user').companyId)))

  app.post('/api/taxes/preview', async (c) => {
    const body = await c.req.json() as { base?: number; quantity?: number; groupId?: number; positionId?: number | null }
    if (!body.groupId) throw new AppError(400, 'Choose a tax group.')
    return c.json(await previewTax(c.get('user').companyId, {
      base: Number(body.base) || 0,
      quantity: Number(body.quantity) || 1,
      groupId: body.groupId,
      positionId: body.positionId ?? null,
    }))
  })

  app.get('/api/payment-terms', async (c) => c.json(await listTerms(c.get('user').companyId)))

  app.post('/api/payment-terms', async (c) => {
    const body = await c.req.json() as { name?: unknown; lines?: unknown }
    return c.json(await savePaymentTerm(c.get('user').companyId, body.name, body.lines), 201)
  })

  app.patch('/api/payment-terms/:id', async (c) => {
    const body = await c.req.json() as { name?: unknown; lines?: unknown }
    return c.json(await savePaymentTerm(c.get('user').companyId, body.name, body.lines, Number(c.req.param('id'))))
  })

  app.get('/api/price-lists', async (c) => {
    const side = c.req.query('side')
    if (side && side !== 'sales' && side !== 'purchase') throw new AppError(400, 'Choose sales or purchase.')
    return c.json(await listPriceLists(c.get('user').companyId, side || null))
  })

  app.post('/api/price-lists', async (c) => {
    const body = await c.req.json() as { name?: unknown; side?: unknown }
    return c.json(await createPriceList(c.get('user').companyId, body.name, body.side), 201)
  })

  app.post('/api/price-lists/:id/items', async (c) => {
    const body = await c.req.json() as { productId?: unknown; minQty?: unknown; price?: unknown }
    return c.json(await addPriceItem(c.get('user').companyId, Number(c.req.param('id')), body.productId, body.minQty, body.price), 201)
  })

  app.patch('/api/price-lists/:id/items/:itemId', async (c) => {
    const body = await c.req.json() as { minQty?: unknown; price?: unknown }
    return c.json(await updatePriceItem(c.get('user').companyId, Number(c.req.param('id')), Number(c.req.param('itemId')), body.minQty, body.price))
  })

  app.delete('/api/price-lists/:id/items/:itemId', async (c) => {
    await removePriceItem(c.get('user').companyId, Number(c.req.param('id')), Number(c.req.param('itemId')))
    return c.json({ ok: true })
  })

  app.get('/api/invoices/:id/terms', async (c) => c.json(await invoiceTerms(c.get('user').companyId, Number(c.req.param('id')))))

  app.get('/api/recurring', async (c) => c.json(await listRecurring(c.get('user').companyId)))

  app.get('/api/commercial', async (c) => c.json(await commercialOptions(c.get('user').companyId)))

  app.patch('/api/contacts/:id/commercial', async (c) => {
    const body = await c.req.json() as Record<string, unknown>
    return c.json(await assignCommercial(c.get('user').companyId, Number(c.req.param('id')), {
      salePriceListId: nullableId(body.salePriceListId),
      purchasePriceListId: nullableId(body.purchasePriceListId),
      paymentTermId: nullableId(body.paymentTermId),
      fiscalPositionId: nullableId(body.fiscalPositionId),
    }))
  })

  app.post('/api/documents/email', async (c) => {
    const body = await c.req.json() as { model?: string; recordId?: number; note?: string }
    if (!body.model || !body.recordId) throw new AppError(400, 'Choose a document.')
    return c.json(await sendDocument(c.get('user').companyId, body.model, body.recordId, requestOrigin(c), body.note ?? ''))
  })

  app.get('/api/documents/email', async (c) => {
    const model = c.req.query('model') ?? ''
    const recordId = Number(c.req.query('recordId'))
    return c.json(await documentMail(c.get('user').companyId, model, recordId))
  })

  app.get('/api/files', async (c) => {
    const model = c.req.query('model') ?? ''
    const recordId = Number(c.req.query('recordId'))
    return c.json(await listFiles(c.get('user').companyId, model, recordId))
  })

  app.post('/api/files', async (c) => {
    const body = await c.req.json() as { model?: string; recordId?: number; name?: string; mime?: string; data?: string }
    if (!body.model || !body.recordId || !body.name || !body.data) throw new AppError(400, 'Choose a file.')
    const bytes = Buffer.from(body.data, 'base64')
    return c.json(await saveFile(c.get('user').companyId, body.model, body.recordId, body.name, body.mime ?? 'application/octet-stream', bytes), 201)
  })

  app.get('/api/files/:id', async (c) => {
    const file = await readFile(c.get('user').companyId, Number(c.req.param('id')))
    if (file.url) return c.redirect(file.url)
    return new Response(new Uint8Array(file.bytes ?? Buffer.alloc(0)), {
      headers: {
        'content-type': file.mime,
        'content-disposition': `attachment; filename="${file.name.replace(/"/g, '')}"`,
      },
    })
  })

  app.delete('/api/files/:id', async (c) => c.json(await removeFile(c.get('user').companyId, Number(c.req.param('id')))))

  app.get('/api/import/kinds', async (c) => {
    c.get('user')
    return c.json(importKinds())
  })

  app.post('/api/import/preview', async (c) => {
    const body = await c.req.json() as { kind?: string; text?: string; mapping?: Record<string, string>; name?: string; data?: string }
    if (!body.kind) throw new AppError(400, 'Choose what to import.')
    const mapping = body.mapping ?? {}
    if (body.data) {
      const table = tableFromUpload(body.name ?? 'import.csv', Buffer.from(body.data, 'base64'))
      const text = sheet(table[0] ?? [], table.slice(1))
      return c.json(previewImport(body.kind, text, mapping))
    }
    return c.json(previewImport(body.kind, body.text ?? '', mapping))
  })

  app.post('/api/import/commit', async (c) => {
    const body = await c.req.json() as { kind?: string; rows?: Array<Record<string, string>> }
    if (!body.kind || !Array.isArray(body.rows)) throw new AppError(400, 'Nothing to import.')
    return c.json(await commitImport(c.get('user').companyId, body.kind, body.rows))
  })

  app.get('/api/export/:kind', async (c) => {
    const format = c.req.query('format') === 'xlsx' ? 'xlsx' : 'csv'
    const file = await exportFile(c.get('user').companyId, c.req.param('kind'), format)
    return new Response(new Uint8Array(file.body), {
      headers: {
        'content-type': file.mime,
        'content-disposition': `attachment; filename="${file.filename}"`,
      },
    })
  })
}
