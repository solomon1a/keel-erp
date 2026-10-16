import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { Prisma } from '@prisma/client'
import { parseRole } from '../shared/roles.ts'
import {
  changePasswordSchema,
  companySettingsSchema,
  contactInputSchema,
  createUserSchema,
  bomInputSchema,
  locationInputSchema,
  loginSchema,
  manufacturingInputSchema,
  orderInputSchema,
  posOrderSchema,
  posRefundSchema,
  posSessionCloseSchema,
  posSessionOpenSchema,
  produceSchema,
  productInputSchema,
  purchaseInputSchema,
  receivePurchaseSchema,
  reorderRuleSchema,
  resetPasswordSchema,
  stockAdjustSchema,
  transferInputSchema,
  warehouseInputSchema,
} from '../shared/schemas.ts'
import {
  type AppEnv,
  clearSessionCookie,
  closeSession,
  closeUserSessions,
  findUserByEmail,
  hashPassword,
  openSession,
  passwordMatches,
  readSessionToken,
  requireAdmin,
  userFromToken,
  writeSessionCookie,
} from './auth.ts'
import { prisma } from './db.ts'
import { roundMoney } from '../src/domain/money.ts'
import { registerAccountingRoutes } from './accounting-routes.ts'
import { registerCrmRoutes } from './crm-routes.ts'
import { registerHrRoutes } from './hr-routes.ts'
import { registerDeskRoutes } from './desk-routes.ts'
import { registerPayrollRoutes } from './payroll-routes.ts'
import { registerShopRoutes } from './shop-routes.ts'
import { registerSignupRoutes } from './signup-routes.ts'
import { profitAndLoss, vatReport } from './services/accounting.ts'
import {
  addLocation,
  cancelTransfer,
  completeTransfer,
  createTransfer,
  createWarehouse,
  listMoves,
  listReorderRules,
  listWarehouses,
  readyTransfer,
  renameLocation,
  saveReorderRule,
  stockLevels,
  updateTransfer,
  updateWarehouse,
} from './services/inventory.ts'
import { AppError } from './errors.ts'
import {
  closePosSession,
  createPosOrder,
  getPosOrder,
  getSession,
  listPosOrders,
  listSessions,
  openPosSession,
  posCatalog,
  posReport,
  refundPosOrder,
} from './services/pos.ts'
import { adjustStock, cancelOrder, confirmOrder, createOrder, deliverOrder, markOrderSent, updateOrder } from './services/orders.ts'
import {
  cancelPurchase,
  confirmPurchase,
  createPurchase,
  markPurchaseSent,
  receivePurchase,
  updatePurchase,
} from './services/purchases.ts'
import {
  applyBomCost,
  cancelManufacturing,
  confirmManufacturing,
  createBom,
  createManufacturing,
  deleteBom,
  getBom,
  getManufacturing,
  listBoms,
  produceManufacturing,
  startManufacturing,
  updateBom,
  updateManufacturing,
} from './services/manufacturing.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  }
  return parsed.data
}

const orderInclude = {
  customer: { select: { id: true, name: true, email: true, city: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, type: true } },
      tax: { select: { id: true, name: true, rate: true } },
    },
  },
  moves: {
    include: {
      product: { select: { name: true, sku: true } },
      locationFrom: { select: { name: true, type: true } },
      locationTo: { select: { name: true, type: true } },
    },
    orderBy: { id: 'asc' as const },
  },
}

function isPublicApi(method: string, path: string) {
  if (method === 'GET' && path === '/api/health') return true
  if (method === 'POST' && path === '/api/session/login') return true
  if (method === 'POST' && path === '/api/signup') return true
  return path === '/api/shop' || path.startsWith('/api/shop/')
}

