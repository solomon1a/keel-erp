import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { jiangbeiDepreciationTotal, jiangbeiSubcontractBooks } from '../shared/demo-adjustments.ts'
import { roundMoney } from '../src/domain/money.ts'
import { volumeBooks } from './volume-plan.ts'

/** Books already posted by the rest of the Jiangbei seed, before this wholesale season. */
const prior = {
  income: 436,
  expense: 36168,
  outputVat: 56.68,
  inputVat: 10.4,
  receivable: 266.68,
  payable: 90.4,
  assets: 404.68,
  liabilities: 36136.68,
} as const

const rate = 13

type GoodsLine = {
  description: string
  quantity: number
  unitPrice: number
  cost: number
}

type SaleDoc = {
  name: string
  partner: string
  date: string
  paid: boolean
  entry: string
  receiptEntry: string
  costEntry: string
  lines: GoodsLine[]
}

type BillDoc = {
  name: string
  partner: string
  date: string
  paid: boolean
  paidOn?: string
  entry: string
  paymentEntry?: string
  description: string
  untaxed: number
}

type OpexDoc = {
  entry: string
  date: string
  account: '6603' | '6604'
  label: string
  amount: number
}

const sales: SaleDoc[] = [
  {
    name: 'INV-S2001',
    partner: 'Cedar & Co',
    date: '2026-01-22',
    paid: true,
    entry: 'JE-S2001',
    receiptEntry: 'JE-S2002',
    costEntry: 'JE-S2003',
    lines: [
      { description: 'Field notebook', quantity: 800, unitPrice: 18, cost: 6 },
      { description: 'Wool blanket', quantity: 200, unitPrice: 86, cost: 42 },
    ],
  },
  {
    name: 'INV-S2002',
    partner: 'Harbor Clinic',
    date: '2026-03-06',
    paid: true,
    entry: 'JE-S2004',
    receiptEntry: 'JE-S2005',
    costEntry: 'JE-S2006',
    lines: [
      { description: 'Wool blanket', quantity: 400, unitPrice: 86, cost: 42 },
      { description: 'Canvas tote', quantity: 500, unitPrice: 24, cost: 9 },
    ],
  },
  {
    name: 'INV-S2003',
    partner: 'Milo Park',
    date: '2026-06-20',
    paid: false,
    entry: 'JE-S2007',
    receiptEntry: 'JE-S2008',
    costEntry: 'JE-S2009',
    lines: [
      { description: 'Field notebook', quantity: 300, unitPrice: 18, cost: 6 },
      { description: 'Wool blanket', quantity: 100, unitPrice: 86, cost: 42 },
    ],
  },
  {
    name: 'INV-S2004',
    partner: 'Cedar & Co',
    date: '2026-08-01',
    paid: false,
    entry: 'JE-S2010',
    receiptEntry: 'JE-S2011',
    costEntry: 'JE-S2012',
    lines: [
      { description: 'Field notebook', quantity: 200, unitPrice: 18, cost: 6 },
      { description: 'Wool blanket', quantity: 150, unitPrice: 86, cost: 42 },
      { description: 'Canvas tote', quantity: 200, unitPrice: 24, cost: 9 },
    ],
  },
  {
    name: 'INV-S2005',
    partner: 'Harbor Clinic',
    date: '2026-09-10',
    paid: false,
    entry: 'JE-S2013',
    receiptEntry: 'JE-S2014',
    costEntry: 'JE-S2015',
    lines: [
      { description: 'Field notebook', quantity: 250, unitPrice: 18, cost: 6 },
      { description: 'Canvas tote', quantity: 100, unitPrice: 24, cost: 9 },
    ],
  },
  {
    name: 'INV-S2006',
    partner: 'Milo Park',
    date: '2026-10-09',
    paid: false,
    entry: 'JE-S2016',
    receiptEntry: 'JE-S2017',
    costEntry: 'JE-S2018',
    lines: [
      { description: 'Field notebook', quantity: 100, unitPrice: 18, cost: 6 },
      { description: 'Wool blanket', quantity: 20, unitPrice: 86, cost: 42 },
    ],
  },
]

const bills: BillDoc[] = [
  {
    name: 'BILL-S2001',
    partner: 'Suhang Weaving',
    date: '2026-01-08',
    paid: true,
    paidOn: '2026-01-20',
    entry: 'JE-S2019',
    paymentEntry: 'JE-S2020',
    description: 'Finished goods for the spring season',
    untaxed: 48000,
  },
  {
    name: 'BILL-S2002',
    partner: 'Qingpu Yarn',
    date: '2026-09-15',
    paid: false,
    entry: 'JE-S2021',
    description: 'Yarn and cloth still on the shelf',
    untaxed: 30000,
  },
]

