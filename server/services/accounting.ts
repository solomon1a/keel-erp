import { roundMoney } from '../../src/domain/money.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'

const invoiceInclude = {
  partner: { select: { id: true, name: true, email: true, city: true, street: true, taxId: true } },
  lines: { orderBy: { id: 'asc' as const } },
  payments: { orderBy: { id: 'asc' as const } },
  salesOrder: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, name: true } },
  posOrder: { select: { id: true, name: true } },
} as const

const chart = [
  ['1001', '库存现金', 'asset'],
  ['1002', '银行存款', 'asset'],
  ['1122', '应收账款', 'asset'],
  ['1405', '库存商品', 'asset'],
  ['2202', '应付账款', 'liability'],
  ['222101', '应交税费-销项税额', 'liability'],
  ['222102', '应交税费-进项税额', 'liability'],
  ['6001', '主营业务收入', 'income'],
  ['6401', '主营业务成本', 'expense'],
] as const

const journals = [
  ['SAL', '销售'],
  ['PUR', '采购'],
  ['BNK', '银行'],
  ['GEN', '杂项'],
] as const

export async function ensureBooks(companyId: number) {
  const existing = await prisma.account.count({ where: { companyId } })
  if (existing > 0) return
  await prisma.account.createMany({
    data: chart.map(([code, name, type]) => ({ code, name, type, companyId })),
  })
  await prisma.journal.createMany({
    data: journals.map(([code, name]) => ({ code, name, companyId })),
  })
  await prisma.sequence.createMany({
    data: [
      { name: `account.out.${companyId}`, next: 0 },
      { name: `account.in.${companyId}`, next: 0 },
      { name: `account.out_refund.${companyId}`, next: 0 },
      { name: `account.in_refund.${companyId}`, next: 0 },
      { name: `account.entry.${companyId}`, next: 0 },
    ],
    skipDuplicates: true,
  })
}

async function nextName(tx: Tx, sequenceName: string, prefix: string) {
  const sequence = await tx.sequence.update({
    where: { name: sequenceName },
    data: { next: { increment: 1 } },
  })
  return `${prefix}${String(sequence.next).padStart(4, '0')}`
}

function prefixFor(moveType: string) {
  switch (moveType) {
    case 'out_invoice':
      return { sequence: 'out', prefix: 'INV' }
    case 'in_invoice':
      return { sequence: 'in', prefix: 'BILL' }
    case 'out_refund':
      return { sequence: 'out_refund', prefix: 'CN' }
    case 'in_refund':
      return { sequence: 'in_refund', prefix: 'DN' }
    default:
      throw new AppError(400, 'Unknown invoice type.')
  }
}

async function accountMap(tx: Tx, companyId: number) {
  const rows = await tx.account.findMany({ where: { companyId } })
  const byCode = new Map(rows.map((row) => [row.code, row]))
  for (const [code] of chart) {
    if (!byCode.has(code)) throw new AppError(500, `Account ${code} is missing.`)
  }
  return byCode
}

type PostingLine = { accountId: number; debit: number; credit: number; label: string }

function postingLines(
  moveType: string,
  accounts: Map<string, { id: number }>,
  untaxed: number,
  tax: number,
  total: number,
  label: string,
): PostingLine[] {
  const id = (code: string) => {
    const account = accounts.get(code)
    if (!account) throw new AppError(500, `Account ${code} is missing.`)
    return account.id
  }
  const row = (code: string, debit: number, credit: number): PostingLine => ({
    accountId: id(code),
    debit: roundMoney(debit),
    credit: roundMoney(credit),
    label,
  })
  let lines: PostingLine[]
  switch (moveType) {
    case 'out_invoice':
      lines = [row('1122', total, 0), row('6001', 0, untaxed), row('222101', 0, tax)]
      break
    case 'out_refund':
      lines = [row('1122', 0, total), row('6001', untaxed, 0), row('222101', tax, 0)]
      break
    case 'in_invoice':
      lines = [row('1405', untaxed, 0), row('222102', tax, 0), row('2202', 0, total)]
      break
    case 'in_refund':
      lines = [row('1405', 0, untaxed), row('222102', 0, tax), row('2202', total, 0)]
      break
    default:
      throw new AppError(400, 'Unknown invoice type.')
  }
  return lines.filter((line) => line.debit !== 0 || line.credit !== 0)
}

