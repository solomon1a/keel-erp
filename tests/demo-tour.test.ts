import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let jonah = ''
let companyId = 0
let harbourId = 0

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
  companyId = (await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })).companyId
  harbourId = (await prisma.user.findUniqueOrThrow({ where: { email: 'amira@harbourline.example' } })).companyId
})

afterAll(async () => {
  await prisma.$disconnect()
})

type TourBody = {
  available?: boolean
  blocked?: boolean
  steps?: string[]
  error?: string
  run?: {
    step: number
    status: string
    serial: number
    leadId: number | null
    quotationId: number | null
    salesOrderId: number | null
    purchaseOrderId: number | null
    manufacturingOrderId: number | null
    invoiceId: number | null
    statementId: number | null
    projectId: number | null
    productName: string
    note: string | null
  } | null
}

function tour(path: string, cookie: string, body?: unknown) {
  return call(path, cookie, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
}

describe('guided demo', () => {
  it('offers the walk to a company that has a bill, a customer, and a supplier', async () => {
    const response = await tour('/api/demo-tour', maya)
    const body = response.body as TourBody
    expect(response.status).toBe(200)
    expect(body.available).toBe(true)
    expect(body.steps).toEqual(['lead', 'confirm', 'purchase', 'quality', 'make', 'wastage', 'deliver', 'bank', 'books', 'dashboard', 'project', 'bill', 'profit'])
  })

  it('hides the walk when a new company has no sample data', async () => {
    const created = await call('/api/signup', '', {
      method: 'POST',
      headers: { 'x-forwarded-for': '203.0.113.44' },
      body: JSON.stringify({
        companyName: 'Empty Desk Co',
        country: 'CN',
        name: 'Empty Admin',
        email: 'empty-desk@example.com',
        password: 'empty-desk-1',
        loadSample: false,
      }),
    })
    expect(created.status).toBe(201)
    const cookie = created.setCookie?.split(';')[0] ?? ''
    const response = await tour('/api/demo-tour', cookie)
    expect(response.status).toBe(200)
    expect((response.body as TourBody).available).toBe(false)
  })

  it('refuses reset and restart for someone who is not an admin', async () => {
    const reset = await tour('/api/demo-tour/reset', jonah, {})
    expect(reset.status).toBe(403)
    expect(reset.body).toMatchObject({ error: 'Only an admin can do that.' })
    const restart = await tour('/api/demo-tour/start', jonah, { restart: true })
    expect(restart.status).toBe(403)
  })

  it('walks the August story and puts only that company back', async () => {
    const harbourLeads = await prisma.lead.count({ where: { companyId: harbourId } })
    const harbourJournals = await prisma.journalEntry.count({ where: { companyId: harbourId } })
    const before = await call('/api/reports/pnl', maya)
    expect(before.body).toMatchObject({ profit: jiangbeiBooks.profit })

    try {
      const started = await tour('/api/demo-tour/start', maya, { restart: true })
      const startBody = started.body as TourBody
      expect(started.status).toBe(200)
      expect(startBody.run?.status).toBe('active')
      expect(startBody.run?.step).toBe(0)
      expect(startBody.run?.productName).toBe('Shop apron')

      const lead = await tour('/api/demo-tour/act', maya, { step: 0 })
      const leadBody = lead.body as TourBody
      expect(lead.status).toBe(200)
      expect(leadBody.run?.leadId).toBeTruthy()
      expect(leadBody.run?.salesOrderId).toBeTruthy()
      const quote = await prisma.quotation.findFirst({ where: { companyId, name: `GD${leadBody.run?.serial}` } })
      expect(quote?.state).toBe('ordered')
      const order = await prisma.salesOrder.findFirst({ where: { id: leadBody.run?.salesOrderId ?? 0, companyId } })
      expect(order?.state).toBe('draft')
      const again = await tour('/api/demo-tour/act', maya, { step: 0 })
      expect(await prisma.quotation.count({ where: { companyId, name: { startsWith: 'GD' } } })).toBe(1)
      expect((again.body as TourBody).run?.salesOrderId).toBe(leadBody.run?.salesOrderId)

      const moved = await tour('/api/demo-tour/step', maya, { step: 1 })
      expect((moved.body as TourBody).run?.step).toBe(1)
      const resumed = await tour('/api/demo-tour', maya)
      expect((resumed.body as TourBody).run?.step).toBe(1)

      const confirm = await tour('/api/demo-tour/act', maya, { step: 1 })
      const confirmBody = confirm.body as TourBody
      expect(confirm.status).toBe(200)
      expect(confirmBody.blocked).toBe(true)
      expect(confirmBody.run?.note).toContain('on hand')
      expect((await prisma.salesOrder.findFirst({ where: { id: order?.id } }))?.state).toBe('draft')

      const purchase = await tour('/api/demo-tour/act', maya, { step: 2 })
      const purchaseBody = purchase.body as TourBody
      expect(purchase.status).toBe(200)
      expect(purchaseBody.blocked).toBe(true)
      const purchaseId = purchaseBody.run?.purchaseOrderId ?? 0
      const po = await prisma.purchaseOrder.findFirst({ where: { id: purchaseId, companyId }, include: { lines: true } })
      expect(po?.state).toBe('purchase')
      expect(po?.lines[0]?.quantity).toBe(4)
      const held = await prisma.qualityCheck.findFirst({
        where: { companyId, purchaseOrderId: purchaseId },
        include: { point: true },
      })
      expect(held?.status).toBe('pending')
      expect(held?.point.name).toContain('Guided demo')

      const quality = await tour('/api/demo-tour/act', maya, { step: 3 })
      expect(quality.status).toBe(200)
      expect((quality.body as TourBody).run?.note).toContain('quarantine')
      const received = await prisma.purchaseOrder.findFirst({ where: { id: purchaseId } })
      expect(received?.state).toBe('done')
      const passed = await prisma.qualityCheck.findFirst({ where: { id: held?.id }, include: { alert: true } })
      expect(passed?.status).toBe('pass')
      expect(passed?.alert?.status).toBe('resolved')
      expect(passed?.alert?.action).toBe('rework')

      const made = await tour('/api/demo-tour/act', maya, { step: 4 })
      expect(made.status).toBe(200)
      const moId = (made.body as TourBody).run?.manufacturingOrderId ?? 0
      const mo = await prisma.manufacturingOrder.findFirst({ where: { id: moId, companyId }, include: { jobCards: { include: { logs: true } } } })
      expect(mo?.state).toBe('progress')
      expect(mo?.quantityDone).toBe(0)
      expect(mo?.jobCards[0]?.logs[0]?.minutes).toBe(30)
      expect(mo?.jobCards[0]?.logs[0]?.operatorName).toBe('August')

      const wasted = await tour('/api/demo-tour/act', maya, { step: 5 })
      expect(wasted.status).toBe(200)
      const finished = await prisma.manufacturingOrder.findFirst({ where: { id: moId }, include: { wastage: true } })
      expect(finished?.state).toBe('done')
      expect(finished?.quantityDone).toBe(1)
      expect(finished?.wastage.some((row) => row.reason === 'Guided demo fray' && row.kind === 'process_loss')).toBe(true)

      const delivered = await tour('/api/demo-tour/act', maya, { step: 6 })
      expect(delivered.status).toBe(200)
      const invoiceId = (delivered.body as TourBody).run?.invoiceId ?? 0
      const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } })
      expect(invoice?.state).toBe('posted')
      expect(invoice?.residual).toBeGreaterThan(0)
      const sold = await prisma.salesOrder.findFirst({ where: { id: order?.id } })
      expect(sold?.state).toBe('done')
      const during = await call('/api/reports/pnl', maya)
      expect(during.body?.profit).not.toBe(jiangbeiBooks.profit)

      const bank = await tour('/api/demo-tour/act', maya, { step: 7 })
      const bankBody = bank.body as TourBody
      expect(bank.status).toBe(200)
      expect(bankBody.run?.note).toContain('Statement versus book is 0')
      const paid = await prisma.invoice.findFirst({ where: { id: invoiceId } })
      expect(paid?.state).toBe('paid')
      const statement = await prisma.bankStatement.findFirst({
        where: { id: bankBody.run?.statementId ?? 0, companyId },
        include: { lines: true },
      })
      expect(statement?.name).toContain('bank')
      expect(statement?.lines[0]?.reconciled).toBeGreaterThan(0)

      const books = await tour('/api/demo-tour/act', maya, { step: 8 })
      expect((books.body as TourBody).run?.note).toContain('Profit is')

      const project = await tour('/api/demo-tour/act', maya, { step: 10 })
      const projectBody = project.body as TourBody
      expect(project.status).toBe(200)
      const visit = await prisma.project.findFirst({
        where: { id: projectBody.run?.projectId ?? 0, companyId },
        include: { timesheets: true },
      })
      expect(visit?.name).toContain('Showroom visit')
      expect(visit?.timesheets[0]?.state).toBe('approved')
      expect(visit?.timesheets[0]?.description).toBe('Guided demo visit')

      const billed = await tour('/api/demo-tour/act', maya, { step: 11 })
      expect(billed.status).toBe(200)
      const invoicedSheet = await prisma.timesheet.findFirst({ where: { id: visit?.timesheets[0]?.id } })
      expect(invoicedSheet?.state).toBe('invoiced')
      const projectInvoice = await prisma.invoice.findFirst({
        where: { companyId, id: invoicedSheet?.invoiceId ?? 0 },
      })
      expect(projectInvoice?.state).toBe('posted')

      const margin = await tour('/api/demo-tour/act', maya, { step: 12 })
      expect((margin.body as TourBody).run?.note).toContain('Project revenue')
      expect(await prisma.lead.count({ where: { companyId: harbourId } })).toBe(harbourLeads)
      expect(await prisma.journalEntry.count({ where: { companyId: harbourId } })).toBe(harbourJournals)
    } finally {
      const reset = await tour('/api/demo-tour/reset', maya, {})
      expect(reset.status).toBe(200)
    }

    const restored = await call('/api/reports/pnl', maya)
    expect(restored.body).toMatchObject({
      income: jiangbeiBooks.income,
      expense: jiangbeiBooks.expense,
      profit: jiangbeiBooks.profit,
    })
    const restoredBalance = await call('/api/reports/balance', maya)
    expect(restoredBalance.body).toMatchObject({
      assets: jiangbeiBooks.assets,
      liabilities: jiangbeiBooks.liabilities,
      equity: jiangbeiBooks.equity,
      balanced: true,
    })
    const restoredVat = await call('/api/reports/vat', maya)
    expect(restoredVat.body).toMatchObject({
      output: jiangbeiBooks.outputVat,
      input: jiangbeiBooks.inputVat,
      payable: jiangbeiBooks.vatPayable,
    })
    expect(await prisma.quotation.count({ where: { companyId, name: { startsWith: 'GD' } } })).toBe(0)
    expect(await prisma.demoRun.count({ where: { companyId } })).toBe(0)
    expect(await prisma.qualityPoint.count({ where: { companyId, name: { startsWith: 'Guided demo' } } })).toBe(0)
    expect(await prisma.project.count({ where: { companyId, name: { startsWith: 'Showroom visit' } } })).toBe(0)
    const october = await prisma.bankStatement.findFirst({
      where: { companyId, name: 'Jiangbei October statement' },
      include: { lines: true },
    })
    expect(october?.lines.every((line) => line.reconciled === 0)).toBe(true)
    const fitOut = await prisma.timesheet.findFirst({ where: { companyId, description: 'Shelf frames along the west wall' } })
    expect(fitOut?.state).toBe('approved')
    expect(await prisma.lead.count({ where: { companyId: harbourId } })).toBe(harbourLeads)
    expect(await prisma.journalEntry.count({ where: { companyId: harbourId } })).toBe(harbourJournals)
    const balance = await prisma.journalItem.findMany({
      where: { entry: { companyId } },
      select: { debit: true, credit: true },
    })
    const debit = Math.round(balance.reduce((sum, row) => sum + row.debit, 0) * 100) / 100
    const credit = Math.round(balance.reduce((sum, row) => sum + row.credit, 0) * 100) / 100
    expect(debit).toBe(credit)
  })
})