const opex: OpexDoc[] = [
  { entry: 'JE-S2022', date: '2026-01-31', account: '6603', label: 'January studio rent', amount: 2400 },
  { entry: 'JE-S2023', date: '2026-02-28', account: '6603', label: 'February studio rent', amount: 2400 },
  { entry: 'JE-S2024', date: '2026-03-31', account: '6603', label: 'March studio rent', amount: 2400 },
  { entry: 'JE-S2025', date: '2026-04-15', account: '6604', label: 'Outbound freight', amount: 2400 },
]

function priced(line: GoodsLine) {
  const subtotal = roundMoney(line.quantity * line.unitPrice)
  const taxAmount = roundMoney(subtotal * (rate / 100))
  const costAmount = roundMoney(line.quantity * line.cost)
  return { ...line, subtotal, taxAmount, costAmount }
}

function saleTotals(doc: SaleDoc) {
  const lines = doc.lines.map(priced)
  const amountUntaxed = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0))
  const amountTax = roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0))
  const amountTotal = roundMoney(amountUntaxed + amountTax)
  const cost = roundMoney(lines.reduce((sum, line) => sum + line.costAmount, 0))
  return { lines, amountUntaxed, amountTax, amountTotal, cost }
}

function billTotals(doc: BillDoc) {
  const amountUntaxed = roundMoney(doc.untaxed)
  const amountTax = roundMoney(amountUntaxed * (rate / 100))
  const amountTotal = roundMoney(amountUntaxed + amountTax)
  return { amountUntaxed, amountTax, amountTotal }
}

function buildPlan() {
  const pricedSales = sales.map((doc) => ({ doc, money: saleTotals(doc) }))
  const pricedBills = bills.map((doc) => ({ doc, money: billTotals(doc) }))
  const salesIncome = roundMoney(pricedSales.reduce((sum, row) => sum + row.money.amountUntaxed, 0))
  const costOfSales = roundMoney(pricedSales.reduce((sum, row) => sum + row.money.cost, 0))
  const operating = roundMoney(opex.reduce((sum, row) => sum + row.amount, 0))
  const outputVat = roundMoney(pricedSales.reduce((sum, row) => sum + row.money.amountTax, 0))
  const inputVat = roundMoney(pricedBills.reduce((sum, row) => sum + row.money.amountTax, 0))
  const openReceivable = roundMoney(
    pricedSales.filter((row) => !row.doc.paid).reduce((sum, row) => sum + row.money.amountTotal, 0),
  )
  const openPayable = roundMoney(
    pricedBills.filter((row) => !row.doc.paid).reduce((sum, row) => sum + row.money.amountTotal, 0),
  )

  let assetDelta = 0
  let liabilityDelta = 0
  for (const row of pricedSales) {
    assetDelta = roundMoney(assetDelta + row.money.amountTotal)
    liabilityDelta = roundMoney(liabilityDelta + row.money.amountTax)
    assetDelta = roundMoney(assetDelta - row.money.cost)
  }
  for (const row of pricedBills) {
    assetDelta = roundMoney(assetDelta + row.money.amountUntaxed)
    liabilityDelta = roundMoney(liabilityDelta + row.money.amountUntaxed)
    if (row.doc.paid) {
      assetDelta = roundMoney(assetDelta - row.money.amountTotal)
      liabilityDelta = roundMoney(liabilityDelta - row.money.amountTotal)
    }
  }
  assetDelta = roundMoney(assetDelta - operating)

  const tradeIncome = 72
  const tradeExpense = 30
  const tradeProfit = roundMoney(tradeIncome - tradeExpense)
  const tradeOutputVat = 9.36
  const tradeInputVat = 4.68
  const tradeReceivable = 101.7
  const tradePayable = 40.68
  const tradeAssets = 127.36
  const tradeLiabilities = 85.36
  if (roundMoney(tradeAssets - tradeLiabilities - tradeProfit) !== 0) {
    throw new Error('Trade demo does not balance.')
  }

  const depreciation = jiangbeiDepreciationTotal()
  const sub = jiangbeiSubcontractBooks
  const income = roundMoney(prior.income + salesIncome + tradeIncome + volumeBooks.income)
  const expense = roundMoney(prior.expense + costOfSales + operating + tradeExpense + depreciation + volumeBooks.expense)
  const profit = roundMoney(income - expense)
  const assets = roundMoney(prior.assets + assetDelta + tradeAssets + sub.assetIncrease - depreciation + volumeBooks.assetDelta)
  const liabilities = roundMoney(prior.liabilities + liabilityDelta + tradeLiabilities + sub.liabilityIncrease + volumeBooks.liabilityDelta)
  const balanced = roundMoney(assets - liabilities - profit) === 0
  if (!balanced) throw new Error('Jiangbei wholesale season does not balance.')
  const outputVatTotal = roundMoney(prior.outputVat + outputVat + tradeOutputVat + volumeBooks.outputVat)
  const inputVatTotal = roundMoney(prior.inputVat + inputVat + tradeInputVat + sub.inputVat + volumeBooks.inputVat)

  return {
    pricedSales,
    pricedBills,
    income,
    expense,
    profit,
    margin: roundMoney((profit / income) * 100),
    assets,
    liabilities,
    equity: profit,
    depreciation,
    outputVat: outputVatTotal,
    inputVat: inputVatTotal,
    vatPayable: roundMoney(outputVatTotal - inputVatTotal),
    receivable: roundMoney(prior.receivable + openReceivable + tradeReceivable + volumeBooks.receivable),
    payable: roundMoney(prior.payable + openPayable + tradePayable + sub.payable + volumeBooks.payable),
  }
}