async function createDraft(
  tx: Tx,
  companyId: number,
  moveType: string,
  partnerId: number,
  source: { salesOrderId?: number; purchaseOrderId?: number; posOrderId?: number },
  lines: Array<{ description: string; quantity: number; unitPrice: number; taxRate: number; subtotal: number; taxAmount: number }>,
  buyer: { buyerName?: string | null; buyerTaxId?: string | null; buyerAddress?: string | null },
) {
  const amountUntaxed = roundMoney(lines.reduce((sum, line) => sum + line.subtotal, 0))
  const amountTax = roundMoney(lines.reduce((sum, line) => sum + line.taxAmount, 0))
  const amountTotal = roundMoney(amountUntaxed + amountTax)
  const { sequence, prefix } = prefixFor(moveType)
  const name = await nextName(tx, `account.${sequence}.${companyId}`, prefix)
  return tx.invoice.create({
    data: {
      name,
      moveType,
      state: 'draft',
      partnerId,
      companyId,
      invoiceDate: new Date(),
      salesOrderId: source.salesOrderId,
      purchaseOrderId: source.purchaseOrderId,
      posOrderId: source.posOrderId,
      amountUntaxed,
      amountTax,
      amountTotal,
      residual: amountTotal,
      buyerName: buyer.buyerName ?? null,
      buyerTaxId: buyer.buyerTaxId ?? null,
      buyerAddress: buyer.buyerAddress ?? null,
      fapiaoType: moveType.startsWith('out') ? 'electronic' : null,
      fapiaoStatus: 'none',
      lines: { create: lines },
    },
    include: invoiceInclude,
  })
}

async function assertNoInvoice(tx: Tx, where: { salesOrderId?: number; purchaseOrderId?: number; posOrderId?: number }) {
  const existing = await tx.invoice.findFirst({
    where: { ...where, state: { not: 'cancel' } },
  })
  if (existing) throw new AppError(409, `${existing.name} already covers that document.`)
}

export async function invoiceFromSales(companyId: number, orderId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const order = await tx.salesOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: { include: { tax: true } }, customer: true },
    })
    if (!order) throw new AppError(404, 'Order not found.')
    if (order.state !== 'sale' && order.state !== 'done') {
      throw new AppError(409, 'Confirm the sales order before invoicing it.')
    }
    await assertNoInvoice(tx, { salesOrderId: order.id })
    const address = [order.customer.street, order.customer.city].filter(Boolean).join(' ')
    return createDraft(
      tx,
      companyId,
      'out_invoice',
      order.customerId,
      { salesOrderId: order.id },
      order.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.tax?.rate ?? 0,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount,
      })),
      { buyerName: order.customer.name, buyerTaxId: order.customer.taxId, buyerAddress: address || null },
    )
  })
}

export async function invoiceFromPurchase(companyId: number, orderId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: { include: { tax: true } }, vendor: true },
    })
    if (!order) throw new AppError(404, 'Purchase not found.')
    if (order.state !== 'purchase' && order.state !== 'done') {
      throw new AppError(409, 'Confirm the purchase before billing it.')
    }
    await assertNoInvoice(tx, { purchaseOrderId: order.id })
    const address = [order.vendor.street, order.vendor.city].filter(Boolean).join(' ')
    return createDraft(
      tx,
      companyId,
      'in_invoice',
      order.vendorId,
      { purchaseOrderId: order.id },
      order.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitCost,
        taxRate: line.tax?.rate ?? 0,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount,
      })),
      { buyerName: order.vendor.name, buyerTaxId: order.vendor.taxId, buyerAddress: address || null },
    )
  })
}

