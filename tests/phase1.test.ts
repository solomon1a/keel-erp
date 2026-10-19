import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { createApp } from '../server/app.ts'
import { prisma } from '../server/db.ts'
import { rowsToXlsx, xlsxToRows } from '../server/services/sheet.ts'
import { sampleScreens } from '../shared/desk-screens.ts'
import { isOverdue, scheduleInstalments } from '../shared/payment-terms.ts'
import { computeTaxes, type EngineTax } from '../shared/tax-engine.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let amira = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
})

afterAll(async () => {
  await prisma.$disconnect()
})

function tax(partial: Partial<EngineTax> & Pick<EngineTax, 'id' | 'kind' | 'amount'>): EngineTax {
  return {
    name: partial.name ?? partial.kind,
    priceInclude: false,
    compound: false,
    withholding: false,
    sequence: partial.id,
    ...partial,
  }
}

describe('phase 1 foundations', () => {
  it('labels sample desk screens as coming soon', () => {
    expect(sampleScreens().length).toBeGreaterThan(10)
    expect(sampleScreens().every((screen) => screen.kind === 'list' || screen.kind === 'report')).toBe(true)
    const source = readFileSync(new URL('../src/pages/desk-screen.tsx', import.meta.url), 'utf8')
    expect(source).toContain('phase.soon')
    expect(source).not.toContain('row.amount')
  })

  it('computes percent, fixed, included, compound, and withholding taxes', () => {
    const percent = computeTaxes(100, 1, [tax({ id: 1, kind: 'percent', amount: 13 })])
    expect(percent).toMatchObject({ net: 100, added: 13, withheld: 0, total: 113 })
    const fixed = computeTaxes(100, 2, [tax({ id: 2, kind: 'fixed', amount: 1 })])
    expect(fixed.added).toBe(2)
    const included = computeTaxes(113, 1, [tax({ id: 3, kind: 'percent', amount: 13, priceInclude: true })])
    expect(included.net).toBe(100)
    expect(included.added).toBe(13)
    const compound = computeTaxes(100, 1, [
      tax({ id: 1, kind: 'percent', amount: 13, sequence: 1 }),
      tax({ id: 4, kind: 'percent', amount: 2, compound: true, sequence: 2 }),
    ])
    expect(compound.added).toBe(15.26)
    const withheld = computeTaxes(100, 1, [
      tax({ id: 1, kind: 'percent', amount: 13, sequence: 1 }),
      tax({ id: 5, kind: 'percent', amount: 5, withholding: true, sequence: 2 }),
    ])
    expect(withheld).toMatchObject({ added: 13, withheld: 5, total: 108 })
  })

  it('splits payment terms and marks overdue balances', () => {
    const split = scheduleInstalments(100, new Date('2026-01-01T00:00:00.000Z'), [
      { sequence: 1, percent: 50, days: 0 },
      { sequence: 2, percent: 50, days: 30 },
    ])
    expect(split.map((row) => row.amount)).toEqual([50, 50])
    expect(split[1]?.dueDate.startsWith('2026-01-31')).toBe(true)
    expect(isOverdue(new Date('2020-01-01T00:00:00.000Z'), 10, new Date('2026-10-18T00:00:00.000Z'))).toBe(true)
    expect(isOverdue(new Date('2026-10-18T00:00:00.000Z'), 10, new Date('2026-10-18T12:00:00.000Z'))).toBe(false)
  })

  it('keeps company taxes, price lists, and terms inside Jiangbei', async () => {
    const taxes = await call('/api/taxes/company', maya)
    expect(taxes.status).toBe(200)
    const bundle = taxes.body as { taxes: Array<{ code: string; id: number }>; groups: Array<{ id: number; name: string }>; positions: Array<{ id: number; name: string }> }
    expect(bundle.taxes.map((row) => row.code)).toEqual(expect.arrayContaining(['VAT', 'STAMP', 'SUR', 'WHT']))
    const other = await call('/api/taxes/company', amira)
    expect((other.body as { taxes: unknown[] }).taxes).toEqual([])
    const standard = bundle.groups.find((group) => group.name === 'Standard')
    const surcharge = bundle.groups.find((group) => group.name === 'Standard plus surcharge')
    const position = bundle.positions.find((row) => row.name === 'Export')
    expect(standard && surcharge && position).toBeTruthy()
    const plain = await call('/api/taxes/preview', maya, {
      method: 'POST',
      body: JSON.stringify({ base: 100, quantity: 1, groupId: standard?.id }),
    })
    expect(plain.body).toMatchObject({ added: 13, total: 113 })
    const mapped = await call('/api/taxes/preview', maya, {
      method: 'POST',
      body: JSON.stringify({ base: 100, quantity: 1, groupId: standard?.id, positionId: position?.id }),
    })
    expect(mapped.body).toMatchObject({ added: 0, total: 100 })
    const stacked = await call('/api/taxes/preview', maya, {
      method: 'POST',
      body: JSON.stringify({ base: 100, quantity: 1, groupId: surcharge?.id }),
    })
    expect(stacked.body).toMatchObject({ added: 15.26 })
    const denied = await call('/api/taxes/preview', amira, {
      method: 'POST',
      body: JSON.stringify({ base: 100, quantity: 1, groupId: standard?.id }),
    })
    expect(denied.status).toBe(404)
    const report = await call('/api/taxes/report', maya)
    const vat = (report.body as unknown as Array<{ code: string; added: number; withheld: number }>).find((row) => row.code === 'VAT')
    expect(vat?.added).toBe(13)
    const terms = await call('/api/payment-terms', maya)
    expect((terms.body as unknown as Array<{ name: string }>).map((row) => row.name)).toEqual(expect.arrayContaining(['Immediate', 'Net 15', 'Net 30', 'Net 60', '50/50']))
    expect((await call('/api/payment-terms', amira)).body).toEqual([])
  })

  it('resolves customer and vendor price lists', async () => {
    const cedar = await prisma.contact.findFirstOrThrow({ where: { name: 'Cedar & Co', company: { name: 'Jiangbei Goods Co.' } } })
    const mill = await prisma.contact.findFirstOrThrow({ where: { name: 'Brightmill Supply', company: { name: 'Jiangbei Goods Co.' } } })
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01', companyId: cedar.companyId } })
    const yarn = await prisma.product.findFirstOrThrow({ where: { sku: 'RM-YN', companyId: cedar.companyId } })
    const sale = await call('/api/pricing/resolve', maya, {
      method: 'POST',
      body: JSON.stringify({ side: 'sales', productId: notebook.id, quantity: 12, customerId: cedar.id }),
    })
    expect(sale.body).toMatchObject({ unitPrice: 16, discount: 5, ruleName: 'Dozen notebooks' })
    const buy = await call('/api/pricing/resolve', maya, {
      method: 'POST',
      body: JSON.stringify({ side: 'purchase', productId: yarn.id, quantity: 10, vendorId: mill.id }),
    })
    expect(buy.body).toMatchObject({ unitPrice: 6 })
    expect(cedar.salePriceListId).toBeTruthy()
    expect(mill.purchasePriceListId).toBeTruthy()
  })

  it('imports with a preview error, then saves a valid contact and exports it', async () => {
    const bad = await call('/api/import/preview', maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'contacts', text: 'name,email\n,missing@example.com\n' }),
    })
    expect(bad.status).toBe(200)
    expect((bad.body as { errors: Array<{ message: string }> }).errors[0]?.message).toContain('Name')
    const preview = await call('/api/import/preview', maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'contacts', text: 'name,email,customer\nPhase Import,phase.import@example.com,yes\n' }),
    })
    expect((preview.body as { errors: unknown[] }).errors).toEqual([])
    const saved = await call('/api/import/commit', maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'contacts', rows: (preview.body as { rows: unknown[] }).rows }),
    })
    expect(saved.body).toMatchObject({ saved: 1 })
    const book = rowsToXlsx([['name', 'email'], ['Sheet Person', 'sheet@example.com']])
    expect(xlsxToRows(book)).toEqual([['name', 'email'], ['Sheet Person', 'sheet@example.com']])
    const fromSheet = await call('/api/import/preview', maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'contacts', name: 'people.xlsx', data: book.toString('base64') }),
    })
    expect((fromSheet.body as { rows: Array<{ name: string }> }).rows[0]?.name).toBe('Sheet Person')
    const app = createApp()
    const response = await app.request('/api/export/contacts?format=csv', { headers: { cookie: maya } })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('Phase Import')
    const sheet = await app.request('/api/export/contacts?format=xlsx', { headers: { cookie: maya } })
    const rows = xlsxToRows(Buffer.from(await sheet.arrayBuffer()))
    expect(rows[0]).toContain('name')
    expect(rows.some((row) => row.includes('Phase Import'))).toBe(true)
  })

  it('stores a file in the database and rejects one over the limit', async () => {
    const order = await prisma.salesOrder.findFirstOrThrow({ where: { company: { name: 'Jiangbei Goods Co.' }, customer: { email: { not: null } } } })
    const saved = await call('/api/files', maya, {
      method: 'POST',
      body: JSON.stringify({ model: 'sale.order', recordId: order.id, name: 'note.txt', mime: 'text/plain', data: Buffer.from('hello keel').toString('base64') }),
    })
    expect(saved.status).toBe(201)
    const fileId = (saved.body as { id: number }).id
    const download = await createApp().request(`/api/files/${fileId}`, { headers: { cookie: maya } })
    expect(await download.text()).toBe('hello keel')
    const huge = await call('/api/files', maya, {
      method: 'POST',
      body: JSON.stringify({ model: 'sale.order', recordId: order.id, name: 'big.bin', mime: 'application/octet-stream', data: Buffer.alloc(1_500_001, 1).toString('base64') }),
    })
    expect(huge.status).toBe(400)
    expect(await call(`/api/files/${fileId}`, maya, { method: 'DELETE' })).toMatchObject({ body: { ok: true } })
    const hidden = await call(`/api/files/${fileId}`, amira)
    expect(hidden.status).toBe(404)
  })

  it('mails a document as a simulated send and keeps the books still', async () => {
    const before = await call('/api/reports/pnl', maya)
    expect(before.body).toMatchObject({ profit: jiangbeiBooks.profit })
    const order = await prisma.salesOrder.findFirstOrThrow({
      where: { company: { name: 'Jiangbei Goods Co.' }, customer: { email: { not: null } } },
      include: { customer: true },
    })
    const sent = await call('/api/documents/email', maya, {
      method: 'POST',
      body: JSON.stringify({ model: 'sale.order', recordId: order.id, note: 'Please confirm.' }),
    })
    expect(sent.status).toBe(200)
    expect(sent.body).toMatchObject({ simulated: true, channel: 'simulate', to: order.customer.email })
    expect(String((sent.body as { link?: string }).link)).toContain('/print')
    const bill = await prisma.invoice.findFirst({ where: { companyId: order.companyId, moveType: 'in_invoice', partner: { email: { not: null } } } })
    if (bill) {
      const billed = await call('/api/documents/email', maya, {
        method: 'POST',
        body: JSON.stringify({ model: 'account.move', recordId: bill.id, note: 'Bill attached.' }),
      })
      expect(billed.body).toMatchObject({ simulated: true })
    }
    const log = await call(`/api/documents/email?model=sale.order&recordId=${order.id}`, maya)
    expect((log.body as unknown as unknown[]).length).toBeGreaterThan(0)
    const open = await prisma.invoice.findFirstOrThrow({
      where: { companyId: order.companyId, state: 'posted', residual: { gt: 1 }, dueDate: { lt: new Date('2026-10-01T00:00:00.000Z') } },
    })
    const terms = await call(`/api/invoices/${open.id}/terms`, maya)
    expect(terms.body).toMatchObject({ overdue: true })
    const recurringBefore = await prisma.recurringInvoice.count({ where: { companyId: order.companyId } })
    const invoicesBefore = await prisma.invoice.count({ where: { companyId: order.companyId } })
    expect((await call('/api/cron', maya)).status).toBe(503)
    process.env.CRON_SECRET = 'phase-cron-secret'
    expect((await call('/api/cron', maya)).status).toBe(401)
    const cron = await createApp().request('/api/cron', { headers: { authorization: 'Bearer phase-cron-secret' } })
    expect(cron.status).toBe(200)
    const job = await cron.json() as { reminders: number; recurring: number }
    expect(job.recurring).toBe(0)
    expect(job.reminders).toBeGreaterThan(0)
    delete process.env.CRON_SECRET
    expect(await prisma.invoice.count({ where: { companyId: order.companyId } })).toBe(invoicesBefore)
    expect(await prisma.recurringInvoice.count({ where: { companyId: order.companyId } })).toBe(recurringBefore)
    const after = await call('/api/reports/pnl', maya)
    expect(after.body).toMatchObject({ profit: jiangbeiBooks.profit })
  })

  it('edits price lists and payment terms without posting journals', async () => {
    const before = await call('/api/reports/pnl', maya)
    const created = await call('/api/price-lists', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Counter list', side: 'sales' }),
    })
    expect(created.status).toBe(201)
    const listId = (created.body as { id?: number }).id
    const notebook = await prisma.product.findFirstOrThrow({ where: { sku: 'NB-01', company: { name: 'Jiangbei Goods Co.' } } })
    const line = await call(`/api/price-lists/${listId}/items`, maya, {
      method: 'POST',
      body: JSON.stringify({ productId: notebook.id, minQty: 2, price: 15 }),
    })
    expect(line.status).toBe(201)
    const itemId = (line.body as { id?: number }).id
    const patched = await call(`/api/price-lists/${listId}/items/${itemId}`, maya, {
      method: 'PATCH',
      body: JSON.stringify({ minQty: 2, price: 14 }),
    })
    expect(patched.status).toBe(200)
    const lists = await call('/api/price-lists?side=sales', maya)
    const found = (lists.body as unknown as Array<{ name: string; items: Array<{ price: number }> }>).find((row) => row.name === 'Counter list')
    expect(found?.items[0]?.price).toBe(14)
    const hidden = await call('/api/price-lists', amira)
    expect((hidden.body as unknown as Array<{ name: string }>).some((row) => row.name === 'Counter list')).toBe(false)
    const term = await call('/api/payment-terms', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Net 45', lines: [{ percent: 100, days: 45 }] }),
    })
    expect(term.status).toBe(201)
    const broken = await call('/api/payment-terms', maya, {
      method: 'POST',
      body: JSON.stringify({ name: 'Broken term', lines: [{ percent: 40, days: 10 }] }),
    })
    expect(broken.status).toBe(400)
    const after = await call('/api/reports/pnl', maya)
    expect(after.body).toMatchObject(before.body as Record<string, unknown>)
  })
})
