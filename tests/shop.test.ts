import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

beforeAll(async () => {
  await resetAndSeed()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('shop', () => {
  it('lists published goods and checks out a guest order into sales', async () => {
    const catalog = await call('/api/shop/catalog', '')
    expect(catalog.status).toBe(200)
    const body = catalog.body as {
      warehouse: { code: string }
      products: Array<{ id: number; sku: string; onHand: number }>
    }
    expect(body.warehouse.code).toBe('SH')
    const skus = body.products.map((product) => product.sku).sort()
    expect(skus).toEqual(['BL-04', 'NB-01', 'TO-11'])
    const notebook = body.products.find((product) => product.sku === 'NB-01')
    expect(notebook?.onHand).toBe(35)

    const denied = await call('/api/shop/checkout', '', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Guest',
        email: 'guest@example.com',
        phone: '13900000000',
        street: '南京西路 1 号',
        city: '上海',
        paymentMethod: 'alipay',
        lines: [{ productId: notebook?.id, quantity: 100 }],
      }),
    })
    expect(denied.status).toBe(409)

    const placed = await call('/api/shop/checkout', '', {
      method: 'POST',
      body: JSON.stringify({
        name: '周宁',
        email: 'zhou@example.com',
        phone: '13900000000',
        street: '南京西路 1 号',
        city: '上海',
        paymentMethod: 'alipay',
        lines: [{ productId: notebook?.id, quantity: 2 }],
      }),
    })
    expect(placed.status).toBe(201)
    const order = placed.body as { name: string; publicToken: string; amountTotal: number; origin: string; paymentState: string }
    expect(order.name).toBe('SO0003')
    expect(order.origin).toBe('shop')
    expect(order.paymentState).toBe('recorded')
    expect(order.amountTotal).toBe(40.68)

    const quant = await prisma.stockQuant.findFirstOrThrow({
      where: { product: { sku: 'NB-01' }, location: { name: 'Main stock' } },
    })
    expect(quant.quantity).toBe(33)

    const maya = await signIn('maya@northline.example', demoPasswords.maya)
    const list = await call('/api/orders?state=done', maya)
    expect(list.status).toBe(200)
    const names = (list.body as unknown as Array<{ name: string }>).map((row) => row.name)
    expect(names).toContain('SO0003')
  })

  it('lets a shop account sign in and see the seeded order', async () => {
    const login = await call('/api/shop/login', '', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@northline.example', password: demoPasswords.lin }),
    })
    expect(login.status).toBe(200)
    const cookie = login.setCookie?.split(';')[0] ?? ''
    expect(cookie.startsWith('keel_shop=')).toBe(true)
    const orders = await call('/api/shop/orders', cookie)
    expect(orders.status).toBe(200)
    const rows = orders.body as unknown as Array<{ name: string; publicToken: string }>
    expect(rows.some((row) => row.name === 'SO0002' && row.publicToken === 'shop-demo-blanket')).toBe(true)
  })
})