export async function invoiceFromPos(companyId: number, orderId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const order = await tx.posOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: true, customer: true },
    })
    if (!order) throw new AppError(404, 'Register order not found.')
    if (order.state === 'draft') throw new AppError(409, 'Only a paid register sale can be invoiced.')
    await assertNoInvoice(tx, { posOrderId: order.id })
    let partnerId = order.customerId
    if (!partnerId) {
      const walkIn = await tx.contact.findFirst({ where: { companyId, name: { in: ['Walk-in', '散客'] } } })
      const created = walkIn ?? await tx.contact.create({
        data: { name: 'Walk-in', isCustomer: true, companyId },
      })
      partnerId = created.id
    }
    const partner = await tx.contact.findFirstOrThrow({ where: { id: partnerId } })
    return createDraft(
      tx,
      companyId,
      'out_invoice',
      partnerId,
      { posOrderId: order.id },
      order.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount,
      })),
      { buyerName: partner.name, buyerTaxId: partner.taxId, buyerAddress: partner.city },
    )
  })
}

export async function listInvoices(companyId: number, moveType?: string) {
  await ensureBooks(companyId)
  return prisma.invoice.findMany({
    where: { companyId, ...(moveType ? { moveType } : {}) },
    include: invoiceInclude,
    orderBy: { id: 'desc' },
  })
}

export async function getInvoice(companyId: number, invoiceId: number) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: invoiceInclude,
  })
  if (!invoice) throw new AppError(404, 'Invoice not found.')
  return invoice
}

export async function updateFapiao(
  companyId: number,
  invoiceId: number,
  input: { buyerName: string | null; buyerTaxId: string | null; buyerAddress: string | null; fapiaoNumber: string | null; fapiaoType: string | null },
) {
  const invoice = await getInvoice(companyId, invoiceId)
  if (invoice.state === 'cancel') throw new AppError(409, 'A cancelled invoice cannot be edited.')
  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { ...input, fapiaoStatus: input.fapiaoNumber ? 'ready' : invoice.fapiaoStatus },
    include: invoiceInclude,
  })
}

export async function postInvoice(companyId: number, invoiceId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (invoice.state !== 'draft') throw new AppError(409, 'Only a draft can be posted.')
    const accounts = await accountMap(tx, companyId)
    const journalCode = invoice.moveType.startsWith('in') ? 'PUR' : 'SAL'
    const journal = await tx.journal.findFirstOrThrow({ where: { companyId, code: journalCode } })
    const lines = postingLines(invoice.moveType, accounts, invoice.amountUntaxed, invoice.amountTax, invoice.amountTotal, invoice.name)
    const debit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0))
    const credit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0))
    if (Math.abs(debit - credit) > 0.001) throw new AppError(500, 'The journal entry does not balance.')
    await tx.journalEntry.create({
      data: {
        name: await nextName(tx, `account.entry.${companyId}`, 'JE'),
        journalId: journal.id,
        invoiceId: invoice.id,
        date: invoice.invoiceDate,
        companyId,
        lines: { create: lines.map((line) => ({ ...line, partnerId: invoice.partnerId })) },
      },
    })
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { state: 'posted' },
      include: invoiceInclude,
    })
  })
}

