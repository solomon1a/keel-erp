import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { Prisma } from '@prisma/client'
import {
  contactInputSchema,
  orderInputSchema,
  productInputSchema,
  stockAdjustSchema,
} from '../shared/schemas.ts'
import { prisma } from './db.ts'
import { AppError } from './errors.ts'
import { adjustStock, cancelOrder, confirmOrder, createOrder, deliverOrder, markOrderSent, updateOrder } from './services/orders.ts'

type SessionUser = {
  id: number
  name: string
  email: string
  role: string
  companyId: number
  company: { id: number; name: string; city: string }
}

async function currentUser(header: string | undefined): Promise<SessionUser> {
  const id = Number(header)
  if (!Number.isInteger(id) || id <= 0) {
    throw new AppError(401, 'Pick who is working before changing records.')
  }
  const user = await prisma.user.findUnique({
    where: { id },
    include: { company: { select: { id: true, name: true, city: true } } },
  })
  if (!user) throw new AppError(401, 'That person is not on the desk list.')
  return user
}

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
      locationFrom: { select: { name: true } },
      locationTo: { select: { name: true } },
    },
    orderBy: { id: 'asc' as const },
  },
}

export function createApp() {
  const app = new Hono()

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json({ error: error.message }, error.status as 400)
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

  app.get('/api/health', (c) => c.json({ ok: true }))

  app.get('/api/session/users', async (c) => {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      include: { company: { select: { id: true, name: true, city: true } } },
    })
    return c.json(users)
  })

  app.get('/api/session/me', async (c) => {
    return c.json(await currentUser(c.req.header('x-user-id')))
  })

  app.get('/api/countries', async (c) => {
    await currentUser(c.req.header('x-user-id'))
    const countries = await prisma.country.findMany({ orderBy: { name: 'asc' } })
    return c.json(countries)
  })

  app.get('/api/taxes', async (c) => {
    await currentUser(c.req.header('x-user-id'))
    return c.json(await prisma.tax.findMany({ orderBy: { name: 'asc' } }))
  })

  app.get('/api/desk', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
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
    const user = await currentUser(c.req.header('x-user-id'))
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
    const user = await currentUser(c.req.header('x-user-id'))
    const contact = await prisma.contact.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId },
      include: {
        parent: { select: { id: true, name: true } },
        country: { select: { id: true, name: true } },
        children: { select: { id: true, name: true, email: true, phone: true }, orderBy: { name: 'asc' } },
        orders: { orderBy: { dateOrder: 'desc' }, take: 12 },
        createdBy: { select: { name: true } },
        updatedBy: { select: { name: true } },
      },
    })
    if (!contact) throw new AppError(404, 'Contact not found.')
    return c.json(contact)
  })

  app.post('/api/contacts', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
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
    const user = await currentUser(c.req.header('x-user-id'))
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
    const user = await currentUser(c.req.header('x-user-id'))
    const id = Number(c.req.param('id'))
    const existing = await prisma.contact.findFirst({
      where: { id, companyId: user.companyId },
      include: { _count: { select: { children: true, orders: true } } },
    })
    if (!existing) throw new AppError(404, 'Contact not found.')
    if (existing._count.orders > 0) {
      throw new AppError(409, 'This contact has orders, so the record stays.')
    }
    if (existing._count.children > 0) {
      throw new AppError(409, 'Move the people under this company before deleting it.')
    }
    await prisma.contact.delete({ where: { id } })
    return c.body(null, 204)
  })

  app.get('/api/products', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
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
        listPrice: product.listPrice,
        description: product.description,
        active: product.active,
        onHand: product.quants.reduce((sum, quant) => sum + quant.quantity, 0),
      })),
    )
  })

  app.get('/api/products/:id', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
    const product = await prisma.product.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId },
    })
    if (!product) throw new AppError(404, 'Product not found.')
    return c.json(product)
  })

  app.post('/api/products', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
    const input = parseBody(productInputSchema, await c.req.json())
    try {
      const product = await prisma.product.create({
        data: { ...input, sku: input.sku.toUpperCase(), companyId: user.companyId },
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
    const user = await currentUser(c.req.header('x-user-id'))
    const id = Number(c.req.param('id'))
    const existing = await prisma.product.findFirst({ where: { id, companyId: user.companyId } })
    if (!existing) throw new AppError(404, 'Product not found.')
    const input = parseBody(productInputSchema, await c.req.json())
    try {
      const product = await prisma.product.update({
        where: { id },
        data: { ...input, sku: input.sku.toUpperCase() },
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
    const user = await currentUser(c.req.header('x-user-id'))
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
    const user = await currentUser(c.req.header('x-user-id'))
    const order = await prisma.salesOrder.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId },
      include: orderInclude,
    })
    if (!order) throw new AppError(404, 'Order not found.')
    return c.json(order)
  })

  app.post('/api/orders', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
    const input = parseBody(orderInputSchema, await c.req.json())
    return c.json(await createOrder(user.companyId, user.id, input), 201)
  })

  app.put('/api/orders/:id', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
    const input = parseBody(orderInputSchema, await c.req.json())
    return c.json(await updateOrder(user.companyId, Number(c.req.param('id')), input))
  })

  app.post('/api/orders/:id/send', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
    return c.json(await markOrderSent(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/orders/:id/confirm', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
    return c.json(await confirmOrder(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/orders/:id/deliver', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
    return c.json(await deliverOrder(user.companyId, Number(c.req.param('id'))))
  })

  app.post('/api/orders/:id/cancel', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
    return c.json(await cancelOrder(user.companyId, Number(c.req.param('id'))))
  })

  app.get('/api/stock', async (c) => {
    const user = await currentUser(c.req.header('x-user-id'))
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
          locationFrom: { select: { name: true } },
          locationTo: { select: { name: true } },
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
    const user = await currentUser(c.req.header('x-user-id'))
    const input = parseBody(stockAdjustSchema, await c.req.json())
    const move = await adjustStock(user.companyId, input.productId, input.quantityDelta, input.note)
    return c.json(move, 201)
  })

  return app
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
