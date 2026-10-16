import { afterAll, describe, expect, it } from 'vitest'
import { seedDatabase } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { resetAndSeed } from './reset-db.ts'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('English Jiangbei seed', () => {
  it('rewrites the Chinese company in place and drops stray companies', async () => {
    await resetAndSeed()
    const maya = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
    await prisma.company.update({
      where: { id: maya.companyId },
      data: { name: '江北良品', city: '上海' },
    })
    await prisma.warehouse.updateMany({
      where: { companyId: maya.companyId, code: 'SH' },
      data: { name: '上海仓' },
    })
    await prisma.tax.updateMany({ where: { name: 'China VAT 13%' }, data: { name: '增值税' } })
    await prisma.company.create({
      data: { name: 'Leftover Co', city: 'Nowhere', currency: 'EUR', defaultTaxRate: 0 },
    })

    await seedDatabase(prisma)

    const names = (await prisma.company.findMany({ orderBy: { name: 'asc' } })).map((company) => company.name)
    expect(names).toEqual(['Harbour & Line', 'Hudson Yard Goods', 'Jiangbei Goods Co.'])
    const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId: maya.companyId, code: 'SH' } })
    expect(warehouse.name).toBe('Shanghai Warehouse')
    const tax = await prisma.tax.findFirstOrThrow({ where: { isDefault: true } })
    expect(tax.name).toBe('China VAT 13%')
    expect(await prisma.company.count()).toBe(3)
  })
})