export async function payInvoice(companyId: number, invoiceId: number, amount: number, method: string) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (invoice.state !== 'posted' && invoice.state !== 'paid') {
      throw new AppError(409, 'Post the invoice before recording a payment.')
    }
    const pay = roundMoney(amount)
    if (pay <= 0) throw new AppError(400, 'Payment amount must be greater than zero.')
    if (pay - invoice.residual > 0.001) throw new AppError(400, 'That payment is more than the amount still open.')
    const accounts = await accountMap(tx, companyId)
    const cashAccount = method === 'cash' ? '1001' : '1002'
    const cash = accounts.get(cashAccount)
    const ar = accounts.get('1122')
    const ap = accounts.get('2202')
    if (!cash || !ar || !ap) throw new AppError(500, 'Payment accounts are missing.')
    const label = invoice.name
    const partnerId = invoice.partnerId
    let lines: Array<{ accountId: number; debit: number; credit: number; label: string; partnerId: number }>
    switch (invoice.moveType) {
      case 'out_invoice':
        lines = [
          { accountId: cash.id, debit: pay, credit: 0, label, partnerId },
          { accountId: ar.id, debit: 0, credit: pay, label, partnerId },
        ]
        break
      case 'out_refund':
        lines = [
          { accountId: ar.id, debit: pay, credit: 0, label, partnerId },
          { accountId: cash.id, debit: 0, credit: pay, label, partnerId },
        ]
        break
      case 'in_invoice':
        lines = [
          { accountId: ap.id, debit: pay, credit: 0, label, partnerId },
          { accountId: cash.id, debit: 0, credit: pay, label, partnerId },
        ]
        break
      case 'in_refund':
        lines = [
          { accountId: cash.id, debit: pay, credit: 0, label, partnerId },
          { accountId: ap.id, debit: 0, credit: pay, label, partnerId },
        ]
        break
      default:
        throw new AppError(400, 'Unknown invoice type.')
    }
    const journal = await tx.journal.findFirstOrThrow({ where: { companyId, code: 'BNK' } })
    await tx.journalEntry.create({
      data: {
        name: await nextName(tx, `account.entry.${companyId}`, 'JE'),
        journalId: journal.id,
        invoiceId: invoice.id,
        date: new Date(),
        companyId,
        lines: { create: lines },
      },
    })
    await tx.invoicePayment.create({
      data: { invoiceId: invoice.id, amount: pay, method },
    })
    const residual = roundMoney(invoice.residual - pay)
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { residual, state: residual <= 0.001 ? 'paid' : 'posted' },
      include: invoiceInclude,
    })
  })
}

export async function creditInvoice(companyId: number, invoiceId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { lines: true, partner: true },
    })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (invoice.state === 'draft' || invoice.state === 'cancel') {
      throw new AppError(409, 'Post the invoice before crediting it.')
    }
    if (invoice.moveType.endsWith('refund')) throw new AppError(409, 'A credit note cannot be credited again.')
    const moveType = invoice.moveType === 'out_invoice' ? 'out_refund' : 'in_refund'
    return createDraft(
      tx,
      companyId,
      moveType,
      invoice.partnerId,
      {
        salesOrderId: invoice.salesOrderId ?? undefined,
        purchaseOrderId: invoice.purchaseOrderId ?? undefined,
        posOrderId: invoice.posOrderId ?? undefined,
      },
      invoice.lines.map((line) => ({
        description: line.description,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        subtotal: line.subtotal,
        taxAmount: line.taxAmount,
      })),
      { buyerName: invoice.buyerName, buyerTaxId: invoice.buyerTaxId, buyerAddress: invoice.buyerAddress },
    )
  })
}

export async function cancelInvoice(companyId: number, invoiceId: number) {
  const invoice = await getInvoice(companyId, invoiceId)
  if (invoice.state !== 'draft') throw new AppError(409, 'Only a draft can be cancelled.')
  return prisma.invoice.update({
    where: { id: invoice.id },
    data: { state: 'cancel', residual: 0 },
    include: invoiceInclude,
  })
}

export async function listLedger(companyId: number, accountCode?: string) {
  await ensureBooks(companyId)
  const account = accountCode
    ? await prisma.account.findFirst({ where: { companyId, code: accountCode } })
    : null
  const items = await prisma.journalItem.findMany({
    where: {
      entry: { companyId },
      ...(account ? { accountId: account.id } : {}),
    },
    include: {
      account: { select: { code: true, name: true, type: true } },
      entry: { select: { name: true, date: true, journal: { select: { code: true, name: true } } } },
    },
    orderBy: [{ entry: { date: 'asc' } }, { id: 'asc' }],
  })
  return items
}

