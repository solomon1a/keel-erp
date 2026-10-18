import type { Hono } from 'hono'
import { isWorkflowModel } from '../shared/workflow.ts'
import { requireAdmin, type AppEnv } from './auth.ts'
import { prisma } from './db.ts'
import { AppError } from './errors.ts'
import { accessSnapshot, addRule, assertModelAccess, deleteRule, setGrant, setUserGroups } from './services/access.ts'
import { applyLine, createBankAccount, createRule, getLockDates, importMapped, importStatement, listBankAccounts, listRules, listStatements, parseMappedCsv, parseOfx, reconcileLine, setLockDates, statementDetail, unreconcileLine, type ColumnMapping } from './services/bank.ts'
import { countStock } from './services/orders.ts'
import { landedCost, listStockLedger, listValuation, setCostMethod } from './services/valuation.ts'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function ownsRecord(companyId: number, model: string, recordId: number) {
  switch (model) {
    case 'desk.record':
      return prisma.deskRecord.findFirst({ where: { id: recordId, companyId }, select: { id: true } })
    case 'sale.order':
      return prisma.salesOrder.findFirst({ where: { id: recordId, companyId }, select: { id: true } })
    case 'purchase.order':
      return prisma.purchaseOrder.findFirst({ where: { id: recordId, companyId }, select: { id: true } })
    case 'mrp.order':
      return prisma.manufacturingOrder.findFirst({ where: { id: recordId, companyId }, select: { id: true } })
    case 'stock.transfer':
      return prisma.stockTransfer.findFirst({ where: { id: recordId, companyId }, select: { id: true } })
    case 'account.move':
      return prisma.invoice.findFirst({ where: { id: recordId, companyId }, select: { id: true } })
    default:
      return null
  }
}

