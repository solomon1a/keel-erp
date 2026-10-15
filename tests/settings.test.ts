import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords, seedDatabase } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'

let maya = ''
let jonah = ''

beforeAll(async () => {
  rmSync('prisma/test.db', { force: true })
  execSync('npx prisma db push --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  })
  await seedDatabase(prisma)
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('company settings and VAT', () => {
  it('seeds CNY and 13% and lets an admin change them', async () => {
    const settings = await call('/api/settings', maya)
    expect(settings.status).toBe(200)
    expect(settings.body?.currency).toBe('CNY')
    expect(settings.body?.defaultTaxRate).toBe(13)
    expect(settings.body?.name).toBe('江北良品')

    const blocked = await call('/api/settings', jonah, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Jonah Goods', currency: 'USD', defaultTaxRate: 6 }),
    })
    expect(blocked.status).toBe(403)

    const saved = await call('/api/settings', maya, {
      method: 'PATCH',
      body: JSON.stringify({ name: '江北良品', currency: 'CNY', defaultTaxRate: 9 }),
    })
    expect(saved.status).toBe(200)
    expect(saved.body?.defaultTaxRate).toBe(9)

    const tax = await prisma.tax.findFirstOrThrow({ where: { isDefault: true } })
    expect(tax.rate).toBe(9)
    expect(tax.name).toBe('增值税')

    const cedar = await prisma.contact.findFirstOrThrow({ where: { name: 'Cedar & Co' } })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01' } })
    const created = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: cedar.id,
        lines: [{ productId: notebook.id, quantity: 1, unitPrice: 100, discount: 0, taxId: tax.id }],
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body?.amountUntaxed).toBe(100)
    expect(created.body?.amountTax).toBe(9)
    expect(created.body?.amountTotal).toBe(109)
  })
})