import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords, seedDatabase } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

beforeAll(async () => {
  await resetAndSeed()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('regional demos', () => {
  it('opens each company in its own currency and can seed again', async () => {
    const before = await prisma.company.count()
    expect(before).toBe(3)
    await seedDatabase(prisma)
    expect(await prisma.company.count()).toBe(3)

    const amira = await signIn('amira@harbourline.example', demoPasswords.amira)
    const uk = await call('/api/settings', amira)
    expect(uk.body).toMatchObject({ name: 'Harbour & Line', currency: 'GBP', defaultTaxRate: 20 })
    const ukOrders = await call('/api/orders', amira)
    const ukNames = (ukOrders.body as unknown as Array<{ name: string; amountTotal: number }>).map((order) => order.name)
    expect(ukNames).toContain('SO0002')
    const ukDesk = await call('/api/desk', amira)
    expect(ukDesk.body).toMatchObject({ staff: 10, shopOrders: 4, profit: -9188, vatPayable: 98.16 })

    const jordan = await signIn('jordan@hudsonyard.example', demoPasswords.jordan)
    const us = await call('/api/settings', jordan)
    expect(us.body).toMatchObject({ name: 'Hudson Yard Goods', currency: 'USD', defaultTaxRate: 8.875 })
    const usDesk = await call('/api/desk', jordan)
    expect(usDesk.body).toMatchObject({ receivable: 346.24, profit: -15242, vatPayable: 35.41 })

    const maya = await signIn('maya@northline.example', demoPasswords.maya)
    const china = await call('/api/settings', maya)
    expect(china.body).toMatchObject({ name: 'Jiangbei Goods Co.', currency: 'CNY' })
    const catalog = await call('/api/shop/catalog', '')
    expect(catalog.body).toMatchObject({ company: { name: 'Jiangbei Goods Co.', currency: 'CNY' } })
  })
})