import { roundMoney } from '../../src/domain/money.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { ensureBooks } from './accounting.ts'
import { readSetting } from './company-settings.ts'
import { ensureAccounts, postEntry } from './journals.ts'
import { allocateKnown } from './number-series.ts'

const paymentInclude = {
  partner: { select: { id: true, name: true } },
  allocations: { include: { invoice: { select: { id: true, name: true, residual: true, state: true } } } },
} as const

function parseDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(400, 'Use a date like 2026-04-30.')
  return new Date(`${value}T00:00:00.000Z`)
}

async function accountByCode(tx: Tx, companyId: number, code: string) {
  const account = await tx.account.findFirst({ where: { companyId, code } })
  if (!account) throw new AppError(400, `Account ${code} is not in this company.`)
  return account
}

export async function listPayments(companyId: number) {
  return prisma.paymentEntry.findMany({
    where: { companyId },
    include: paymentInclude,
    orderBy: { id: 'desc' },
  })
}

export async function createPayment(
  companyId: number,
  input: { kind: 'customer' | 'vendor'; partnerId: number; amount: number; date: string; method: string; memo?: string },
) {
  const partner = await prisma.contact.findFirst({ where: { id: input.partnerId, companyId } })
  if (!partner) throw new AppError(400, 'Choose a partner from this company.')
  if (input.kind === 'customer' && !partner.isCustomer) throw new AppError(400, `${partner.name} is not a customer.`)
  if (input.kind === 'vendor' && !partner.isSupplier) throw new AppError(400, `${partner.name} is not a vendor.`)
  const amount = roundMoney(input.amount)
  if (amount <= 0) throw new AppError(400, 'Amount must be greater than zero.')
  return prisma.$transaction(async (tx) => {
    const name = await allocateKnown(tx, companyId, 'payment.entry')
    return tx.paymentEntry.create({
      data: {
        companyId,
        name,
        kind: input.kind,
        partnerId: partner.id,
        amount,
        unapplied: amount,
        date: parseDay(input.date),
        method: input.method.trim() || 'bank',
        memo: input.memo?.trim() ?? '',
        state: 'draft',
      },
      include: paymentInclude,
    })
  })
}

export async function postPayment(companyId: number, paymentId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const payment = await tx.paymentEntry.findFirst({ where: { id: paymentId, companyId } })
    if (!payment) throw new AppError(404, 'Payment not found.')
    if (payment.state !== 'draft') throw new AppError(409, 'Only a draft payment can be posted.')
    await ensureAccounts(tx, companyId, [
      ['1002', '银行存款', 'asset'],
      ['2249', 'Payment clearing', 'liability'],
    ])
    const bank = await accountByCode(tx, companyId, '1002')
    const clearing = await accountByCode(tx, companyId, '2249')
    const label = payment.name
    const lines = payment.kind === 'customer'
      ? [
          { accountId: bank.id, debit: payment.amount, credit: 0, label, partnerId: payment.partnerId },
          { accountId: clearing.id, debit: 0, credit: payment.amount, label, partnerId: payment.partnerId },
        ]
      : [
          { accountId: clearing.id, debit: payment.amount, credit: 0, label, partnerId: payment.partnerId },
          { accountId: bank.id, debit: 0, credit: payment.amount, label, partnerId: payment.partnerId },
        ]
    const entry = await postEntry(tx, companyId, payment.date, lines, undefined, 'BNK')
    return tx.paymentEntry.update({
      where: { id: payment.id },
      data: { state: 'posted', entryId: entry.id },
      include: paymentInclude,
    })
  }, transactionOptions)
}