export const jiangbeiBooks = buildPlan()

const extraAccounts = [
  ['6603', 'Occupancy', 'expense'],
  ['6604', 'Delivery', 'expense'],
] as const

type PostingLine = { accountId: number; debit: number; credit: number; label: string; partnerId?: number }

function on(day: string) {
  return new Date(`${day}T00:00:00.000Z`)
}

export async function seedHealthyBooks(client: PrismaClient) {
  const admin = await client.user.findUnique({
    where: { email: 'maya@northline.example' },
    select: { companyId: true },
  })
  if (!admin) return
  const companyId = admin.companyId
  const already = await client.invoice.findFirst({ where: { companyId, name: 'INV-S2001' } })
  if (already) return

  const company = await client.company.findUnique({ where: { id: companyId } })
  if (!company || company.currency !== 'CNY') return

  const partners = await client.contact.findMany({
    where: {
      companyId,
      name: { in: [...sales.map((row) => row.partner), ...bills.map((row) => row.partner)] },
    },
  })
  const partnerByName = new Map(partners.map((row) => [row.name, row]))
  const missing = [...sales, ...bills].map((row) => row.partner).filter((name) => !partnerByName.has(name))
  if (missing.length > 0) return

  try {
    await client.$transaction(async (tx) => {
      await tx.account.createMany({
        data: extraAccounts.map(([code, name, type]) => ({ code, name, type, companyId })),
        skipDuplicates: true,
      })
      const accounts = await tx.account.findMany({ where: { companyId } })
      const accountId = new Map(accounts.map((row) => [row.code, row.id]))
      const need = (code: string) => {
        const id = accountId.get(code)
        if (!id) throw new Error(`Account ${code} is missing.`)
        return id
      }
      const journals = await tx.journal.findMany({ where: { companyId } })
      const journalId = new Map(journals.map((row) => [row.code, row.id]))
      const journal = (code: string) => {
        const id = journalId.get(code)
        if (!id) throw new Error(`Journal ${code} is missing.`)
        return id
      }

      const post = async (name: string, code: string, date: string, invoiceId: number | undefined, lines: PostingLine[]) => {
        const debit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0))
        const credit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0))
        if (debit !== credit) throw new Error(`${name} does not balance (${debit} vs ${credit}).`)
        await tx.journalEntry.create({
          data: {
            name,
            journalId: journal(code),
            invoiceId,
            date: on(date),
            companyId,
            lines: {
              create: lines.map((line) => ({
                accountId: line.accountId,
                partnerId: line.partnerId,
                label: line.label,
                debit: line.debit,
                credit: line.credit,
              })),
            },
          },
        })
      }

      for (const row of jiangbeiBooks.pricedSales) {
        const partner = partnerByName.get(row.doc.partner)
        if (!partner) continue
        const invoice = await tx.invoice.create({
          data: {
            name: row.doc.name,
            moveType: 'out_invoice',
            state: row.doc.paid ? 'paid' : 'posted',
            partnerId: partner.id,
            companyId,
            invoiceDate: on(row.doc.date),
            amountUntaxed: row.money.amountUntaxed,
            amountTax: row.money.amountTax,
            amountTotal: row.money.amountTotal,
            residual: row.doc.paid ? 0 : row.money.amountTotal,
            buyerName: partner.name,
            buyerAddress: [partner.street, partner.city].filter(Boolean).join(', '),
            fapiaoType: 'electronic',
            fapiaoStatus: 'ready',
            lines: {
              create: row.money.lines.map((line) => ({
                description: line.description,
                quantity: line.quantity,
                unitPrice: line.unitPrice,
                taxRate: rate,
                subtotal: line.subtotal,
                taxAmount: line.taxAmount,
              })),
            },
            ...(row.doc.paid
              ? { payments: { create: [{ amount: row.money.amountTotal, method: 'bank', paidAt: on(row.doc.date) }] } }
              : {}),
          },
        })
        await post(row.doc.entry, 'SAL', row.doc.date, invoice.id, [
          { accountId: need('1122'), partnerId: partner.id, label: row.doc.name, debit: row.money.amountTotal, credit: 0 },
          { accountId: need('6001'), partnerId: partner.id, label: row.doc.name, debit: 0, credit: row.money.amountUntaxed },
          { accountId: need('222101'), partnerId: partner.id, label: row.doc.name, debit: 0, credit: row.money.amountTax },
        ])
        if (row.doc.paid) {
          await post(row.doc.receiptEntry, 'BNK', row.doc.date, undefined, [
            { accountId: need('1002'), partnerId: partner.id, label: row.doc.name, debit: row.money.amountTotal, credit: 0 },
            { accountId: need('1122'), partnerId: partner.id, label: row.doc.name, debit: 0, credit: row.money.amountTotal },
          ])
        }
        await post(row.doc.costEntry, 'GEN', row.doc.date, undefined, [
          { accountId: need('6401'), label: row.doc.name, debit: row.money.cost, credit: 0 },
          { accountId: need('1405'), label: row.doc.name, debit: 0, credit: row.money.cost },
        ])
      }

      for (const row of jiangbeiBooks.pricedBills) {
        const partner = partnerByName.get(row.doc.partner)
        if (!partner) continue
        const invoice = await tx.invoice.create({
          data: {
            name: row.doc.name,
            moveType: 'in_invoice',
            state: row.doc.paid ? 'paid' : 'posted',
            partnerId: partner.id,
            companyId,
            invoiceDate: on(row.doc.date),
            amountUntaxed: row.money.amountUntaxed,
            amountTax: row.money.amountTax,
            amountTotal: row.money.amountTotal,
            residual: row.doc.paid ? 0 : row.money.amountTotal,
            lines: {
              create: [{
                description: row.doc.description,
                quantity: 1,
                unitPrice: row.money.amountUntaxed,
                taxRate: rate,
                subtotal: row.money.amountUntaxed,
                taxAmount: row.money.amountTax,
              }],
            },
            ...(row.doc.paid
              ? { payments: { create: [{ amount: row.money.amountTotal, method: 'bank', paidAt: on(row.doc.paidOn ?? row.doc.date) }] } }
              : {}),
          },
        })
        await post(row.doc.entry, 'PUR', row.doc.date, invoice.id, [
          { accountId: need('1405'), partnerId: partner.id, label: row.doc.name, debit: row.money.amountUntaxed, credit: 0 },
          { accountId: need('222102'), partnerId: partner.id, label: row.doc.name, debit: row.money.amountTax, credit: 0 },
          { accountId: need('2202'), partnerId: partner.id, label: row.doc.name, debit: 0, credit: row.money.amountTotal },
        ])
        if (row.doc.paid && row.doc.paymentEntry) {
          await post(row.doc.paymentEntry, 'BNK', row.doc.paidOn ?? row.doc.date, undefined, [
            { accountId: need('2202'), partnerId: partner.id, label: row.doc.name, debit: row.money.amountTotal, credit: 0 },
            { accountId: need('1002'), partnerId: partner.id, label: row.doc.name, debit: 0, credit: row.money.amountTotal },
          ])
        }
      }

      for (const row of opex) {
        await post(row.entry, 'BNK', row.date, undefined, [
          { accountId: need(row.account), label: row.label, debit: row.amount, credit: 0 },
          { accountId: need('1002'), label: row.label, debit: 0, credit: row.amount },
        ])
      }
    }, { maxWait: 20000, timeout: 120000 })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
    throw error
  }
}
