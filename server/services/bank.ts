import { createHash } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { roundMoney } from '../../src/domain/money.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { ensureBooks, payInvoiceTx, reversePaymentTx } from './accounting.ts'
import { ensureAccounts, postEntry } from './journals.ts'

type ParsedLine = { lineDate: Date; label: string; amount: number; reference: string; fingerprint: string }

export type ColumnMapping = {
  date: string
  description: string
  amount?: string
  debit?: string
  credit?: string
  reference?: string
}

function lineFingerprint(date: Date, amount: number, label: string, reference: string) {
  const day = date.toISOString().slice(0, 10)
  return createHash('sha256').update(`${day}|${amount}|${label}|${reference}`).digest('hex').slice(0, 40)
}

function withFingerprint(line: { lineDate: Date; label: string; amount: number; reference?: string }): ParsedLine {
  const reference = line.reference ?? ''
  return { ...line, reference, amount: roundMoney(line.amount), fingerprint: lineFingerprint(line.lineDate, roundMoney(line.amount), line.label, reference) }
}

function parseCsv(csv: string) {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  const parsed = []
  for (const line of rows) {
    const [date, label, amount] = line.split(',').map((cell) => cell.trim())
    if (!date || !label || !amount) throw new AppError(400, 'Each line needs a date, a label, and an amount.')
    if (date.toLowerCase() === 'date') continue
    const when = new Date(date)
    if (Number.isNaN(when.getTime())) throw new AppError(400, `“${date}” is not a date.`)
    const value = Number(amount)
    if (!Number.isFinite(value) || value === 0) throw new AppError(400, 'Amount must be a number other than zero.')
    parsed.push(withFingerprint({ lineDate: when, label, amount: value, reference: '' }))
  }
  if (parsed.length === 0) throw new AppError(400, 'The statement has no lines.')
  return parsed
}

export async function listStatements(companyId: number) {
  return prisma.bankStatement.findMany({
    where: { companyId },
    include: {
      lines: {
        orderBy: { id: 'asc' },
        include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
      },
    },
    orderBy: { id: 'desc' },
  })
}

async function unseenLines(companyId: number, lines: ParsedLine[]) {
  const existing = await prisma.bankStatementLine.findMany({
    where: { companyId, fingerprint: { in: lines.map((line) => line.fingerprint) } },
    select: { fingerprint: true },
  })
  const seen = new Set(existing.map((row) => row.fingerprint).filter((value) => value.length > 0))
  const fresh: ParsedLine[] = []
  for (const line of lines) {
    if (seen.has(line.fingerprint)) continue
    seen.add(line.fingerprint)
    fresh.push(line)
  }
  return fresh
}

async function storeStatement(
  companyId: number,
  name: string,
  lines: ParsedLine[],
  bankAccountId?: number | null,
  openingBalance?: number,
) {
  const fresh = await unseenLines(companyId, lines)
  if (fresh.length === 0) throw new AppError(409, 'Every line in that file is already on a statement.')
  if (bankAccountId) {
    const account = await prisma.bankAccount.findFirst({ where: { id: bankAccountId, companyId } })
    if (!account) throw new AppError(404, 'Bank account not found.')
  }
  try {
    return await prisma.bankStatement.create({
      data: {
        companyId,
        bankAccountId: bankAccountId ?? null,
        name: name.trim(),
        statementDate: fresh[0]?.lineDate ?? new Date(),
        openingBalance: openingBalance ?? 0,
        lines: { create: fresh.map((line) => ({ ...line, companyId })) },
      },
      include: { lines: true },
    })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(409, 'A statement with that name is already on this desk.')
    }
    throw error
  }
}

export async function importStatement(companyId: number, name: string, csv: string) {
  return storeStatement(companyId, name, parseCsv(csv))
}

function directionFits(amount: number, moveType: string) {
  const moneyIn = amount >= 0
  switch (moveType) {
    case 'out_invoice':
    case 'in_refund':
      return moneyIn
    case 'in_invoice':
    case 'out_refund':
      return !moneyIn
    default:
      return false
  }
}