export function registerCoreRoutes(app: Hono<AppEnv>) {
  app.get('/api/access', async (c) => {
    requireAdmin(c.get('user'))
    return c.json(await accessSnapshot(c.get('user').companyId))
  })

  app.put('/api/access/members', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const body = await c.req.json() as { userId?: number; groups?: string[] }
    if (!body.userId || !Array.isArray(body.groups)) throw new AppError(400, 'Choose a person and their groups.')
    await setUserGroups(user.companyId, body.userId, body.groups)
    return c.json(await accessSnapshot(user.companyId))
  })

  app.put('/api/access/grants', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const body = await c.req.json() as { groupKey?: string; model?: string; canRead?: boolean; canWrite?: boolean; canCreate?: boolean; canDelete?: boolean }
    if (!body.groupKey || !body.model) throw new AppError(400, 'Choose a group and a model.')
    await setGrant(user.companyId, body.groupKey, body.model, {
      canRead: Boolean(body.canRead),
      canWrite: Boolean(body.canWrite),
      canCreate: Boolean(body.canCreate),
      canDelete: Boolean(body.canDelete),
    })
    return c.json(await accessSnapshot(user.companyId))
  })

  app.post('/api/access/rules', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const body = await c.req.json() as { groupKey?: string; model?: string; name?: string; field?: string; op?: string; value?: string }
    const name = text(body.name)
    const field = text(body.field)
    const value = text(body.value)
    if (!body.groupKey || !body.model || !name || !field || !body.op || !value) {
      throw new AppError(400, 'A rule needs a group, a model, a name, a field, and a value.')
    }
    await addRule(user.companyId, { groupKey: body.groupKey, model: body.model, name, field, op: body.op, value })
    return c.json(await accessSnapshot(user.companyId))
  })

  app.delete('/api/access/rules/:id', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    await deleteRule(user.companyId, Number(c.req.param('id')))
    return c.json({ ok: true })
  })

  app.get('/api/saved-filters', async (c) => {
    const user = c.get('user')
    const model = c.req.query('model') ?? ''
    if (!model) throw new AppError(400, 'Name the list.')
    return c.json(await prisma.savedFilter.findMany({
      where: { companyId: user.companyId, userId: user.id, model },
      orderBy: { name: 'asc' },
    }))
  })

  app.post('/api/saved-filters', async (c) => {
    const user = c.get('user')
    const body = await c.req.json() as { model?: string; name?: string; query?: string; groupBy?: string; state?: string }
    const model = text(body.model)
    const name = text(body.name)
    if (!model || !name) throw new AppError(400, 'Name the filter.')
    const row = await prisma.savedFilter.upsert({
      where: { userId_model_name: { userId: user.id, model, name } },
      update: { query: body.query ?? '', groupBy: body.groupBy ?? 'none', state: body.state ?? 'all' },
      create: {
        companyId: user.companyId,
        userId: user.id,
        model,
        name,
        query: body.query ?? '',
        groupBy: body.groupBy ?? 'none',
        state: body.state ?? 'all',
      },
    })
    return c.json(row, 201)
  })

  app.delete('/api/saved-filters/:id', async (c) => {
    const user = c.get('user')
    const row = await prisma.savedFilter.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId, userId: user.id },
    })
    if (!row) throw new AppError(404, 'That filter is not on this desk.')
    await prisma.savedFilter.delete({ where: { id: row.id } })
    return c.json({ ok: true })
  })

  app.get('/api/chatter', async (c) => {
    const user = c.get('user')
    const model = c.req.query('model') ?? ''
    const recordId = Number(c.req.query('recordId'))
    if (!model || !recordId) throw new AppError(400, 'Name the record.')
    const owned = await ownsRecord(user.companyId, model, recordId)
    if (!owned) throw new AppError(404, 'That record is not in this company.')
    return c.json(await prisma.chatterMessage.findMany({
      where: { companyId: user.companyId, model, recordId },
      include: { user: { select: { name: true } } },
      orderBy: { id: 'asc' },
    }))
  })

  app.post('/api/chatter', async (c) => {
    const user = c.get('user')
    const body = await c.req.json() as { model?: string; recordId?: number; summary?: string }
    const model = text(body.model)
    const summary = text(body.summary)
    if (!model || !body.recordId || !summary) throw new AppError(400, 'Write a note.')
    if (model !== 'desk.record' && !isWorkflowModel(model)) throw new AppError(400, 'That record does not keep a log.')
    const owned = await ownsRecord(user.companyId, model, body.recordId)
    if (!owned) throw new AppError(404, 'That record is not in this company.')
    const row = await prisma.chatterMessage.create({
      data: { companyId: user.companyId, model, recordId: body.recordId, userId: user.id, kind: 'note', summary },
      include: { user: { select: { name: true } } },
    })
    return c.json(row, 201)
  })

  app.get('/api/bank/accounts', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'read')
    return c.json(await listBankAccounts(user.companyId))
  })

  app.post('/api/bank/accounts', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'create')
    const body = await c.req.json() as { name?: string; accountCode?: string; currency?: string }
    if (!text(body.name)) throw new AppError(400, 'Name the bank account.')
    return c.json(await createBankAccount(user.companyId, text(body.name), text(body.accountCode) || '1002', text(body.currency)), 201)
  })

  app.get('/api/bank/rules', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'read')
    return c.json(await listRules(user.companyId))
  })

  app.post('/api/bank/rules', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'create')
    const body = await c.req.json() as { name?: string; matchText?: string; action?: string; accountCode?: string }
    if (!text(body.name) || !text(body.matchText) || !body.action || !text(body.accountCode)) {
      throw new AppError(400, 'Name the rule, the text it looks for, and the account to post.')
    }
    return c.json(await createRule(user.companyId, {
      name: text(body.name),
      matchText: text(body.matchText),
      action: body.action,
      accountCode: text(body.accountCode),
    }), 201)
  })

  app.post('/api/bank/preview', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'read')
    const body = await c.req.json() as { csv?: string; ofx?: string; mapping?: ColumnMapping }
    const lines = body.ofx ? parseOfx(body.ofx) : parseMappedCsv(body.csv ?? '', body.mapping ?? { date: 'date', description: 'description', amount: 'amount', reference: 'reference' })
    return c.json({ lines: lines.map((line) => ({ ...line, lineDate: line.lineDate.toISOString() })) })
  })

  app.get('/api/bank/statements', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'read')
    return c.json(await listStatements(user.companyId))
  })

  app.post('/api/bank/statements', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'create')
    const body = await c.req.json() as { name?: string; csv?: string; ofx?: string; mapping?: ColumnMapping; bankAccountId?: number | null; openingBalance?: number }
    const name = text(body.name)
    if (!name || (!text(body.csv) && !text(body.ofx))) throw new AppError(400, 'Name the statement and paste the lines.')
    if (body.mapping || body.ofx || body.bankAccountId) {
      return c.json(await importMapped(user.companyId, name, body), 201)
    }
    return c.json(await importStatement(user.companyId, name, body.csv ?? ''), 201)
  })

  app.get('/api/bank/statements/:id', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'read')
    return c.json(await statementDetail(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/bank/lines/:id/reconcile', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'write')
    const body = await c.req.json() as { invoiceId?: number; amount?: number }
    if (!body.invoiceId || body.amount == null) throw new AppError(400, 'Choose an invoice and an amount.')
    return c.json(await reconcileLine(user.companyId, Number(c.req.param('id')), body.invoiceId, body.amount))
  })

  app.post('/api/bank/lines/:id/apply', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'write')
    const body = await c.req.json() as { kind?: 'invoice' | 'payment' | 'rule'; invoiceId?: number; amount?: number; action?: string; accountCode?: string }
    if (!body.kind) throw new AppError(400, 'Choose how to clear this line.')
    return c.json(await applyLine(user.companyId, Number(c.req.param('id')), { ...body, kind: body.kind }))
  })

  app.post('/api/bank/lines/:id/unreconcile', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'bank.statement', 'write')
    const body = await c.req.json() as { invoiceId?: number }
    if (!body.invoiceId) throw new AppError(400, 'Choose the invoice to release.')
    return c.json(await unreconcileLine(user.companyId, Number(c.req.param('id')), body.invoiceId))
  })

  app.get('/api/accounting/locks', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'account.move', 'read')
    return c.json(await getLockDates(user.companyId))
  })

  app.put('/api/accounting/locks', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const body = await c.req.json() as { lockDate?: string | null; taxLockDate?: string | null }
    return c.json(await setLockDates(user.companyId, body.lockDate ?? null, body.taxLockDate ?? null))
  })

  app.get('/api/stock/valuation', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'stock.valuation', 'read')
    return c.json(await listValuation(user.companyId))
  })

  app.get('/api/stock/routes', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'stock.transfer', 'read')
    return c.json(await prisma.stockRoute.findMany({ where: { companyId: user.companyId }, orderBy: { name: 'asc' } }))
  })

  app.patch('/api/stock/cost-method', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'stock.valuation', 'write')
    const body = await c.req.json() as { productId?: number; method?: string }
    if (!body.productId || !body.method) throw new AppError(400, 'Choose a product and a cost method.')
    return c.json(await setCostMethod(user.companyId, body.productId, body.method))
  })

  app.get('/api/stock/ledger', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'stock.valuation', 'read')
    const productId = Number(c.req.query('productId'))
    if (!Number.isInteger(productId) || productId <= 0) throw new AppError(400, 'Choose a product.')
    return c.json(await listStockLedger(user.companyId, productId))
  })

  app.post('/api/stock/count', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'stock.valuation', 'write')
    const body = await c.req.json() as { productId?: number; locationId?: number; counted?: number }
    if (!body.productId || !body.locationId || body.counted == null) throw new AppError(400, 'Count a product in a location.')
    return c.json(await countStock(user.companyId, body.productId, body.locationId, body.counted))
  })

  app.post('/api/stock/landed-cost', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'stock.valuation', 'write')
    const body = await c.req.json() as { productId?: number; amount?: number }
    if (!body.productId || body.amount == null) throw new AppError(400, 'Choose a product and an amount.')
    return c.json(await landedCost(user.companyId, body.productId, body.amount))
  })
}
