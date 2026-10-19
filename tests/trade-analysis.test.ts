import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { createApp } from '../server/app.ts'
import { prisma } from '../server/db.ts'
import { roundMoney } from '../src/domain/money.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''

type Row = { key: string; label: string; amount: number; documents: number }
type Report = { side: string; group: string; total: number; rows: Row[] }

const period = 'from=2026-01-01&to=2026-12-31'

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
}, 180000)

afterAll(async () => {
  await prisma.$disconnect()
})

function sums(report: Report) {
  return roundMoney(report.rows.reduce((sum, row) => sum + row.amount, 0))
}

describe('sales and purchase analysis', () => {
  it('groups posted invoices and bills without moving the books', async () => {
    const before = await call('/api/reports/pnl', maya)

    const customers = (await call(`/api/reports/sales?group=partner&${period}`, maya)).body as unknown as Report
    const cedar = customers.rows.find((row) => row.label === 'Cedar & Co')
    expect(cedar).toBeTruthy()
    expect(cedar!.amount).toBeGreaterThan(0)
    expect(cedar!.documents).toBeGreaterThan(0)
    expect(customers.total).toBe(sums(customers))
    expect(customers.total).toBeGreaterThan(0)

    const harbour = (await call(`/api/reports/sales?group=partner&${period}`, amira)).body as unknown as Report
    expect(harbour.rows.some((row) => row.label === 'Cedar & Co')).toBe(false)

    const products = (await call(`/api/reports/sales?group=product&${period}`, maya)).body as unknown as Report
    expect(products.rows.find((row) => row.label === 'Field notebook')?.amount).toBeGreaterThan(0)
    expect(products.total).toBe(sums(products))

    const people = (await call(`/api/reports/sales?group=user&${period}`, maya)).body as unknown as Report
    expect(people.rows.some((row) => row.label === 'Unassigned' && row.amount > 0)).toBe(true)
    expect(people.total).toBe(sums(people))

    const months = (await call(`/api/reports/sales?group=month&${period}`, maya)).body as unknown as Report
    expect(months.rows.find((row) => row.label === '2026-01')?.amount).toBeGreaterThan(0)
    expect(months.total).toBe(customers.total)

    const vendors = (await call(`/api/reports/purchases?group=partner&${period}`, maya)).body as unknown as Report
    const qingpu = vendors.rows.find((row) => row.label === 'Qingpu Yarn')
    const suhang = vendors.rows.find((row) => row.label === 'Suhang Weaving')
    expect(qingpu?.amount).toBeGreaterThan(0)
    expect(suhang?.amount).toBeGreaterThan(0)
    expect(vendors.total).toBe(sums(vendors))
    const harbourBills = (await call(`/api/reports/purchases?group=partner&${period}`, amira)).body as unknown as Report
    expect(harbourBills.rows.some((row) => row.label === 'Qingpu Yarn' || row.label === 'Suhang Weaving')).toBe(false)

    const refused = await call(`/api/reports/sales?group=region&${period}`, maya)
    expect(refused.status).toBe(400)
    const backwards = await call('/api/reports/sales?group=product&from=2026-12-31&to=2026-01-01', maya)
    expect(backwards.status).toBe(400)

    const csv = await createApp().request(`/api/reports/sales?group=partner&${period}&format=csv`, { headers: { cookie: maya } })
    expect(csv.headers.get('content-type')).toContain('text/csv')
    expect(await csv.text()).toContain('Cedar & Co')

    const after = await call('/api/reports/pnl', maya)
    expect(before.body).toMatchObject({ profit: jiangbeiBooks.profit })
    expect(after.body).toEqual(before.body)
  })
})