export async function reconcileLine(companyId: number, lineId: number, invoiceId: number, amount: number) {
  await ensureBooks(companyId)
  const pay = roundMoney(amount)
  if (pay <= 0) throw new AppError(400, 'Payment amount must be greater than zero.')
  return prisma.$transaction(async (tx) => {
    const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId } })
    if (!line) throw new AppError(404, 'That statement line is not in this company.')
    const open = roundMoney(Math.abs(line.amount) - line.reconciled)
    if (pay - open > 0.001) throw new AppError(400, 'That amount is more than the statement line still open.')
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (!directionFits(line.amount, invoice.moveType)) {
      throw new AppError(400, 'That statement line does not match this invoice.')
    }
    await payInvoiceTx(tx, companyId, invoice.id, pay, 'bank')
    await tx.reconcileMatch.create({
      data: { lineId: line.id, invoiceId: invoice.id, companyId, amount: pay },
    })
    return tx.bankStatementLine.update({
      where: { id: line.id },
      data: { reconciled: roundMoney(line.reconciled + pay) },
      include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
    })
  })
}

export async function unreconcileLine(companyId: number, lineId: number, invoiceId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const match = await tx.reconcileMatch.findFirst({ where: { lineId, invoiceId, companyId } })
    if (!match) throw new AppError(404, 'That match is not on this statement line.')
    const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId } })
    if (!line) throw new AppError(404, 'That statement line is not in this company.')
    if (match.kind === 'payment') await reversePaymentTx(tx, companyId, invoiceId, match.amount)
    await tx.reconcileMatch.delete({ where: { id: match.id } })
    return tx.bankStatementLine.update({
      where: { id: line.id },
      data: { reconciled: roundMoney(Math.max(0, line.reconciled - match.amount)) },
      include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
    })
  })
}

export async function setLockDates(companyId: number, lockDate: string | null, taxLockDate: string | null) {
  const parse = (value: string | null) => {
    if (!value) return null
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) throw new AppError(400, 'Enter a valid date.')
    return date
  }
  return prisma.company.update({
    where: { id: companyId },
    data: { lockDate: parse(lockDate), taxLockDate: parse(taxLockDate) },
    select: { lockDate: true, taxLockDate: true },
  })
}

export async function getLockDates(companyId: number) {
  return prisma.company.findUniqueOrThrow({
    where: { id: companyId },
    select: { lockDate: true, taxLockDate: true },
  })
}

function splitCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  cells.push(current.trim())
  return cells
}

function headerIndex(headers: string[], name: string | undefined) {
  if (!name) return -1
  const wanted = name.trim().toLowerCase()
  return headers.findIndex((header) => header.trim().toLowerCase() === wanted)
}

export function parseMappedCsv(csv: string, mapping: ColumnMapping): ParsedLine[] {
  const rows = csv.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
  if (rows.length < 2) throw new AppError(400, 'The statement needs a header and at least one line.')
  const headers = splitCsvLine(rows[0] ?? '')
  const dateAt = headerIndex(headers, mapping.date)
  const labelAt = headerIndex(headers, mapping.description)
  const amountAt = headerIndex(headers, mapping.amount)
  const debitAt = headerIndex(headers, mapping.debit)
  const creditAt = headerIndex(headers, mapping.credit)
  const referenceAt = headerIndex(headers, mapping.reference)
  if (dateAt < 0 || labelAt < 0) throw new AppError(400, 'Map a date column and a description column.')
  if (amountAt < 0 && debitAt < 0 && creditAt < 0) throw new AppError(400, 'Map an amount column, or debit and credit columns.')
  const parsed: ParsedLine[] = []
  for (const row of rows.slice(1)) {
    const cells = splitCsvLine(row)
    const date = cells[dateAt] ?? ''
    const label = cells[labelAt] ?? ''
    const when = new Date(date)
    if (!label || Number.isNaN(when.getTime())) throw new AppError(400, `“${date || label}” is not a complete statement line.`)
    let amount = 0
    if (amountAt >= 0 && cells[amountAt]) amount = Number(cells[amountAt])
    else amount = Number(cells[creditAt] || 0) - Number(cells[debitAt] || 0)
    if (!Number.isFinite(amount) || amount === 0) throw new AppError(400, 'Amount must be a number other than zero.')
    parsed.push(withFingerprint({ lineDate: when, label, amount, reference: referenceAt >= 0 ? cells[referenceAt] ?? '' : '' }))
  }
  if (parsed.length === 0) throw new AppError(400, 'The statement has no lines.')
  return parsed
}

