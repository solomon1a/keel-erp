import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { computeTaxes } from '../shared/tax-engine.ts'
import { roundMoney } from '../src/domain/money.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let jonah = ''
let companyId = 0

const defaults: Array<[string, string, string]> = [
  ['dashboard', 'currency', 'yes'],
  ['dashboard', 'range', 'This month'],
  ['sales', 'validity', '30'],
  ['sales', 'team', 'Direct'],
  ['sales', 'online', 'off'],
  ['crm', 'alias', 'leads@northline.example'],
  ['crm', 'assign', 'Direct'],
  ['purchase', 'receipt', 'yes'],
  ['purchase', 'terms', '30 days'],
  ['inventory', 'multi', 'yes'],
  ['inventory', 'online', 'Online'],
  ['manufacturing', 'lock', 'yes'],
  ['manufacturing', 'center', 'Cutting table'],
  ['pos', 'shop', 'Shop'],
  ['pos', 'cash', 'yes'],
  ['website', 'published', 'yes'],
  ['website', 'warehouse', 'Online'],
  ['accounting', 'receivable', '1122'],
  ['accounting', 'payable', '2202'],
  ['accounting', 'tax', 'Not submitted'],
  ['contacts', 'unique', 'yes'],
  ['hr', 'week', 'Mon–Fri'],
  ['hr', 'leave', 'waiting'],
  ['payroll', 'journal', 'GEN'],
  ['payroll', 'country', 'Company country'],
  ['expenses', 'approver', 'Admin'],
  ['expenses', 'journal', 'BNK'],
  ['assets', 'method', 'Straight line'],
  ['assets', 'journal', 'GEN'],
  ['projects', 'billing', 'Milestones'],
  ['projects', 'hours', 'Hours'],
  ['quality', 'block', 'yes'],
  ['quality', 'team', 'Shop floor'],
  ['subcontracting', 'location', 'Stock'],
  ['subcontracting', 'resupply', 'yes'],
  ['helpdesk', 'team', 'Desk'],
  ['helpdesk', 'hours', '09:00–18:00'],
  ['attendance', 'grace', '10'],
  ['attendance', 'overtime', 'Yes'],
  ['wastage', 'approver', 'August'],
  ['wastage', 'limit', '500'],
]

function expectStatus(response: { status: number; body: unknown }, status: number) {
  expect(response.status, JSON.stringify(response.body)).toBe(status)
}

async function putSetting(module: string, values: Array<{ key: string; value: string }>) {
  const saved = await call('/api/module-settings', maya, {
    method: 'PUT',
    body: JSON.stringify({ module, values }),
  })
  expectStatus(saved, 200)
}

async function setSetting(module: string, key: string, value: string) {
  await putSetting(module, [{ key, value }])
}

async function restoreDefaults() {
  const byModule = new Map<string, Array<{ key: string; value: string }>>()
  for (const [module, key, value] of defaults) {
    const rows = byModule.get(module) ?? []
    rows.push({ key, value })
    byModule.set(module, rows)
  }
  for (const [module, values] of byModule) await putSetting(module, values)
}

function previewOf(body: unknown, document: string) {
  const rows = body as Array<{ document: string; preview: string }>
  return rows.find((row) => row.document === document)?.preview
}

async function journalLines(where: { invoiceId?: number; label?: string }) {
  const items = await prisma.journalItem.findMany({
    where: {
      ...(where.label ? { label: where.label } : {}),
      ...(where.invoiceId ? { entry: { invoiceId: where.invoiceId } } : {}),
    },
    include: { account: true },
  })
  return items.map((item) => ({ code: item.account.code, debit: item.debit, credit: item.credit }))
}