function inRange(date: Date, from?: string, to?: string) {
  if (from && date < new Date(`${from}T00:00:00.000Z`)) return false
  if (to && date > new Date(`${to}T23:59:59.999Z`)) return false
  return true
}

export async function profitAndLoss(companyId: number, from?: string, to?: string) {
  await ensureBooks(companyId)
  const items = await prisma.journalItem.findMany({
    where: { entry: { companyId }, account: { type: { in: ['income', 'expense'] } } },
    include: { account: true, entry: { select: { date: true } } },
  })
  const rows = new Map<string, { code: string; name: string; type: string; amount: number }>()
  for (const item of items) {
    if (!inRange(item.entry.date, from, to)) continue
    const current = rows.get(item.account.code) ?? {
      code: item.account.code,
      name: item.account.name,
      type: item.account.type,
      amount: 0,
    }
    const signed = item.account.type === 'income' ? item.credit - item.debit : item.debit - item.credit
    current.amount = roundMoney(current.amount + signed)
    rows.set(item.account.code, current)
  }
  const accounts = [...rows.values()]
  const income = roundMoney(accounts.filter((row) => row.type === 'income').reduce((sum, row) => sum + row.amount, 0))
  const expense = roundMoney(accounts.filter((row) => row.type === 'expense').reduce((sum, row) => sum + row.amount, 0))
  return { accounts, income, expense, profit: roundMoney(income - expense) }
}

export async function balanceSheet(companyId: number, on?: string) {
  await ensureBooks(companyId)
  const items = await prisma.journalItem.findMany({
    where: { entry: { companyId }, account: { type: { in: ['asset', 'liability', 'equity'] } } },
    include: { account: true, entry: { select: { date: true } } },
  })
  const rows = new Map<string, { code: string; name: string; type: string; amount: number }>()
  for (const item of items) {
    if (on && item.entry.date > new Date(`${on}T23:59:59.999Z`)) continue
    const current = rows.get(item.account.code) ?? {
      code: item.account.code,
      name: item.account.name,
      type: item.account.type,
      amount: 0,
    }
    const signed = item.account.type === 'asset' ? item.debit - item.credit : item.credit - item.debit
    current.amount = roundMoney(current.amount + signed)
    rows.set(item.account.code, current)
  }
  const accounts = [...rows.values()].filter((row) => Math.abs(row.amount) > 0.001)
  const assets = roundMoney(accounts.filter((row) => row.type === 'asset').reduce((sum, row) => sum + row.amount, 0))
  const liabilities = roundMoney(accounts.filter((row) => row.type === 'liability').reduce((sum, row) => sum + row.amount, 0))
  const profit = (await profitAndLoss(companyId, undefined, on)).profit
  const equity = roundMoney(profit)
  return { accounts, assets, liabilities, equity, balanced: roundMoney(assets - liabilities - equity) === 0 }
}

export async function vatReport(companyId: number, from?: string, to?: string) {
  await ensureBooks(companyId)
  const invoices = await prisma.invoice.findMany({
    where: { companyId, state: { in: ['posted', 'paid'] } },
  })
  let output = 0
  let input = 0
  for (const invoice of invoices) {
    if (!inRange(invoice.invoiceDate, from, to)) continue
    switch (invoice.moveType) {
      case 'out_invoice':
        output += invoice.amountTax
        break
      case 'out_refund':
        output -= invoice.amountTax
        break
      case 'in_invoice':
        input += invoice.amountTax
        break
      case 'in_refund':
        input -= invoice.amountTax
        break
      default:
        break
    }
  }
  output = roundMoney(output)
  input = roundMoney(input)
  return { output, input, payable: roundMoney(output - input) }
}

export async function listAccounts(companyId: number) {
  await ensureBooks(companyId)
  return prisma.account.findMany({ where: { companyId }, orderBy: { code: 'asc' } })
}