function ofxValue(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`))
  return match?.[1]?.trim() ?? ''
}

export function parseOfx(ofx: string): ParsedLine[] {
  const blocks = ofx.split(/<STMTTRN>/i).slice(1)
  if (blocks.length === 0) throw new AppError(400, 'That OFX file has no statement lines.')
  const parsed: ParsedLine[] = []
  for (const block of blocks) {
    const posted = ofxValue(block, 'DTPOSTED')
    const day = posted.slice(0, 8)
    const when = new Date(`${day.slice(0, 4)}-${day.slice(4, 6)}-${day.slice(6, 8)}`)
    const amount = Number(ofxValue(block, 'TRNAMT'))
    const label = ofxValue(block, 'NAME') || ofxValue(block, 'MEMO') || 'Bank line'
    const reference = ofxValue(block, 'FITID') || ofxValue(block, 'MEMO')
    if (Number.isNaN(when.getTime()) || !Number.isFinite(amount) || amount === 0) {
      throw new AppError(400, 'An OFX line is missing a date or an amount.')
    }
    parsed.push(withFingerprint({ lineDate: when, label, amount, reference }))
  }
  return parsed
}

export async function importMapped(
  companyId: number,
  name: string,
  body: { csv?: string; ofx?: string; mapping?: ColumnMapping; bankAccountId?: number | null; openingBalance?: number },
) {
  const lines = body.ofx ? parseOfx(body.ofx) : parseMappedCsv(body.csv ?? '', body.mapping ?? { date: 'date', description: 'description', amount: 'amount' })
  return storeStatement(companyId, name, lines, body.bankAccountId, body.openingBalance)
}

export async function listBankAccounts(companyId: number) {
  return prisma.bankAccount.findMany({ where: { companyId }, orderBy: { name: 'asc' } })
}

export async function createBankAccount(companyId: number, name: string, accountCode: string, currency: string) {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } })
  return prisma.bankAccount.create({
    data: { companyId, name: name.trim(), accountCode: accountCode.trim() || '1002', currency: currency || company.currency },
  })
}

export async function listRules(companyId: number) {
  return prisma.reconcileRule.findMany({ where: { companyId }, orderBy: { name: 'asc' } })
}

export async function createRule(
  companyId: number,
  input: { name: string; matchText: string; action: string; accountCode: string },
) {
  const action = entryAction(input.action)
  return prisma.reconcileRule.create({
    data: {
      companyId,
      name: input.name.trim(),
      matchKind: 'contains',
      matchText: input.matchText.trim(),
      action,
      accountCode: input.accountCode.trim(),
    },
  })
}

type Suggestion = {
  kind: 'invoice' | 'payment' | 'rule'
  invoiceId?: number
  invoiceName?: string
  partner?: string
  amount: number
  score: number
  action?: string
  accountCode?: string
  label: string
}

function suggestFor(
  line: { label: string; reference: string; amount: number },
  invoices: Array<{ id: number; name: string; moveType: string; residual: number; partner: { name: string } }>,
  payments: Array<{ amount: number; invoice: { id: number; name: string; moveType: string; residual: number; partner: { name: string } } }>,
  rules: Array<{ name: string; matchKind: string; matchText: string; action: string; accountCode: string }>,
): Suggestion[] {
  const text = `${line.label} ${line.reference}`.toLowerCase()
  const found: Suggestion[] = []
  for (const rule of rules) {
    if (rule.matchKind === 'contains' && rule.matchText && text.includes(rule.matchText.toLowerCase())) {
      found.push({
        kind: 'rule',
        amount: roundMoney(Math.abs(line.amount)),
        score: 90,
        action: rule.action,
        accountCode: rule.accountCode,
        label: rule.name,
      })
    }
  }
  for (const invoice of invoices) {
    if (!directionFits(line.amount, invoice.moveType) || invoice.residual <= 0.001) continue
    const refHit = line.reference === invoice.name || text.includes(invoice.name.toLowerCase())
    const partnerHit = text.includes(invoice.partner.name.toLowerCase())
    const amountHit = Math.abs(Math.abs(line.amount) - invoice.residual) < 0.02
    if (!(refHit || (partnerHit && amountHit))) continue
    const amount = roundMoney(Math.min(Math.abs(line.amount), invoice.residual))
    found.push({
      kind: 'invoice',
      invoiceId: invoice.id,
      invoiceName: invoice.name,
      partner: invoice.partner.name,
      amount,
      score: (refHit ? 40 : 0) + (amountHit ? 30 : 0) + (partnerHit ? 20 : 0),
      label: amountHit ? invoice.name : `${invoice.name} partial`,
    })
  }
  for (const payment of payments) {
    const invoice = payment.invoice
    if (invoice.residual > 0.001 || !directionFits(line.amount, invoice.moveType)) continue
    const amountHit = Math.abs(Math.abs(line.amount) - payment.amount) < 0.02
    const refHit = line.reference === invoice.name || text.includes(invoice.name.toLowerCase())
    const partnerHit = text.includes(invoice.partner.name.toLowerCase())
    if (!amountHit || !(refHit || partnerHit)) continue
    found.push({
      kind: 'payment',
      invoiceId: invoice.id,
      invoiceName: invoice.name,
      partner: invoice.partner.name,
      amount: roundMoney(payment.amount),
      score: 75,
      label: `${invoice.name} already paid`,
    })
  }
  return found.sort((left, right) => right.score - left.score).slice(0, 4)
}

async function bookBalance(companyId: number, accountCode: string) {
  const account = await prisma.account.findFirst({ where: { companyId, code: accountCode } })
  if (!account) return 0
  const lines = await prisma.journalItem.findMany({ where: { accountId: account.id }, select: { debit: true, credit: true } })
  return roundMoney(lines.reduce((sum, line) => sum + line.debit - line.credit, 0))
}

export async function statementDetail(companyId: number, statementId: number) {
  const statement = await prisma.bankStatement.findFirst({
    where: { id: statementId, companyId },
    include: {
      bankAccount: true,
      lines: {
        orderBy: { id: 'asc' },
        include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
      },
    },
  })
  if (!statement) throw new AppError(404, 'Statement not found.')
  const invoices = await prisma.invoice.findMany({
    where: { companyId, state: { in: ['posted', 'paid'] } },
    include: { partner: { select: { name: true } } },
  })
  const payments = await prisma.invoicePayment.findMany({
    where: { invoice: { companyId } },
    include: { invoice: { include: { partner: { select: { name: true } } } } },
  })
  const rules = await prisma.reconcileRule.findMany({ where: { companyId } })
  const suggestions: Record<number, Suggestion[]> = {}
  for (const line of statement.lines) {
    const open = roundMoney(Math.abs(line.amount) - line.reconciled)
    suggestions[line.id] = open > 0.001 ? suggestFor(line, invoices, payments, rules) : []
  }
  const accountCode = statement.bankAccount?.accountCode ?? '1002'
  const statementBalance = roundMoney(statement.openingBalance + statement.lines.reduce((sum, line) => sum + line.amount, 0))
  const books = await bookBalance(companyId, accountCode)
  return {
    statement,
    suggestions,
    bookBalance: books,
    statementBalance,
    difference: roundMoney(statementBalance - books),
  }
}

function entryAction(value: string): 'expense' | 'fee' | 'transfer' {
  switch (value) {
    case 'expense':
    case 'fee':
    case 'transfer':
      return value
    default:
      throw new AppError(400, 'Choose an expense, a bank fee, or a transfer.')
  }
}

async function postBankEntry(tx: Tx, companyId: number, label: string, amount: number, moneyOut: boolean, action: 'expense' | 'fee' | 'transfer', accountCode: string) {
  const code = action === 'fee' ? accountCode || '6607' : accountCode
  await ensureAccounts(tx, companyId, [
    ['1001', 'Cash', 'asset'],
    ['1002', 'Bank', 'asset'],
    ['6607', 'Bank charges', 'expense'],
  ])
  if (action === 'transfer') {
    const debit = moneyOut ? '1001' : '1002'
    const credit = moneyOut ? '1002' : '1001'
    const accounts = await tx.account.findMany({ where: { companyId, code: { in: [debit, credit] } } })
    const byCode = new Map(accounts.map((row) => [row.code, row]))
    const debitAccount = byCode.get(debit)
    const creditAccount = byCode.get(credit)
    if (!debitAccount || !creditAccount) throw new AppError(500, 'Cash or bank is missing.')
    return postEntry(tx, companyId, new Date(), [
      { accountId: debitAccount.id, debit: amount, credit: 0, label },
      { accountId: creditAccount.id, debit: 0, credit: amount, label },
    ])
  }
  const expense = await tx.account.findFirst({ where: { companyId, code } })
  const bank = await tx.account.findFirst({ where: { companyId, code: '1002' } })
  if (!expense || !bank) throw new AppError(400, `Account ${code} is not on this company's chart.`)
  const debitAccount = moneyOut ? expense.id : bank.id
  const creditAccount = moneyOut ? bank.id : expense.id
  return postEntry(tx, companyId, new Date(), [
    { accountId: debitAccount, debit: amount, credit: 0, label },
    { accountId: creditAccount, debit: 0, credit: amount, label },
  ])
}

