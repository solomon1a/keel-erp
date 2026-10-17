import type { Hono } from 'hono'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import { invoiceFromPurchase, invoiceFromSales, returnGoods } from './services/accounting.ts'
import { orderFromQuote } from './services/purchases.ts'
import {
  applyReceiptLanded,
  compareQuotes,
  createMaterialRequest,
  createSupplierQuote,
  deliverPartial,
  listPricingRules,
  orderFromQuotation,
  orderLinks,
  purchaseLinks,
  resolvePrice,
} from './services/trade.ts'

type QtyLine = { lineId: number; quantity: number }

function qtyLines(body: unknown): QtyLine[] | undefined {
  if (!body || typeof body !== 'object') return undefined
  const lines = (body as { lines?: unknown }).lines
  if (!lines) return undefined
  if (!Array.isArray(lines)) throw new AppError(400, 'Lines must be a list.')
  return lines.map((line) => {
    const row = line as { lineId?: number; quantity?: number }
    if (!row.lineId || !row.quantity) throw new AppError(400, 'Each line needs a line and a quantity.')
    return { lineId: row.lineId, quantity: row.quantity }
  })
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text()
  if (!text.trim()) return undefined
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new AppError(400, 'The request body is not valid JSON.')
  }
}

export function registerTradeRoutes(app: Hono<AppEnv>) {
  app.get('/api/orders/:id/links', async (c) => {
    return c.json(await orderLinks(c.get('user').companyId, Number(c.req.param('id'))))
  })

  app.post('/api/orders/:id/deliver-partial', async (c) => {
    const body = await readJson(c.req.raw)
    const lines = qtyLines(body)
    if (!lines) throw new AppError(400, 'Enter a quantity to deliver.')
    return c.json(await deliverPartial(c.get('user').companyId, Number(c.req.param('id')), lines))
  })

  app.get('/api/purchases/:id/links', async (c) => {
    return c.json(await purchaseLinks(c.get('user').companyId, Number(c.req.param('id'))))
  })

  app.post('/api/invoices/from/sales/:id', async (c) => {
    const body = await readJson(c.req.raw)
    return c.json(await invoiceFromSales(c.get('user').companyId, Number(c.req.param('id')), qtyLines(body)), 201)
  })

  app.post('/api/invoices/from/purchase/:id', async (c) => {
    const body = await readJson(c.req.raw)
    return c.json(await invoiceFromPurchase(c.get('user').companyId, Number(c.req.param('id')), qtyLines(body)), 201)
  })

  app.post('/api/invoices/:id/return', async (c) => {
    const body = await readJson(c.req.raw)
    return c.json(await returnGoods(c.get('user').companyId, Number(c.req.param('id')), qtyLines(body)), 201)
  })

  app.get('/api/pricing/rules', async (c) => c.json(await listPricingRules(c.get('user').companyId)))

  app.post('/api/pricing/resolve', async (c) => {
    const body = await c.req.json() as {
      side?: string
      productId?: number
      quantity?: number
      customerId?: number | null
      vendorId?: number | null
    }
    if (body.side !== 'sales' && body.side !== 'purchase') throw new AppError(400, 'Side is sales or purchase.')
    if (!body.productId || !body.quantity) throw new AppError(400, 'Choose a product and a quantity.')
    return c.json(await resolvePrice(c.get('user').companyId, {
      side: body.side,
      productId: body.productId,
      quantity: body.quantity,
      customerId: body.customerId,
      vendorId: body.vendorId,
    }))
  })

  app.post('/api/quotations/:id/order', async (c) => {
    const user = c.get('user')
    return c.json(await orderFromQuotation(user.companyId, user.id, Number(c.req.param('id'))), 201)
  })

  app.post('/api/material-requests', async (c) => {
    const body = await c.req.json() as { lines?: Array<{ productId: number; quantity: number }> }
    if (!body.lines) throw new AppError(400, 'Add a product to the request.')
    return c.json(await createMaterialRequest(c.get('user').companyId, body.lines), 201)
  })

  app.get('/api/material-requests/:id/comparison', async (c) => {
    return c.json(await compareQuotes(c.get('user').companyId, Number(c.req.param('id'))))
  })

  app.post('/api/supplier-quotes', async (c) => {
    const body = await c.req.json() as {
      vendorId?: number
      materialRequestId?: number | null
      lines?: Array<{ productId: number; quantity: number; unitCost: number }>
    }
    if (!body.vendorId || !body.lines) throw new AppError(400, 'Choose a supplier and add quoted lines.')
    return c.json(await createSupplierQuote(c.get('user').companyId, {
      vendorId: body.vendorId,
      materialRequestId: body.materialRequestId,
      lines: body.lines,
    }), 201)
  })

  app.post('/api/supplier-quotes/:id/order', async (c) => {
    const user = c.get('user')
    return c.json(await orderFromQuote(user.companyId, user.id, Number(c.req.param('id'))), 201)
  })

  app.post('/api/receipts/:id/landed', async (c) => {
    const body = await c.req.json() as { amount?: number }
    if (!body.amount) throw new AppError(400, 'Enter a landed cost.')
    return c.json(await applyReceiptLanded(c.get('user').companyId, Number(c.req.param('id')), body.amount))
  })
}