function side(lines: Array<{ code: string; debit: number; credit: number }>, code: string) {
  const rows = lines.filter((line) => line.code === code)
  return {
    debit: roundMoney(rows.reduce((sum, line) => sum + line.debit, 0)),
    credit: roundMoney(rows.reduce((sum, line) => sum + line.credit, 0)),
  }
}

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
  companyId = (await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })).companyId
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('ERPNext parity part 1', () => {
  it('keeps the seeded numbers and then uses a saved prefix', async () => {
    const listed = await call('/api/number-series', maya)
    expectStatus(listed, 200)
    expect(previewOf(listed.body, 'sales.order')).toBe('SO0003')
    expect(previewOf(listed.body, 'purchase.order')).toBe('PO0002')
    expect(previewOf(listed.body, 'manufacturing.order')).toBe('MO0002')
    expect(previewOf(listed.body, 'helpdesk.ticket')).toBe('HD0013')
    expect(previewOf(listed.body, 'account.out_refund')).toBe('CN0001')

    const cedar = await prisma.contact.findFirstOrThrow({ where: { companyId, email: 'hello@cedar.example' } })
    const service = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'SV-02' } })
    const yarn = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'RM-YN' } })
    const tote = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'TO-11' } })
    const vendor = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Brightmill Supply' } })

    const order = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: cedar.id,
        validityDate: '2026-12-01',
        lines: [{ productId: service.id, quantity: 1, unitPrice: 10, discount: 0, taxId: null }],
      }),
    })
    expectStatus(order, 201)
    expect(order.body?.name).toBe('SO0003')

    const purchase = await call('/api/purchases', maya, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: vendor.id,
        lines: [{ productId: yarn.id, quantity: 1, unitCost: 10, taxId: null }],
      }),
    })
    expectStatus(purchase, 201)
    expect(purchase.body?.name).toBe('PO0002')

    const made = await call('/api/manufacturing', maya, {
      method: 'POST',
      body: JSON.stringify({ productId: tote.id, quantity: 2 }),
    })
    expectStatus(made, 201)
    expect(made.body?.name).toBe('MO0002')

    const ticket = await call('/api/helpdesk', maya, {
      method: 'POST',
      body: JSON.stringify({ partnerId: cedar.id, subject: 'Parity ticket', description: 'Number check.' }),
    })
    expectStatus(ticket, 201)
    expect(ticket.body?.number).toBe('HD0013')

    const renamed = await call('/api/number-series', maya, {
      method: 'PUT',
      body: JSON.stringify({ document: 'sales.order', prefix: 'Q', padding: 4, next: 3 }),
    })
    expectStatus(renamed, 200)
    expect(previewOf(renamed.body, 'sales.order')).toBe('Q0004')
    const quoted = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: cedar.id,
        validityDate: '2026-12-01',
        lines: [{ productId: service.id, quantity: 1, unitPrice: 10, discount: 0, taxId: null }],
      }),
    })
    expectStatus(quoted, 201)
    expect(quoted.body?.name).toBe('Q0004')
    const restored = await call('/api/number-series', maya, {
      method: 'PUT',
      body: JSON.stringify({ document: 'sales.order', prefix: 'SO', padding: 4, next: 4 }),
    })
    expectStatus(restored, 200)
    expect(previewOf(restored.body, 'sales.order')).toBe('SO0005')
    expect(previewOf(restored.body, 'account.out_refund')).toBe('CN0001')
  }, 60_000)

  it('changes dashboard, sales, crm, purchase, and inventory settings', async () => {
    try {
      await setSetting('dashboard', 'currency', 'no')
      const hidden = await call('/api/home?range=month', maya)
      expectStatus(hidden, 200)
      expect(hidden.body?.showCurrency).toBe(false)
      await setSetting('dashboard', 'currency', 'yes')
      await setSetting('dashboard', 'range', 'This year')
      const year = await call('/api/home', maya)
      expectStatus(year, 200)
      expect(year.body?.range).toBe('year')
      expect(year.body?.showCurrency).toBe(true)

      const mayaUser = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
      const avery = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Avery Lang' } })
      const service = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'SV-02' } })
      await setSetting('sales', 'validity', '45')
      await setSetting('sales', 'team', 'August')
      await setSetting('sales', 'online', 'on')
      const owned = await call('/api/orders', jonah, {
        method: 'POST',
        body: JSON.stringify({
          customerId: avery.id,
          lines: [{ productId: service.id, quantity: 1, unitPrice: 20, discount: 0, taxId: null }],
        }),
      })
      expectStatus(owned, 201)
      expect(owned.body?.createdById).toBe(mayaUser.id)
      expect(owned.body?.onlinePay).toBe(true)
      const today = new Date()
      const validity = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 45))
      expect(new Date(String(owned.body?.validityDate)).toISOString()).toBe(validity.toISOString())
      await setSetting('sales', 'online', 'off')
      const plain = await call('/api/orders', jonah, {
        method: 'POST',
        body: JSON.stringify({
          customerId: avery.id,
          validityDate: '2026-12-02',
          lines: [{ productId: service.id, quantity: 1, unitPrice: 20, discount: 0, taxId: null }],
        }),
      })
      expectStatus(plain, 201)
      expect(plain.body?.onlinePay).toBe(false)

      await setSetting('crm', 'alias', 'desk@jiangbei.example')
      await setSetting('crm', 'assign', 'August')
      const site = await call('/api/site/jiangbei', '')
      expectStatus(site, 200)
      expect((site.body?.company as { leadAlias?: string } | undefined)?.leadAlias).toBe('desk@jiangbei.example')
      const lead = await call('/api/leads', jonah, {
        method: 'POST',
        body: JSON.stringify({ name: 'Parity lead', contactName: 'Parity Person', expectedRevenue: 0 }),
      })
      expectStatus(lead, 201)
      expect(lead.body?.userId).toBe(mayaUser.id)

      const vendor = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Brightmill Supply' } })
      const canvas = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'RM-CV' } })
      const drafted = await call('/api/purchases', maya, {
        method: 'POST',
        body: JSON.stringify({
          vendorId: vendor.id,
          lines: [{ productId: canvas.id, quantity: 1, unitCost: 12, taxId: null }],
        }),
      })
      expectStatus(drafted, 201)
      const purchaseId = drafted.body?.id as number
      expectStatus(await call(`/api/purchases/${purchaseId}/confirm`, maya, { method: 'POST' }), 200)
      const blockedBill = await call(`/api/invoices/from/purchase/${purchaseId}`, maya, { method: 'POST' })
      expectStatus(blockedBill, 409)
      await setSetting('purchase', 'receipt', 'no')
      await setSetting('purchase', 'terms', 'Net 15')
      const billed = await call(`/api/invoices/from/purchase/${purchaseId}`, maya, { method: 'POST' })
      expectStatus(billed, 201)
      const term = await prisma.paymentTerm.findFirstOrThrow({ where: { companyId, name: 'Net 15' } })
      const stored = await prisma.invoice.findUniqueOrThrow({ where: { id: billed.body?.id as number } })
      expect(stored.paymentTermId).toBe(term.id)

      const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { companyId, code: 'SH' } })
      await setSetting('inventory', 'multi', 'no')
      const refused = await call(`/api/warehouses/${warehouse.id}/locations`, maya, {
        method: 'POST',
        body: JSON.stringify({ name: 'Parity shelf' }),
      })
      expectStatus(refused, 409)
      await setSetting('inventory', 'multi', 'yes')
      expectStatus(await call(`/api/warehouses/${warehouse.id}/locations`, maya, {
        method: 'POST',
        body: JSON.stringify({ name: 'Parity shelf' }),
      }), 201)
      await setSetting('inventory', 'online', 'SH')
      const catalog = await call('/api/shop/catalog', '')
      expectStatus(catalog, 200)
      expect((catalog.body?.warehouse as { code?: string } | undefined)?.code).toBe('SH')
      await setSetting('website', 'published', 'no')
      const closed = await call('/api/shop/catalog', '')
      expect(closed.body?.products).toEqual([])
      const unpublished = await call('/api/site/jiangbei', '')
      expect(unpublished.body?.products).toEqual([])
    } finally {
      await restoreDefaults()
    }
  }, 60_000)

  it('changes manufacturing, register, accounting, contacts, and leave settings', async () => {
    try {
      const tote = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'TO-11' } })
      const draft = await prisma.manufacturingOrder.findFirstOrThrow({ where: { companyId, name: 'MO0002' } })
      await prisma.manufacturingOrder.update({ where: { id: draft.id }, data: { state: 'confirmed' } })
      const locked = await call(`/api/manufacturing/${draft.id}`, maya, {
        method: 'PUT',
        body: JSON.stringify({ productId: tote.id, quantity: 2 }),
      })
      expectStatus(locked, 409)
      await setSetting('manufacturing', 'lock', 'no')
      expectStatus(await call(`/api/manufacturing/${draft.id}`, maya, {
        method: 'PUT',
        body: JSON.stringify({ productId: tote.id, quantity: 2 }),
      }), 200)
      await prisma.manufacturingOrder.update({ where: { id: draft.id }, data: { state: 'draft' } })
      await setSetting('manufacturing', 'lock', 'yes')
      const canvas = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'RM-CV' } })
      const yarn = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'RM-YN' } })
      expectStatus(await call('/api/stock/adjust', maya, {
        method: 'POST',
        body: JSON.stringify({ productId: canvas.id, quantityDelta: 10, note: 'Parity canvas' }),
      }), 201)
      expectStatus(await call('/api/stock/adjust', maya, {
        method: 'POST',
        body: JSON.stringify({ productId: yarn.id, quantityDelta: 5, note: 'Parity yarn', lotName: 'YN-PARITY' }),
      }), 201)
      await setSetting('manufacturing', 'center', 'Missing Bench')
      const missing = await call(`/api/manufacturing/${draft.id}/confirm`, maya, { method: 'POST' })
      expectStatus(missing, 400)
      expect(String(missing.body?.error)).toContain('Missing Bench')

      const shanghai = await prisma.warehouse.findFirstOrThrow({ where: { companyId, code: 'SH' } })
      await setSetting('pos', 'shop', 'NO-SHOP')
      const wrongShop = await call('/api/pos/sessions', jonah, {
        method: 'POST',
        body: JSON.stringify({ warehouseId: shanghai.id, openingCash: 0 }),
      })
      expectStatus(wrongShop, 400)
      await setSetting('pos', 'shop', 'Shop')
      const opened = await call('/api/pos/sessions', jonah, {
        method: 'POST',
        body: JSON.stringify({ warehouseId: shanghai.id, openingCash: 0 }),
      })
      expectStatus(opened, 201)
      const sessionId = opened.body?.id as number
      const short = await call(`/api/pos/sessions/${sessionId}/close`, jonah, {
        method: 'POST',
        body: JSON.stringify({ closingCash: 5, note: 'Short drawer' }),
      })
      expectStatus(short, 403)
      await setSetting('pos', 'cash', 'no')
      const closed = await call(`/api/pos/sessions/${sessionId}/close`, jonah, {
        method: 'POST',
        body: JSON.stringify({ closingCash: 5, note: 'Short drawer' }),
      })
      expectStatus(closed, 200)
      expect(closed.body?.difference).toBe(5)

      const avery = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Avery Lang' } })
      const service = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'SV-02' } })
      const zero = await call('/api/orders', maya, {
        method: 'POST',
        body: JSON.stringify({
          customerId: avery.id,
          validityDate: '2026-12-03',
          lines: [{ productId: service.id, quantity: 1, unitPrice: 40, discount: 0, taxId: null }],
        }),
      })
      expectStatus(zero, 201)
      const zeroId = zero.body?.id as number
      expectStatus(await call(`/api/orders/${zeroId}/confirm`, maya, { method: 'POST' }), 200)
      expectStatus(await call(`/api/orders/${zeroId}/deliver`, maya, { method: 'POST' }), 200)
      const zeroInvoice = await call(`/api/invoices/from/sales/${zeroId}`, maya, { method: 'POST' })
      expectStatus(zeroInvoice, 201)
      await setSetting('accounting', 'receivable', '9999')
      const missingAccount = await call(`/api/invoices/${zeroInvoice.body?.id}/post`, maya, { method: 'POST' })
      expectStatus(missingAccount, 400)
      await setSetting('accounting', 'receivable', '1122')
      expectStatus(await call(`/api/invoices/${zeroInvoice.body?.id}/post`, maya, { method: 'POST' }), 200)

      const standard = await prisma.taxGroup.findFirstOrThrow({ where: { companyId, name: 'Standard' } })
      const taxedOrder = await call('/api/orders', maya, {
        method: 'POST',
        body: JSON.stringify({
          customerId: avery.id,
          validityDate: '2026-12-04',
          lines: [{ productId: service.id, quantity: 1, unitPrice: 50, discount: 0, taxId: null, taxGroupId: standard.id }],
        }),
      })
      expectStatus(taxedOrder, 201)
      const taxedId = taxedOrder.body?.id as number
      expectStatus(await call(`/api/orders/${taxedId}/confirm`, maya, { method: 'POST' }), 200)
      expectStatus(await call(`/api/orders/${taxedId}/deliver`, maya, { method: 'POST' }), 200)
      const taxedInvoice = await call(`/api/invoices/from/sales/${taxedId}`, maya, { method: 'POST' })
      expectStatus(taxedInvoice, 201)
      await setSetting('accounting', 'tax', 'Submitted')
      const gated = await call(`/api/invoices/${taxedInvoice.body?.id}/post`, maya, { method: 'POST' })
      expectStatus(gated, 409)
      await setSetting('accounting', 'tax', 'Not submitted')

      const duplicate = await call('/api/contacts', maya, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Parity duplicate',
          email: 'hello@cedar.example',
          isCompany: false,
          isCustomer: true,
          isSupplier: false,
          isEmployee: false,
          parentId: null,
          countryId: null,
        }),
      })
      expectStatus(duplicate, 409)
      await setSetting('contacts', 'unique', 'no')
      expectStatus(await call('/api/contacts', maya, {
        method: 'POST',
        body: JSON.stringify({
          name: 'Parity duplicate',
          email: 'hello@cedar.example',
          isCompany: false,
          isCustomer: true,
          isSupplier: false,
          isEmployee: false,
          parentId: null,
          countryId: null,
        }),
      }), 201)

      const person = await prisma.employee.findFirstOrThrow({ where: { companyId, name: 'He Gong' } })
      const weekend = await call('/api/leave/requests', maya, {
        method: 'POST',
        body: JSON.stringify({ employeeId: person.id, code: 'personal', dateFrom: '2026-10-24', dateTo: '2026-10-24', reason: 'Parity weekend' }),
      })
      expectStatus(weekend, 400)
      await setSetting('hr', 'leave', 'approved')
      const approved = await call('/api/leave/requests', maya, {
        method: 'POST',
        body: JSON.stringify({ employeeId: person.id, code: 'personal', dateFrom: '2026-11-02', dateTo: '2026-11-02', reason: 'Parity approved' }),
      })
      expectStatus(approved, 201)
      const requests = approved.body?.requests as Array<{ reason: string | null; state: string }>
      expect(requests.find((row) => row.reason === 'Parity approved')?.state).toBe('approved')
    } finally {
      await restoreDefaults()
    }
  }, 60_000)

  it('changes payroll, expenses, assets, projects, quality, subcontracting, and helpdesk', async () => {
    try {
      await setSetting('payroll', 'country', 'GBP')
      const run = await call('/api/payroll', maya, { method: 'POST', body: JSON.stringify({ period: '2099-07' }) })
      expectStatus(run, 201)
      const slips = run.body?.payslips as Array<{ lines: Array<{ code: string }> }>
      expect(slips[0]?.lines.some((line) => line.code === 'GB_PAYE')).toBe(true)
      expect(slips[0]?.lines.some((line) => line.code === 'GB_NI')).toBe(true)
      await setSetting('payroll', 'country', 'Company country')
      await setSetting('payroll', 'journal', 'NOPE')
      const blockedRun = await call(`/api/payroll/${run.body?.id}/post`, maya, { method: 'POST' })
      expectStatus(blockedRun, 400)

      const claims = await call('/api/expenses', maya)
      const cafe = (claims.body as unknown as Array<{ id: number; name: string; state: string }>).find((claim) => claim.name === 'EX0002')
      if (!cafe) throw new Error('missing claim')
      await setSetting('expenses', 'approver', 'Any')
      expectStatus(await call(`/api/expenses/${cafe.id}/approve`, jonah, { method: 'POST' }), 200)
      await setSetting('expenses', 'journal', 'NOPE')
      expectStatus(await call(`/api/expenses/${cafe.id}/reimburse`, maya, { method: 'POST' }), 400)

      await setSetting('assets', 'method', 'Declining')
      const asset = await call('/api/assets', maya, {
        method: 'POST',
        body: JSON.stringify({ name: 'Parity bench', purchaseValue: 1200, salvageValue: 0, start: '2026-10-01', method: 'straight_line', months: 12 }),
      })
      expectStatus(asset, 201)
      expect(asset.body?.method).toBe('declining')
      await setSetting('assets', 'journal', 'NOPE')
      const due = await call(`/api/assets/${asset.body?.id}/post-due`, maya, {
        method: 'POST',
        body: JSON.stringify({ asOf: '2026-10-19' }),
      })
      expectStatus(due, 400)

      const customer = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Harbor Clinic' } })
      const employee = await prisma.employee.findFirstOrThrow({ where: { companyId, name: 'He Gong' } })
      await setSetting('projects', 'billing', 'Timesheets')
      const fixed = await call('/api/projects', maya, {
        method: 'POST',
        body: JSON.stringify({ name: 'Parity fixed', partnerId: customer.id, billingType: 'fixed' }),
      })
      expectStatus(fixed, 201)
      expectStatus(await call(`/api/projects/${fixed.body?.id}/invoice`, maya, { method: 'POST' }), 409)
      await setSetting('projects', 'billing', 'Milestones')
      await setSetting('projects', 'hours', 'Days')
      const timed = await call('/api/projects', maya, {
        method: 'POST',
        body: JSON.stringify({ name: 'Parity time', partnerId: customer.id, billingType: 'time', hourlyRate: 50 }),
      })
      expectStatus(timed, 201)
      const projectId = timed.body?.id as number
      const task = await call(`/api/projects/${projectId}/tasks`, maya, {
        method: 'POST',
        body: JSON.stringify({ name: 'Measure', startDate: '2026-10-01', endDate: '2026-10-02' }),
      })
      expectStatus(task, 201)
      const taskId = (task.body?.tasks as Array<{ id: number }>)[0]?.id
      expectStatus(await call(`/api/projects/${projectId}/timesheets`, maya, {
        method: 'POST',
        body: JSON.stringify({ taskId, employeeId: employee.id, workDate: '2026-10-02', hours: 1 }),
      }), 201)
      const sheet = await prisma.timesheet.findFirstOrThrow({ where: { projectId } })
      expect(sheet.hours).toBe(8)

      await setSetting('quality', 'team', 'Inspection')
      const board = await call('/api/quality/dashboard', maya)
      expectStatus(board, 200)
      expect(board.body?.team).toBe('Inspection')
      const service = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'SV-02' } })
      const order = await call('/api/orders', maya, {
        method: 'POST',
        body: JSON.stringify({
          customerId: customer.id,
          validityDate: '2026-12-05',
          lines: [{ productId: service.id, quantity: 1, unitPrice: 15, discount: 0, taxId: null }],
        }),
      })
      expectStatus(order, 201)
      const orderId = order.body?.id as number
      expectStatus(await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' }), 200)
      const point = await prisma.qualityPoint.create({
        data: { companyId, name: 'Parity delivery', productId: service.id, trigger: 'delivery', checkType: 'pass_fail' },
      })
      await prisma.qualityCheck.create({
        data: { companyId, pointId: point.id, productId: service.id, trigger: 'delivery', status: 'pending', salesOrderId: orderId },
      })
      expectStatus(await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' }), 409)
      await setSetting('quality', 'block', 'no')
      expectStatus(await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' }), 200)

      const dye = await prisma.subcontractOrder.findFirstOrThrow({ where: { companyId, name: 'SC-DYE-1' } })
      await setSetting('subcontracting', 'resupply', 'no')
      const send = await call(`/api/subcontracting/${dye.id}/send`, maya, {
        method: 'POST',
        body: JSON.stringify({ date: '2026-10-25', lines: [{ productId: dye.id, quantity: 1 }] }),
      })
      expectStatus(send, 409)
      expect(String(send.body?.error)).toContain('resupply')
      await setSetting('subcontracting', 'resupply', 'yes')
      await setSetting('subcontracting', 'location', 'Not a shelf')
      const receive = await call(`/api/subcontracting/${dye.id}/receive`, maya, {
        method: 'POST',
        body: JSON.stringify({ date: '2026-10-25', quantity: 1 }),
      })
      expectStatus(receive, 400)
      expect(String(receive.body?.error)).toContain('Not a shelf')

      const cedar = await prisma.contact.findFirstOrThrow({ where: { companyId, email: 'hello@cedar.example' } })
      await setSetting('helpdesk', 'team', 'Front desk')
      const assigned = await call('/api/helpdesk', maya, {
        method: 'POST',
        body: JSON.stringify({ partnerId: cedar.id, subject: 'Parity desk', description: 'Team check.' }),
      })
      expectStatus(assigned, 201)
      expect((assigned.body?.team as { name?: string } | undefined)?.name).toBe('Front desk')
      const createdAt = new Date(String(assigned.body?.createdAt))
      const deadline = new Date(String(assigned.body?.slaDeadline))
      expect(deadline.getTime()).toBeGreaterThan(createdAt.getTime() + 24 * 3_600_000)
      await setSetting('helpdesk', 'hours', 'nope')
      const calendar = await call('/api/helpdesk', maya, {
        method: 'POST',
        body: JSON.stringify({ partnerId: cedar.id, subject: 'Parity clock', description: 'Calendar check.' }),
      })
      expectStatus(calendar, 201)
      const start = new Date(String(calendar.body?.createdAt)).getTime()
      const end = new Date(String(calendar.body?.slaDeadline)).getTime()
      expect(end - start).toBe(24 * 3_600_000)
    } finally {
      await restoreDefaults()
    }
  }, 60_000)

  it('changes attendance grace, overtime, and the wastage limit', async () => {
    try {
      const [first, second] = await prisma.employee.findMany({
        where: { companyId, name: { in: ['Amina Farooq', 'Bao Zhen'] } },
        include: { shift: true },
        orderBy: { name: 'asc' },
      })
      if (!first || !second) throw new Error('missing employees')
      const now = new Date()
      const minutes = now.getUTCHours() * 60 + now.getUTCMinutes()
      const start = first.shift?.startMinutes ?? 9 * 60
      const end = first.shift?.endMinutes ?? 17 * 60 + 30
      await setSetting('attendance', 'grace', '0')
      const late = await call('/api/attendance/punch', maya, {
        method: 'POST',
        body: JSON.stringify({ employeeId: first.id, action: 'in' }),
      })
      expectStatus(late, 200)
      expect(late.body?.late).toBe(minutes > start)
      await setSetting('attendance', 'grace', '10000')
      const early = await call('/api/attendance/punch', maya, {
        method: 'POST',
        body: JSON.stringify({ employeeId: second.id, action: 'in' }),
      })
      expectStatus(early, 200)
      expect(early.body?.late).toBe(minutes > start + 10000)
      await setSetting('attendance', 'overtime', 'No')
      const out = await call('/api/attendance/punch', maya, {
        method: 'POST',
        body: JSON.stringify({ employeeId: first.id, action: 'out' }),
      })
      expectStatus(out, 200)
      const extra = Math.max(0, minutes - end)
      expect(out.body?.overtimeMinutes).toBe(extra)
      expect(out.body?.overtimeState).toBe(extra > 0 ? 'approved' : '')

      const open = await prisma.manufacturingOrder.findFirstOrThrow({
        where: { companyId, state: { in: ['progress', 'stopped'] } },
        include: { lines: true },
      })
      const productId = open.lines[0]?.productId ?? open.productId
      await setSetting('wastage', 'approver', 'Jonah Ellis')
      await setSetting('wastage', 'limit', '0')
      const loss = await call(`/api/manufacturing/${open.id}/wastage`, maya, {
        method: 'POST',
        body: JSON.stringify({ productId, quantity: 1, reason: 'Parity scrap', kind: 'process_loss', unitCost: 10 }),
      })
      expectStatus(loss, 403)
    } finally {
      await restoreDefaults()
    }
  }, 60_000)

  it('posts exclusive, inclusive, withholding, and export tax to the right accounts', async () => {
    const avery = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Avery Lang' } })
    const milo = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Milo Park' } })
    const service = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'SV-02' } })
    const standard = await prisma.taxGroup.findFirstOrThrow({ where: { companyId, name: 'Standard' } })
    const withholding = await prisma.taxGroup.findFirstOrThrow({ where: { companyId, name: 'Withholding' } })
    const included = await prisma.taxGroup.findFirstOrThrow({ where: { companyId, name: 'Included' } })
    const position = await prisma.fiscalPosition.findFirstOrThrow({ where: { companyId, name: 'Export' } })

    async function invoiceService(customerId: number, unitPrice: number, taxGroupId: number) {
      const order = await call('/api/orders', maya, {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          validityDate: '2026-12-06',
          lines: [{ productId: service.id, quantity: 1, unitPrice, discount: 0, taxId: null, taxGroupId }],
        }),
      })
      expectStatus(order, 201)
      const orderId = order.body?.id as number
      expectStatus(await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' }), 200)
      expectStatus(await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' }), 200)
      const draft = await call(`/api/invoices/from/sales/${orderId}`, maya, { method: 'POST' })
      expectStatus(draft, 201)
      const posted = await call(`/api/invoices/${draft.body?.id}/post`, maya, { method: 'POST' })
      expectStatus(posted, 200)
      return {
        id: draft.body?.id as number,
        amountUntaxed: draft.body?.amountUntaxed as number,
        amountTax: draft.body?.amountTax as number,
        amountTotal: draft.body?.amountTotal as number,
      }
    }

    const exclusive = await invoiceService(avery.id, 100, standard.id)
    expect(exclusive).toMatchObject({ amountUntaxed: 100, amountTax: 13, amountTotal: 113 })
    const exclusiveLines = await journalLines({ invoiceId: exclusive.id })
    expect(side(exclusiveLines, '1122')).toEqual({ debit: 113, credit: 0 })
    expect(side(exclusiveLines, '6001')).toEqual({ debit: 0, credit: 100 })
    expect(side(exclusiveLines, '222101')).toEqual({ debit: 0, credit: 13 })

    const held = await invoiceService(milo.id, 100, withholding.id)
    expect(held).toMatchObject({ amountUntaxed: 100, amountTax: 13, amountTotal: 108 })
    const heldLines = await journalLines({ invoiceId: held.id })
    expect(side(heldLines, '1122')).toEqual({ debit: 108, credit: 0 })
    expect(side(heldLines, '1221')).toEqual({ debit: 5, credit: 0 })
    expect(side(heldLines, '6001')).toEqual({ debit: 0, credit: 100 })
    expect(side(heldLines, '222101')).toEqual({ debit: 0, credit: 13 })

    const previous = avery.fiscalPositionId
    await prisma.contact.update({ where: { id: avery.id }, data: { fiscalPositionId: position.id } })
    try {
      const exported = await invoiceService(avery.id, 100, standard.id)
      expect(exported).toMatchObject({ amountUntaxed: 100, amountTax: 0, amountTotal: 100 })
      const exportLines = await journalLines({ invoiceId: exported.id })
      expect(side(exportLines, '1122')).toEqual({ debit: 100, credit: 0 })
      expect(side(exportLines, '6001')).toEqual({ debit: 0, credit: 100 })
      expect(side(exportLines, '222101')).toEqual({ debit: 0, credit: 0 })
    } finally {
      await prisma.contact.update({ where: { id: avery.id }, data: { fiscalPositionId: previous } })
    }

    const vendor = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Brightmill Supply' } })
    const yarn = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'RM-YN' } })
    const purchase = await call('/api/purchases', maya, {
      method: 'POST',
      body: JSON.stringify({
        vendorId: vendor.id,
        lines: [{ productId: yarn.id, quantity: 1, unitCost: 113, taxId: null, taxGroupId: included.id }],
      }),
    })
    expectStatus(purchase, 201)
    const purchaseId = purchase.body?.id as number
    const confirmed = await call(`/api/purchases/${purchaseId}/confirm`, maya, { method: 'POST' })
    expectStatus(confirmed, 200)
    const moveId = (confirmed.body?.moves as Array<{ id: number }>)[0]?.id
    if (!moveId) throw new Error('missing receipt')
    let received = await call(`/api/purchases/${purchaseId}/receive`, maya, {
      method: 'POST',
      body: JSON.stringify({ lines: [{ moveId, quantity: 1 }] }),
    })
    if (received.status === 409 && String(received.body?.error).includes('quality')) {
      await setSetting('quality', 'block', 'no')
      received = await call(`/api/purchases/${purchaseId}/receive`, maya, {
        method: 'POST',
        body: JSON.stringify({ lines: [{ moveId, quantity: 1 }] }),
      })
      await setSetting('quality', 'block', 'yes')
    }
    expectStatus(received, 200)
    const bill = await call(`/api/invoices/from/purchase/${purchaseId}`, maya, { method: 'POST' })
    expectStatus(bill, 201)
    expect(bill.body).toMatchObject({ amountUntaxed: 100, amountTax: 13, amountTotal: 113 })
    expectStatus(await call(`/api/invoices/${bill.body?.id}/post`, maya, { method: 'POST' }), 200)
    const billLines = await journalLines({ invoiceId: bill.body?.id as number })
    expect(side(billLines, '1405')).toEqual({ debit: 100, credit: 0 })
    expect(side(billLines, '222102')).toEqual({ debit: 13, credit: 0 })
    expect(side(billLines, '2202')).toEqual({ debit: 0, credit: 113 })

    const notebook = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'NB-01' } })
    const session = await prisma.posSession.findFirstOrThrow({ where: { companyId, name: 'SES0001', state: 'open' } })
    const quote = await call('/api/pricing/resolve', maya, {
      method: 'POST',
      body: JSON.stringify({ side: 'sales', productId: notebook.id, quantity: 1 }),
    })
    expectStatus(quote, 200)
    const unitPrice = quote.body?.unitPrice as number
    const discount = (quote.body?.discount as number) || 0
    const vat = await prisma.companyTax.findFirstOrThrow({ where: { companyId, code: 'VAT' } })
    const base = roundMoney(unitPrice * (1 - discount / 100))
    const result = computeTaxes(base, 1, [{
      id: vat.id,
      name: vat.name,
      kind: 'percent',
      amount: vat.amount,
      priceInclude: vat.priceInclude,
      compound: vat.compound,
      withholding: vat.withholding,
      sequence: vat.sequence,
    }])
    const sold = await call('/api/pos/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.id,
        lines: [{ productId: notebook.id, quantity: 1, discount, taxGroupId: standard.id }],
        payments: [{ method: 'cash', amount: result.total }],
      }),
    })
    expectStatus(sold, 201)
    expect(sold.body?.amountUntaxed).toBe(result.net)
    expect(sold.body?.amountTax).toBe(result.added)
    expect(sold.body?.amountTotal).toBe(result.total)
    const posName = String(sold.body?.name)
    const posLines = await journalLines({ label: posName })
    expect(side(posLines, '1001')).toEqual({ debit: result.total, credit: 0 })
    expect(side(posLines, '6001')).toEqual({ debit: 0, credit: result.net })
    expect(side(posLines, '222101').credit).toBe(result.added)
    const before = await prisma.journalEntry.count({ where: { companyId, lines: { some: { label: posName } } } })
    const posInvoice = await call(`/api/invoices/from/pos/${sold.body?.id}`, maya, { method: 'POST' })
    expectStatus(posInvoice, 201)
    expectStatus(await call(`/api/invoices/${posInvoice.body?.id}/post`, maya, { method: 'POST' }), 200)
    const after = await prisma.journalEntry.count({ where: { companyId, lines: { some: { label: posName } } } })
    expect(after).toBe(before)
    const linked = await prisma.journalEntry.findFirstOrThrow({ where: { invoiceId: posInvoice.body?.id as number } })
    expect(linked.invoiceId).toBe(posInvoice.body?.id)
  }, 60_000)

  it('posts a payment to clearing, allocates it once, and balances the trial balance', async () => {
    const avery = await prisma.contact.findFirstOrThrow({ where: { companyId, name: 'Avery Lang' } })
    const service = await prisma.product.findFirstOrThrow({ where: { companyId, sku: 'SV-02' } })
    const order = await call('/api/orders', maya, {
      method: 'POST',
      body: JSON.stringify({
        customerId: avery.id,
        validityDate: '2026-12-07',
        lines: [{ productId: service.id, quantity: 1, unitPrice: 80, discount: 0, taxId: null }],
      }),
    })
    expectStatus(order, 201)
    const orderId = order.body?.id as number
    expectStatus(await call(`/api/orders/${orderId}/confirm`, maya, { method: 'POST' }), 200)
    expectStatus(await call(`/api/orders/${orderId}/deliver`, maya, { method: 'POST' }), 200)
    const draft = await call(`/api/invoices/from/sales/${orderId}`, maya, { method: 'POST' })
    expectStatus(draft, 201)
    const invoiceId = draft.body?.id as number
    const amount = draft.body?.amountTotal as number
    expectStatus(await call(`/api/invoices/${invoiceId}/post`, maya, { method: 'POST' }), 200)

    const payment = await call('/api/payments', maya, {
      method: 'POST',
      body: JSON.stringify({ kind: 'customer', partnerId: avery.id, amount, date: '2026-10-25', method: 'bank', memo: 'Parity receipt' }),
    })
    expectStatus(payment, 201)
    expect(payment.body?.state).toBe('draft')
    const paymentId = payment.body?.id as number
    const posted = await call(`/api/payments/${paymentId}/post`, maya, { method: 'POST' })
    expectStatus(posted, 200)
    expect(posted.body?.state).toBe('posted')
    const name = String(posted.body?.name)
    const bankLines = (await journalLines({ label: name })).filter((line) => line.code === '1002')
    expect(bankLines).toEqual([{ code: '1002', debit: amount, credit: 0 }])
    expect(side(await journalLines({ label: name }), '2249')).toEqual({ debit: 0, credit: amount })

    const allocated = await call(`/api/payments/${paymentId}/allocate`, maya, {
      method: 'POST',
      body: JSON.stringify({ invoiceId, amount }),
    })
    expectStatus(allocated, 200)
    expect(allocated.body?.unapplied).toBe(0)
    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoiceId } })
    expect(invoice.residual).toBe(0)
    expect(invoice.state).toBe('paid')
    const bankAfter = (await journalLines({ label: name })).filter((line) => line.code === '1002')
    expect(bankAfter).toHaveLength(1)

    const unbalanced = await call('/api/journal-entries', maya, {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-10-25',
        lines: [
          { account: '1002', debit: 10, credit: 0, label: 'Parity unbalanced' },
          { account: '6001', debit: 0, credit: 4, label: 'Parity unbalanced' },
        ],
      }),
    })
    expectStatus(unbalanced, 400)
    const balanced = await call('/api/journal-entries', maya, {
      method: 'POST',
      body: JSON.stringify({
        date: '2026-10-25',
        lines: [
          { account: '1002', debit: 10, credit: 0, label: 'Parity journal' },
          { account: '6001', debit: 0, credit: 10, label: 'Parity journal' },
        ],
      }),
    })
    expectStatus(balanced, 201)
    const trial = await call('/api/reports/trial-balance?on=2026-12-31', maya)
    expectStatus(trial, 200)
    expect(trial.body?.debit).toBe(trial.body?.credit)
    expect(trial.body?.balanced).toBe(true)
  }, 60_000)

  it('leaves Harbour & Line books where they were', async () => {
    const amira = await signIn('amira@harbourline.example', demoPasswords.amira)
    const desk = await call('/api/desk', amira)
    expectStatus(desk, 200)
    expect(desk.body).toMatchObject({ staff: 10, shopOrders: 4, profit: -9188, vatPayable: 98.16 })
  })
})
