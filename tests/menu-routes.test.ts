import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { deskScreens } from '../shared/desk-screens.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

const reads = [
  '/api/home?range=month',
  '/api/desk',
  '/api/orders?state=all',
  '/api/purchases?state=all',
  '/api/products',
  '/api/contacts?search=&kind=all&role=all',
  '/api/leads',
  '/api/invoices',
  '/api/manufacturing?state=all',
  '/api/boms',
  '/api/pos/sessions',
  '/api/pos/orders',
  '/api/payroll',
  '/api/payroll/salaries',
  '/api/expenses',
  '/api/employees',
  '/api/departments',
  '/api/stock',
  '/api/stock/moves',
  '/api/warehouses',
  '/api/transfers',
  '/api/settings',
  '/api/exchange-rates',
  '/api/reports/pack',
  '/api/reports/pnl',
  '/api/reports/balance',
  '/api/ledger',
  '/api/taxes',
  '/api/admin/users',
  '/api/assets',
  '/api/assets/categories',
  '/api/assets/bill-lines',
  '/api/subcontracting',
  '/api/subcontracting/stock',
  '/api/invites',
  '/api/access',
  '/api/demo-tour',
  '/api/campaigns',
  '/api/sites',
  '/api/mail/lists',
  '/api/shop/catalog',
  '/api/workspaces/sales',
  '/api/workspaces/manufacturing',
  '/api/bank/statements',
  '/api/stock/valuation',
  '/api/pricing/rules',
]

let maya = ''
let jonah = ''
let amira = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('every module route', () => {
  it('answers the admin reads without a server error', async () => {
    const slow: string[] = []
    for (const path of reads) {
      const started = Date.now()
      const response = await call(path, maya)
      const elapsed = Date.now() - started
      expect(response.status, path).toBe(200)
      if (elapsed > 1000) slow.push(`${path} ${elapsed}ms`)
    }
    expect(slow).toEqual([])
  })

  it('opens every desk screen for the admin', async () => {
    const seenSettings = new Set<string>()
    for (const screen of deskScreens) {
      if (screen.kind === 'settings') {
        if (seenSettings.has(screen.module)) continue
        seenSettings.add(screen.module)
        const response = await call(`/api/module-settings?module=${screen.module}`, maya)
        expect(response.status, screen.module).toBe(200)
        continue
      }
      if (screen.kind === 'accounts') {
        const response = await call('/api/accounts', maya)
        expect(response.status).toBe(200)
        continue
      }
      const response = await call(`/api/desk-records?module=${screen.module}&screen=${screen.screen}`, maya)
      expect(response.status, `${screen.module}/${screen.screen}`).toBe(200)
    }
  })

  it('lets an admin create and delete a desk record, and refuses the same delete to a user', async () => {
    const screen = deskScreens.find((row) => row.module === 'helpdesk' && row.screen === 'tickets' && row.kind === 'list')
    expect(screen).toBeTruthy()
    const name = `QA ticket ${Date.now()}`
    const created = await call('/api/desk-records', maya, {
      method: 'POST',
      body: JSON.stringify({
        module: 'helpdesk',
        screen: 'tickets',
        name,
        state: screen?.states[0] ?? 'open',
        partner: 'Cedar & Co',
        notes: 'QA pass',
      }),
    })
    expect(created.status).toBe(201)
    const id = created.body?.id
    const blocked = await call(`/api/desk-records/${id}`, jonah, { method: 'DELETE' })
    expect(blocked.status).toBe(403)
    const removed = await call(`/api/desk-records/${id}`, maya, { method: 'DELETE' })
    expect(removed.status).toBe(200)
    const gone = await prisma.deskRecord.findUnique({ where: { id: Number(id) } })
    expect(gone).toBeNull()
  })

  it('keeps company books and shop customers apart', async () => {
    const entries = await prisma.journalEntry.findMany({
      where: { company: { name: 'Jiangbei Goods Co.' } },
      include: { lines: { select: { debit: true, credit: true } } },
    })
    expect(entries.length).toBeGreaterThan(0)
    for (const entry of entries) {
      const debit = entry.lines.reduce((sum, line) => sum + line.debit, 0)
      const credit = entry.lines.reduce((sum, line) => sum + line.credit, 0)
      expect(Math.abs(debit - credit), entry.name).toBeLessThan(0.02)
    }

    const harbour = await call('/api/orders', amira)
    expect(harbour.status).toBe(200)
    const rows = harbour.body as unknown as Array<{ customer?: { name?: string } }>
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.some((row) => row.customer?.name === 'Cedar & Co')).toBe(false)

    const settings = await call('/api/settings', jonah, {
      method: 'PATCH',
      body: JSON.stringify({ name: 'Jonah Goods', currency: 'USD', defaultTaxRate: 6 }),
    })
    expect(settings.status).toBe(403)
    const users = await call('/api/admin/users', jonah)
    expect(users.status).toBe(403)
    const reset = await call('/api/demo-tour/reset', jonah, { method: 'POST' })
    expect(reset.status).toBe(403)

    const shop = await call('/api/shop/login', '', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@northline.example', password: demoPasswords.lin }),
    })
    expect(shop.status).toBe(200)
    const shopCookie = shop.setCookie?.split(';')[0] ?? ''
    const shopOrders = await call('/api/shop/orders', shopCookie)
    expect(shopOrders.status).toBe(200)
    const desk = await call('/api/session/me', shopCookie)
    expect(desk.status).toBe(401)
    const deskLogin = await call('/api/session/login', '', {
      method: 'POST',
      body: JSON.stringify({ email: 'lin@northline.example', password: demoPasswords.lin }),
    })
    expect(deskLogin.status).toBe(401)
  })
})