export async function applyLine(
  companyId: number,
  lineId: number,
  input: { kind: 'invoice' | 'payment' | 'rule'; invoiceId?: number; amount?: number; action?: string; accountCode?: string },
) {
  if (input.kind === 'invoice') {
    if (!input.invoiceId || input.amount == null) throw new AppError(400, 'Choose an invoice and an amount.')
    return reconcileLine(companyId, lineId, input.invoiceId, input.amount)
  }
  const kind = input.kind
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const line = await tx.bankStatementLine.findFirst({ where: { id: lineId, companyId } })
    if (!line) throw new AppError(404, 'That statement line is not in this company.')
    const open = roundMoney(Math.abs(line.amount) - line.reconciled)
    switch (kind) {
      case 'payment': {
        if (!input.invoiceId) throw new AppError(400, 'Choose the payment to clear.')
        const amount = roundMoney(input.amount ?? open)
        if (amount - open > 0.001) throw new AppError(400, 'That amount is more than the statement line still open.')
        await tx.reconcileMatch.create({
          data: { lineId: line.id, invoiceId: input.invoiceId, companyId, amount, kind: 'link' },
        })
        return tx.bankStatementLine.update({
          where: { id: line.id },
          data: { reconciled: roundMoney(line.reconciled + amount) },
          include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
        })
      }
      case 'rule':
        break
      default: {
        const neverKind: never = kind
        throw new AppError(400, `Unknown match ${String(neverKind)}.`)
      }
    }
    const action = entryAction(input.action ?? 'fee')
    const entry = await postBankEntry(tx, companyId, line.label, open, line.amount < 0, action, input.accountCode ?? '6607')
    await tx.reconcileMatch.create({
      data: { lineId: line.id, companyId, amount: open, kind: 'entry', entryId: entry.id },
    })
    return tx.bankStatementLine.update({
      where: { id: line.id },
      data: { reconciled: roundMoney(line.reconciled + open) },
      include: { matches: { include: { invoice: { select: { id: true, name: true } } } } },
    })
  })
}