export async function allocatePayment(companyId: number, paymentId: number, invoiceId: number, rawAmount: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const payment = await tx.paymentEntry.findFirst({ where: { id: paymentId, companyId } })
    if (!payment) throw new AppError(404, 'Payment not found.')
    if (payment.state !== 'posted') throw new AppError(409, 'Post the payment before allocating it.')
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (invoice.partnerId !== payment.partnerId) throw new AppError(400, 'That document belongs to a different partner.')
    const expected = payment.kind === 'customer' ? 'out_invoice' : 'in_invoice'
    if (invoice.moveType !== expected) throw new AppError(400, 'That document is not open for this payment.')
    if (invoice.state !== 'posted') throw new AppError(409, 'Post the invoice before reconciling a payment.')
    if (invoice.currency) throw new AppError(400, 'Record the payment on the invoice so the exchange rate can be applied.')
    const amount = roundMoney(rawAmount)
    if (amount <= 0) throw new AppError(400, 'Amount must be greater than zero.')
    if (amount - payment.unapplied > 0.001) throw new AppError(400, 'That is more than the payment still has open.')
    if (amount - invoice.residual > 0.001) throw new AppError(400, 'That is more than the invoice still has open.')
    const receivable = await readSetting(tx, companyId, 'accounting', 'receivable', '1122')
    const payable = await readSetting(tx, companyId, 'accounting', 'payable', '2202')
    await ensureAccounts(tx, companyId, [['2249', 'Payment clearing', 'liability']])
    const clearing = await accountByCode(tx, companyId, '2249')
    const control = await accountByCode(tx, companyId, payment.kind === 'customer' ? receivable : payable)
    const label = payment.name
    const lines = payment.kind === 'customer'
      ? [
          { accountId: clearing.id, debit: amount, credit: 0, label, partnerId: payment.partnerId },
          { accountId: control.id, debit: 0, credit: amount, label, partnerId: payment.partnerId },
        ]
      : [
          { accountId: control.id, debit: amount, credit: 0, label, partnerId: payment.partnerId },
          { accountId: clearing.id, debit: 0, credit: amount, label, partnerId: payment.partnerId },
        ]
    const entry = await postEntry(tx, companyId, new Date(), lines, invoice.id, 'BNK')
    await tx.paymentAllocation.create({
      data: { paymentId: payment.id, invoiceId: invoice.id, amount, entryId: entry.id },
    })
    const residual = roundMoney(invoice.residual - amount)
    const next = residual <= 0.001 ? 'paid' : 'posted'
    await tx.invoice.update({ where: { id: invoice.id }, data: { residual, state: next } })
    return tx.paymentEntry.update({
      where: { id: payment.id },
      data: { unapplied: roundMoney(payment.unapplied - amount) },
      include: paymentInclude,
    })
  }, transactionOptions)
}

export async function postManualJournal(
  companyId: number,
  input: { date: string; journal?: string; lines: Array<{ account: string; debit: number; credit: number; label?: string }> },
) {
  if (input.lines.length < 2) throw new AppError(400, 'A journal entry needs at least two lines.')
  const debit = roundMoney(input.lines.reduce((sum, line) => sum + line.debit, 0))
  const credit = roundMoney(input.lines.reduce((sum, line) => sum + line.credit, 0))
  if (Math.abs(debit - credit) > 0.001) throw new AppError(400, 'The journal entry does not balance.')
  await ensureBooks(companyId)
  const code = input.journal?.trim() || 'GEN'
  return prisma.$transaction(async (tx) => {
    const accounts = await tx.account.findMany({ where: { companyId, code: { in: input.lines.map((line) => line.account) } } })
    const byCode = new Map(accounts.map((row) => [row.code, row]))
    const lines = input.lines.map((line) => {
      const account = byCode.get(line.account)
      if (!account) throw new AppError(400, `Account ${line.account} is not in this company.`)
      return { accountId: account.id, debit: line.debit, credit: line.credit, label: line.label?.trim() || 'Journal' }
    })
    return postEntry(tx, companyId, parseDay(input.date), lines, undefined, code)
  }, transactionOptions)
}

export async function trialBalance(companyId: number, on: string) {
  const end = parseDay(on)
  end.setUTCHours(23, 59, 59, 999)
  const items = await prisma.journalItem.findMany({
    where: { entry: { companyId, date: { lte: end } } },
    include: { account: { select: { id: true, code: true, name: true, type: true } } },
  })
  const grouped = new Map<number, { code: string; name: string; type: string; debit: number; credit: number }>()
  for (const item of items) {
    const current = grouped.get(item.accountId) ?? {
      code: item.account.code,
      name: item.account.name,
      type: item.account.type,
      debit: 0,
      credit: 0,
    }
    current.debit = roundMoney(current.debit + item.debit)
    current.credit = roundMoney(current.credit + item.credit)
    grouped.set(item.accountId, current)
  }
  const rows = [...grouped.values()]
    .map((row) => ({ ...row, balance: roundMoney(row.debit - row.credit) }))
    .filter((row) => row.debit !== 0 || row.credit !== 0)
    .sort((a, b) => a.code.localeCompare(b.code))
  const debit = roundMoney(rows.reduce((sum, row) => sum + row.debit, 0))
  const credit = roundMoney(rows.reduce((sum, row) => sum + row.credit, 0))
  return { on, rows, debit, credit, balanced: Math.abs(debit - credit) < 0.001 }
}
