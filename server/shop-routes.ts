import type { Hono } from 'hono'
import { loginSchema, shopAccountSchema, shopCheckoutSchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  clearShopCookie,
  closeShopSession,
  loginShopAccount,
  readShopToken,
  registerShopAccount,
  shopAccountFromToken,
  writeShopCookie,
} from './shop-auth.ts'
import { checkoutShop, shopCatalog, shopOrderByToken, shopOrdersForCustomer, shopPrice, shopProduct } from './services/shop.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  }
  return parsed.data
}

export function registerShopRoutes(app: Hono<AppEnv>) {
  app.get('/api/shop/catalog', async (c) => c.json(await shopCatalog()))

  app.post('/api/shop/price', async (c) => {
    const body = await c.req.json() as { productId?: number; quantity?: number }
    const account = await shopAccountFromToken(readShopToken(c))
    return c.json(await shopPrice(Number(body.productId), Number(body.quantity), account?.id ?? null))
  })

  app.get('/api/shop/products/:id', async (c) => c.json(await shopProduct(Number(c.req.param('id')))))

  app.get('/api/shop/me', async (c) => {
    const account = await shopAccountFromToken(readShopToken(c))
    if (!account) throw new AppError(401, 'Sign in to continue.')
    return c.json(account)
  })

  app.post('/api/shop/register', async (c) => {
    const input = parseBody(shopAccountSchema, await c.req.json())
    const result = await registerShopAccount(input)
    writeShopCookie(c, result.token)
    return c.json(result.account, 201)
  })

  app.post('/api/shop/login', async (c) => {
    const input = parseBody(loginSchema, await c.req.json())
    const result = await loginShopAccount(input.email, input.password)
    writeShopCookie(c, result.token)
    return c.json(result.account)
  })

  app.post('/api/shop/logout', async (c) => {
    await closeShopSession(readShopToken(c))
    clearShopCookie(c)
    return c.body(null, 204)
  })

  app.post('/api/shop/checkout', async (c) => {
    const input = parseBody(shopCheckoutSchema, await c.req.json())
    const account = await shopAccountFromToken(readShopToken(c))
    const order = await checkoutShop(input, account?.id ?? null)
    return c.json(order, 201)
  })

  app.get('/api/shop/orders', async (c) => {
    const account = await shopAccountFromToken(readShopToken(c))
    if (!account) throw new AppError(401, 'Sign in to continue.')
    return c.json(await shopOrdersForCustomer(account.id))
  })

  app.get('/api/shop/orders/:token', async (c) => c.json(await shopOrderByToken(c.req.param('token'))))
}
