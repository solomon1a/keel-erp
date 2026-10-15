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
  loginSchema,
  manufacturingInputSchema,
  orderInputSchema,
  produceSchema,
  productInputSchema,
  purchaseInputSchema,
  receivePurchaseSchema,
  resetPasswordSchema,
  stockAdjustSchema,
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
import { AppError } from './errors.ts'
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
  return (method === 'GET' && path === '/api/health') || (method === 'POST' && path === '/api/session/login')
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
    const current = await prisma.tax.findFirst({ where: { isDefault: true } })
    if (current) {
      await prisma.tax.update({ where: { id: current.id }, data: { rate: input.defaultTaxRate } })
    } else {
      await prisma.tax.create({ data: { name: '增值税', rate: input.defaultTaxRate, isDefault: true } })
    }
    return c.json(company)
  })

  app.get('/api/desk', async (c) => {
    const user = c.get('user')
    const [contactCount, productCount, openOrders, recentOrders, products] = await Promise.all([
      prisma.contact.count({ where: { companyId: user.companyId } }),
      prisma.product.count({ where: { companyId: user.companyId, active: true } }),
      prisma.salesOrder.count({ where: { companyId: user.companyId, state: { in: ['draft', 'sent', 'sale'] } } }),
      prisma.salesOrder.findMany({
        where: { companyId: user.companyId },
        orderBy: { updatedAt: 'desc' },
        take: 6,
        include: { customer: { select: { name: true } } },
      }),
      prisma.product.findMany({
        where: { companyId: user.companyId, type: 'product', active: true },
        include: { quants: { where: { location: { type: 'internal' } } } },
      }),
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
    return c.json({ contactCount, productCount, openOrders, recentOrders, lowStock })
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
    const [products, moves] = await Promise.all([
      prisma.product.findMany({
        where: { companyId: user.companyId, type: 'product' },
        include: { quants: { where: { location: { type: 'internal' } } } },
        orderBy: { name: 'asc' },
      }),
      prisma.stockMove.findMany({
        where: { product: { companyId: user.companyId } },
        include: {
          product: { select: { name: true, sku: true } },
          locationFrom: { select: { name: true, type: true } },
          locationTo: { select: { name: true, type: true } },
        },
        orderBy: { id: 'desc' },
        take: 20,
      }),
    ])
    return c.json({
      levels: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        active: product.active,
        onHand: product.quants.reduce((sum, quant) => sum + quant.quantity, 0),
      })),
      moves,
    })
  })

  app.post('/api/stock/adjust', async (c) => {
    const user = c.get('user')
    const input = parseBody(stockAdjustSchema, await c.req.json())
    const move = await adjustStock(user.companyId, input.productId, input.quantityDelta, input.note)
    return c.json(move, 201)
  })

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
  description: string | null
  active: boolean
}) {
  return {
    ...input,
    sku: input.sku.toUpperCase(),
    kind: input.type === 'service' ? 'finished' : input.kind,
  }
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