export function createApp() {
  const app = new Hono<AppEnv>()

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json(
        error.details ? { error: error.message, details: error.details } : { error: error.message },
        error.status as 400,
      )
    }
    if (error instanceof HTTPException) {
      return c.json({ error: error.message }, error.status)
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return c.json({ error: 'That value is already in use.' }, 409)
    }
    console.error(error)
    return c.json({ error: 'Something went wrong while saving that.' }, 500)
  })

  app.use('/api/*', async (c, next) => {
    if (isPublicApi(c.req.method, c.req.path)) {
      await next()
      return
    }
    const user = await userFromToken(readSessionToken(c))
    if (!user) throw new AppError(401, 'Sign in to continue.')
    c.set('user', user)
    await next()
  })

  app.get('/api/health', (c) => c.json({ ok: true }))

  registerSignupRoutes(app)

  app.post('/api/session/login', async (c) => {
    const input = parseBody(loginSchema, await c.req.json())
    const account = await findUserByEmail(input.email)
    const matches = await passwordMatches(input.password, account?.passwordHash ?? null)
    if (!account || !matches) throw new AppError(401, 'Email or password is wrong.')
    const role = parseRole(account.role)
    if (!role) throw new AppError(500, 'This account has an unknown role.')
    const session = await openSession(account.id)
    writeSessionCookie(c, session.token, session.maxAge)
    return c.json({
      id: account.id,
      name: account.name,
      email: account.email,
      role,
      companyId: account.companyId,
      company: account.company,
    })
  })

  app.post('/api/session/logout', async (c) => {
    await closeSession(readSessionToken(c))
    clearSessionCookie(c)
    return c.body(null, 204)
  })

  app.get('/api/session/me', (c) => c.json(c.get('user')))

  app.post('/api/session/password', async (c) => {
    const user = c.get('user')
    const input = parseBody(changePasswordSchema, await c.req.json())
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
    const matches = await passwordMatches(input.currentPassword, account?.passwordHash ?? null)
    if (!account || !matches) throw new AppError(400, 'Current password is wrong.')
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword) },
    })
    await closeUserSessions(user.id)
    const session = await openSession(user.id)
    writeSessionCookie(c, session.token, session.maxAge)
    return c.json({ ok: true })
  })

  app.get('/api/admin/users', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const users = await prisma.user.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    })
    return c.json(users)
  })

  app.post('/api/admin/users', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const input = parseBody(createUserSchema, await c.req.json())
    try {
      const created = await prisma.user.create({
        data: {
          name: input.name,
          email: input.email,
          role: input.role,
          passwordHash: await hashPassword(input.password),
          companyId: user.companyId,
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      })
      return c.json(created, 201)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'That email is already used.')
      }
      throw error
    }
  })

  app.post('/api/admin/users/:id/password', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const id = Number(c.req.param('id'))
    const existing = await prisma.user.findFirst({ where: { id, companyId: user.companyId }, select: { id: true } })
    if (!existing) throw new AppError(404, 'That person is not on this desk.')
    const input = parseBody(resetPasswordSchema, await c.req.json())
    await prisma.user.update({ where: { id }, data: { passwordHash: await hashPassword(input.password) } })
    await closeUserSessions(id)
    if (id === user.id) {
      const session = await openSession(user.id)
      writeSessionCookie(c, session.token, session.maxAge)
    }
    return c.json({ ok: true })
  })

  app.get('/api/countries', async (c) => {
    return c.json(await prisma.country.findMany({ orderBy: { name: 'asc' } }))
  })

  app.get('/api/taxes', async (c) => {
    return c.json(await prisma.tax.findMany({ orderBy: { name: 'asc' } }))
  })

  app.get('/api/settings', (c) => {
    const user = c.get('user')
    return c.json({
      name: user.company.name,
      city: user.company.city,
      currency: user.company.currency,
      defaultTaxRate: user.company.defaultTaxRate,
    })
  })

  app.patch('/api/settings', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    const input = parseBody(companySettingsSchema, await c.req.json())
    const company = await prisma.company.update({
      where: { id: user.companyId },
      data: {
        name: input.name,
        currency: input.currency,
        defaultTaxRate: input.defaultTaxRate,
      },
      select: { name: true, city: true, currency: true, defaultTaxRate: true },
    })
    return c.json(company)
  })

  app.get('/api/desk', async (c) => {
    const user = c.get('user')
    const companyId = user.companyId
    const [contactCount, productCount, openOrders, recentOrders, products, pipeline, receivable, payable, shopOrders, staff, leaveWaiting, pnl, vat] = await Promise.all([
      prisma.contact.count({ where: { companyId } }),
      prisma.product.count({ where: { companyId, active: true } }),
      prisma.salesOrder.count({ where: { companyId, state: { in: ['draft', 'sent', 'sale'] } } }),
      prisma.salesOrder.findMany({
        where: { companyId },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: { customer: { select: { name: true } } },
      }),
      prisma.product.findMany({
        where: { companyId, type: 'product', active: true },
        include: { quants: { where: { location: { type: 'internal' } } } },
      }),
      prisma.lead.aggregate({
        where: { companyId, stage: { in: ['new', 'qualified', 'proposition'] } },
        _sum: { expectedRevenue: true },
        _count: { _all: true },
      }),
      prisma.invoice.aggregate({
        where: { companyId, moveType: 'out_invoice', state: 'posted' },
        _sum: { residual: true },
      }),
      prisma.invoice.aggregate({
        where: { companyId, moveType: 'in_invoice', state: 'posted' },
        _sum: { residual: true },
      }),
      prisma.salesOrder.count({ where: { companyId, origin: 'shop' } }),
      prisma.employee.count({ where: { companyId, active: true } }),
      prisma.leaveRequest.count({ where: { state: 'draft', employee: { companyId } } }),
      profitAndLoss(companyId),
      vatReport(companyId),
    ])
    const lowStock = products
      .map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        onHand: product.quants.reduce((sum, quant) => sum + quant.quantity, 0),
      }))
      .filter((product) => product.onHand < 5)
      .sort((a, b) => a.onHand - b.onHand)
    return c.json({
      contactCount,
      productCount,
      openOrders,
      recentOrders,
      lowStock,
      pipelineValue: roundMoney(pipeline._sum.expectedRevenue ?? 0),
      pipelineCount: pipeline._count._all,
      receivable: roundMoney(receivable._sum.residual ?? 0),
      payable: roundMoney(payable._sum.residual ?? 0),
      shopOrders,
      staff,
      leaveWaiting,
      profit: pnl.profit,
      vatPayable: vat.payable,
    })
  })

  app.get('/api/contacts', async (c) => {
    const user = c.get('user')
    const search = c.req.query('search')?.trim()
    const kind = c.req.query('kind')
    const role = c.req.query('role')
    const contacts = await prisma.contact.findMany({
      where: {
        companyId: user.companyId,
        ...(kind === 'company' ? { isCompany: true } : {}),
        ...(kind === 'person' ? { isCompany: false } : {}),
        ...(role === 'customer' ? { isCustomer: true } : {}),
        ...(role === 'supplier' ? { isSupplier: true } : {}),
        ...(role === 'employee' ? { isEmployee: true } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search } },
                { email: { contains: search } },
                { phone: { contains: search } },
                { city: { contains: search } },
              ],
            }
          : {}),
      },
      include: {
        parent: { select: { id: true, name: true } },
        country: { select: { id: true, name: true } },
        _count: { select: { children: true, orders: true } },
      },
      orderBy: { name: 'asc' },
      take: 500,
    })
    return c.json(contacts)
  })

  app.get('/api/contacts/:id', async (c) => {
    const user = c.get('user')
    const contact = await prisma.contact.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId },
      include: {
        parent: { select: { id: true, name: true } },
        country: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, email: true, phone: true }, orderBy: { name: 'asc' } },
        orders: { orderBy: { dateOrder: 'desc' }, take: 12 },
        purchaseOrders: { orderBy: { dateOrder: 'desc' }, take: 12 },
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
      },
    })
    if (!contact) throw new AppError(404, 'Contact not found.')
    return c.json(contact)
  })

  app.post('/api/contacts', async (c) => {
    const user = c.get('user')
    const input = parseBody(contactInputSchema, await c.req.json())
    await assertContactLinks(user.companyId, input.parentId, input.countryId, input.isCompany)
    const contact = await prisma.contact.create({
      data: {
        ...input,
        parentId: input.isCompany ? null : input.parentId,
        companyId: user.companyId,
        createdById: user.id,
        updatedById: user.id,
      },
    })
    return c.json(contact, 201)
  })

  app.patch('/api/contacts/:id', async (c) => {
    const user = c.get('user')
    const id = Number(c.req.param('id'))
    const existing = await prisma.contact.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) throw new AppError(404, 'Contact not found.')
    const input = parseBody(contactInputSchema, await c.req.json())
    if (input.parentId === id) throw new AppError(400, 'A contact cannot be their own company.')
    await assertContactLinks(user.companyId, input.parentId, input.countryId, input.isCompany)
    const contact = await prisma.contact.update({
      where: { id },
      data: {
        ...input,
        parentId: input.isCompany ? null : input.parentId,
        updatedById: user.id,
      },
    })
    return c.json(contact)
  })

  app.delete('/api/contacts/:id', async (c) => {
    const user = c.get('user')
    const id = Number(c.req.param('id'))
    const existing = await prisma.contact.findFirst({
      where: { id, companyId: user.companyId },
      include: { _count: { select: { children: true, orders: true, purchaseOrders: true } } },
    })
    if (!existing) throw new AppError(404, 'Contact not found.')
    if (existing._count.orders > 0 || existing._count.purchaseOrders > 0) {
      throw new AppError(409, 'This contact has orders, so the record stays.')
    }
    if (existing._count.children > 0) {
      throw new AppError(409, 'Move the people under this company before deleting it.')
    }
    await prisma.contact.delete({ where: { id } })
    return c.body(null, 204)
  })

  app.get('/api/products', async (c) => {
    const user = c.get('user')
    const products = await prisma.product.findMany({
      where: { companyId: user.companyId },
      include: { quants: { where: { location: { type: 'internal' } } } },
      orderBy: { name: 'asc' },
    })
    return c.json(
      products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        type: product.type,
        kind: product.kind,
        listPrice: product.listPrice,
        costPrice: product.costPrice,
        purchasable: product.purchasable,
        tracking: product.tracking,
        barcode: product.barcode,
        categoryId: product.categoryId,
        description: product.description,
        active: product.active,
        onHand: product.quants.reduce((sum, quant) => sum + quant.quantity, 0),
      })),
    )
  })

  app.get('/api/products/:id', async (c) => {
    const user = c.get('user')
    const product = await prisma.product.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId },
    })
    if (!product) throw new AppError(404, 'Product not found.')
    return c.json(product)
  })

  app.post('/api/products', async (c) => {
    const user = c.get('user')
    const input = parseBody(productInputSchema, await c.req.json())
    await assertCategory(user.companyId, input.categoryId)
    try {
      const product = await prisma.product.create({
        data: { ...productRecord(input), companyId: user.companyId },
      })
      return c.json(product, 201)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'That SKU is already used.')
      }
      throw error
    }
  })

  app.patch('/api/products/:id', async (c) => {
    const user = c.get('user')
    const id = Number(c.req.param('id'))
    const existing = await prisma.product.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) throw new AppError(404, 'Product not found.')
    const input = parseBody(productInputSchema, await c.req.json())
    await assertCategory(user.companyId, input.categoryId)
    try {
      const product = await prisma.product.update({
        where: { id },
        data: productRecord(input),
      })
      return c.json(product)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'That SKU is already used.')
      }
      throw error
    }
  })

  app.get('/api/orders', async (c) => {
    const user = c.get('user')
    const state = c.req.query('state')
    const orders = await prisma.salesOrder.findMany({
      where: {
        companyId: user.companyId,
        ...(state && state !== 'all' ? { state } : {}),
      },
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { dateOrder: 'desc' },
      take: 200,
    })
    return c.json(orders)
  })

  app.get('/api/orders/:id', async (c) => {
    const user = c.get('user')
    const order = await prisma.salesOrder.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId },
      include: orderInclude,
    })
    if (!order) throw new AppError(404, 'Order not found.')
    return c.json(order)
  })

  app.post('/api/orders', async (c) => {
    const user = c.get('user')
    const input = parseBody(orderInputSchema, await c.req.json())
    return c.json(await createOrder(user.companyId, user.id, input), 201)
  })

  app.put('/api/orders/:id', async (c) => {
    const user = c.get('user')
    const input = parseBody(orderInputSchema, await c.req.json())
    return c.json(await updateOrder(user.companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/orders/:id/send', async (c) => {
    const user = c.get('user')
    return c.json(await markOrderSent(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/orders/:id/confirm', async (c) => {
    const user = c.get('user')
    return c.json(await confirmOrder(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/orders/:id/deliver', async (c) => {
    const user = c.get('user')
    return c.json(await deliverOrder(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/orders/:id/cancel', async (c) => {
    const user = c.get('user')
    return c.json(await cancelOrder(user.companyId, Number(c.req.param('id'))))
  })

  app.get('/api/purchases', async (c) => {
    const user = c.get('user')
    const state = c.req.query('state')
    const orders = await prisma.purchaseOrder.findMany({
      where: {
        companyId: user.companyId,
        ...(state && state !== 'all' ? { state } : {}),
      },
      include: { vendor: { select: { id: true, name: true } } },
      orderBy: { dateOrder: 'desc' },
      take: 200,
    })
    return c.json(orders)
  })

  app.get('/api/purchases/:id', async (c) => {
    const user = c.get('user')
    const order = await prisma.purchaseOrder.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId },
      include: {
        vendor: { select: { id: true, name: true, email: true, city: true } },
        warehouse: { select: { id: true, name: true, code: true } },
        lines: {
          include: {
            product: { select: { id: true, name: true, sku: true, type: true, kind: true } },
            tax: { select: { id: true, name: true, rate: true } },
          },
        },
        moves: {
          include: {
            product: { select: { name: true, sku: true } },
            locationFrom: { select: { name: true, type: true } },
            locationTo: { select: { name: true, type: true } },
          },
          orderBy: { id: 'asc' },
        },
      },
    })
    if (!order) throw new AppError(404, 'Purchase order not found.')
    return c.json(order)
  })

  app.post('/api/purchases', async (c) => {
    const user = c.get('user')
    const input = parseBody(purchaseInputSchema, await c.req.json())
    return c.json(await createPurchase(user.companyId, user.id, input), 201)
  })

  app.put('/api/purchases/:id', async (c) => {
    const user = c.get('user')
    const input = parseBody(purchaseInputSchema, await c.req.json())
    return c.json(await updatePurchase(user.companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/purchases/:id/send', async (c) => {
    const user = c.get('user')
    return c.json(await markPurchaseSent(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/purchases/:id/confirm', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    return c.json(await confirmPurchase(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/purchases/:id/receive', async (c) => {
    const user = c.get('user')
    const input = parseBody(receivePurchaseSchema, await c.req.json())
    return c.json(await receivePurchase(user.companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/purchases/:id/cancel', async (c) => {
    const user = c.get('user')
    return c.json(await cancelPurchase(user.companyId, Number(c.req.param('id'))))
  })

  app.get('/api/boms', async (c) => {
    const user = c.get('user')
    return c.json(await listBoms(user.companyId))
  })

  app.get('/api/boms/:id', async (c) => {
    const user = c.get('user')
    return c.json(await getBom(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/boms', async (c) => {
    const user = c.get('user')
    const input = parseBody(bomInputSchema, await c.req.json())
    return c.json(await createBom(user.companyId, input), 201)
  })

  app.put('/api/boms/:id', async (c) => {
    const user = c.get('user')
    const input = parseBody(bomInputSchema, await c.req.json())
    return c.json(await updateBom(user.companyId, Number(c.req.param('id')), input))
  })

  app.delete('/api/boms/:id', async (c) => {
    const user = c.get('user')
    await deleteBom(user.companyId, Number(c.req.param('id')))
    return c.body(null, 204)
  })

  app.post('/api/boms/:id/cost', async (c) => {
    const user = c.get('user')
    return c.json(await applyBomCost(user.companyId, Number(c.req.param('id'))))
  })

  app.get('/api/manufacturing', async (c) => {
    const user = c.get('user')
    const state = c.req.query('state')
    const orders = await prisma.manufacturingOrder.findMany({
      where: {
        companyId: user.companyId,
        ...(state && state !== 'all' ? { state } : {}),
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return c.json(orders)
  })

  app.get('/api/manufacturing/:id', async (c) => {
    const user = c.get('user')
    return c.json(await getManufacturing(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/manufacturing', async (c) => {
    const user = c.get('user')
    const input = parseBody(manufacturingInputSchema, await c.req.json())
    return c.json(await createManufacturing(user.companyId, user.id, input), 201)
  })

  app.put('/api/manufacturing/:id', async (c) => {
    const user = c.get('user')
    const input = parseBody(manufacturingInputSchema, await c.req.json())
    return c.json(await updateManufacturing(user.companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/manufacturing/:id/confirm', async (c) => {
    const user = c.get('user')
    requireAdmin(user)
    return c.json(await confirmManufacturing(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/manufacturing/:id/start', async (c) => {
    const user = c.get('user')
    return c.json(await startManufacturing(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/manufacturing/:id/produce', async (c) => {
    const user = c.get('user')
    const input = parseBody(produceSchema, await c.req.json())
    return c.json(await produceManufacturing(user.companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/manufacturing/:id/cancel', async (c) => {
    const user = c.get('user')
    return c.json(await cancelManufacturing(user.companyId, Number(c.req.param('id'))))
  })

  app.get('/api/stock', async (c) => {
    const user = c.get('user')
    return c.json(await stockLevels(user.companyId))
  })

  app.get('/api/stock/moves', async (c) => {
    const user = c.get('user')
    const productId = Number(c.req.query('productId'))
    const locationId = Number(c.req.query('locationId'))
    return c.json(
      await listMoves(user.companyId, {
        productId: Number.isInteger(productId) && productId > 0 ? productId : undefined,
        locationId: Number.isInteger(locationId) && locationId > 0 ? locationId : undefined,
      }),
    )
  })

  app.get('/api/stock/replenish', async (c) => {
    const user = c.get('user')
    return c.json(await listReorderRules(user.companyId))
  })

  app.post('/api/stock/replenish', async (c) => {
    const user = c.get('user')
    const input = parseBody(reorderRuleSchema, await c.req.json())
    return c.json(await saveReorderRule(user.companyId, input), 201)
  })

  app.post('/api/stock/adjust', async (c) => {
    const user = c.get('user')
    const input = parseBody(stockAdjustSchema, await c.req.json())
    const move = await adjustStock(
      user.companyId,
      input.productId,
      input.quantityDelta,
      input.note,
      input.locationId,
      input.lotName,
    )
    return c.json(move, 201)
  })

  app.get('/api/warehouses', async (c) => {
    const user = c.get('user')
    return c.json(await listWarehouses(user.companyId))
  })

  app.post('/api/warehouses', async (c) => {
    const user = c.get('user')
    const input = parseBody(warehouseInputSchema, await c.req.json())
    return c.json(await createWarehouse(user.companyId, input), 201)
  })

  app.patch('/api/warehouses/:id', async (c) => {
    const user = c.get('user')
    const input = parseBody(warehouseInputSchema, await c.req.json())
    return c.json(await updateWarehouse(user.companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/warehouses/:id/locations', async (c) => {
    const user = c.get('user')
    const input = parseBody(locationInputSchema, await c.req.json())
    return c.json(await addLocation(user.companyId, Number(c.req.param('id')), input), 201)
  })

  app.patch('/api/locations/:id', async (c) => {
    const user = c.get('user')
    const input = parseBody(locationInputSchema, await c.req.json())
    return c.json(await renameLocation(user.companyId, Number(c.req.param('id')), input))
  })

  app.get('/api/transfers', async (c) => {
    const user = c.get('user')
    const state = c.req.query('state')
    const rows = await prisma.stockTransfer.findMany({
      where: { companyId: user.companyId, ...(state && state !== 'all' ? { state } : {}) },
      include: {
        locationFrom: { select: { name: true, warehouse: { select: { name: true } } } },
        locationTo: { select: { name: true, warehouse: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return c.json(rows)
  })

  app.get('/api/transfers/:id', async (c) => {
    const user = c.get('user')
    const row = await prisma.stockTransfer.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId },
      include: {
        locationFrom: { select: { id: true, name: true, type: true, warehouse: { select: { id: true, name: true } } } },
        locationTo: { select: { id: true, name: true, type: true, warehouse: { select: { id: true, name: true } } } },
        lines: { include: { product: { select: { id: true, name: true, sku: true, tracking: true } } } },
        moves: {
          include: {
            product: { select: { name: true, sku: true } },
            locationFrom: { select: { name: true, type: true } },
            locationTo: { select: { name: true, type: true } },
          },
        },
      },
    })
    if (!row) throw new AppError(404, 'Transfer not found.')
    return c.json(row)
  })

  app.post('/api/transfers', async (c) => {
    const user = c.get('user')
    const input = parseBody(transferInputSchema, await c.req.json())
    return c.json(await createTransfer(user.companyId, user.id, input), 201)
  })

  app.put('/api/transfers/:id', async (c) => {
    const user = c.get('user')
    const input = parseBody(transferInputSchema, await c.req.json())
    return c.json(await updateTransfer(user.companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/transfers/:id/ready', async (c) => {
    const user = c.get('user')
    return c.json(await readyTransfer(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/transfers/:id/done', async (c) => {
    const user = c.get('user')
    return c.json(await completeTransfer(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/transfers/:id/cancel', async (c) => {
    const user = c.get('user')
    return c.json(await cancelTransfer(user.companyId, Number(c.req.param('id'))))
  })

  app.get('/api/categories', async (c) => {
    const user = c.get('user')
    const rows = await prisma.productCategory.findMany({
      where: { companyId: user.companyId },
      orderBy: { name: 'asc' },
    })
    return c.json(rows)
  })

  app.get('/api/pos/sessions', async (c) => {
    const user = c.get('user')
    return c.json(await listSessions(user.companyId, c.req.query('state')))
  })

  app.post('/api/pos/sessions', async (c) => {
    const user = c.get('user')
    const input = parseBody(posSessionOpenSchema, await c.req.json())
    return c.json(await openPosSession(user.companyId, user.id, input), 201)
  })

  app.get('/api/pos/sessions/:id', async (c) => {
    const user = c.get('user')
    return c.json(await getSession(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/pos/sessions/:id/close', async (c) => {
    const user = c.get('user')
    const input = parseBody(posSessionCloseSchema, await c.req.json())
    return c.json(await closePosSession(user, Number(c.req.param('id')), input))
  })

  app.get('/api/pos/catalog', async (c) => {
    const user = c.get('user')
    const warehouseId = Number(c.req.query('warehouseId'))
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) throw new AppError(400, 'Choose a shop.')
    return c.json(await posCatalog(user.companyId, warehouseId))
  })

  app.get('/api/pos/orders', async (c) => {
    const user = c.get('user')
    const warehouseId = Number(c.req.query('warehouseId'))
    return c.json(await listPosOrders(user.companyId, Number.isInteger(warehouseId) && warehouseId > 0 ? warehouseId : undefined))
  })

  app.post('/api/pos/orders', async (c) => {
    const user = c.get('user')
    const input = parseBody(posOrderSchema, await c.req.json())
    return c.json(await createPosOrder(user.companyId, user.id, input), 201)
  })

  app.get('/api/pos/orders/:id', async (c) => {
    const user = c.get('user')
    return c.json(await getPosOrder(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/pos/orders/:id/refund', async (c) => {
    const user = c.get('user')
    const input = parseBody(posRefundSchema, await c.req.json())
    return c.json(await refundPosOrder(user, Number(c.req.param('id')), input))
  })

  app.get('/api/pos/report', async (c) => {
    const user = c.get('user')
    const warehouseId = Number(c.req.query('warehouseId'))
    if (!Number.isInteger(warehouseId) || warehouseId <= 0) throw new AppError(400, 'Choose a shop.')
    const date = c.req.query('date') || new Date().toISOString().slice(0, 10)
    return c.json(await posReport(user.companyId, warehouseId, date))
  })

  registerShopRoutes(app)
  registerAccountingRoutes(app)
  registerCrmRoutes(app)
  registerHrRoutes(app)
  registerPayrollRoutes(app)
  registerDeskRoutes(app)

  return app
}

function productRecord(input: {
  name: string
  sku: string
  type: 'product' | 'service'
  kind: 'finished' | 'raw'
  listPrice: number
  costPrice: number
  purchasable: boolean
  websitePublished: boolean
  tracking: 'none' | 'lot' | 'serial'
  description: string | null
  active: boolean
  barcode: string | null
  categoryId: number | null
}) {
  return {
    ...input,
    sku: input.sku.toUpperCase(),
    kind: input.type === 'service' ? 'finished' : input.kind,
    tracking: input.type === 'service' ? 'none' : input.tracking,
    barcode: input.type === 'service' ? null : input.barcode,
    categoryId: input.type === 'service' ? null : input.categoryId,
  }
}

async function assertCategory(companyId: number, categoryId: number | null) {
  if (!categoryId) return
  const category = await prisma.productCategory.findFirst({ where: { id: categoryId, companyId } })
  if (!category) throw new AppError(400, 'Choose a category.')
}

async function assertContactLinks(
  companyId: number,
  parentId: number | null,
  countryId: number | null,
  isCompany: boolean,
) {
  if (parentId && !isCompany) {
    const parent = await prisma.contact.findFirst({ where: { id: parentId, companyId } })
    if (!parent || !parent.isCompany) {
      throw new AppError(400, 'The parent company must be a company contact.')
    }
  }
  if (countryId) {
    const country = await prisma.country.findUnique({ where: { id: countryId } })
    if (!country) throw new AppError(400, 'Choose a country from the list.')
  }
}
