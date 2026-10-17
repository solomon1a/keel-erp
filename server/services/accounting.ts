import { lineAmounts, roundMoney } from '../../src/domain/money.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { assertYearOpen, ensureCompanyFrame } from './books.ts'
import { assertBooksOpen } from './locks.ts'
import { applyQuant, companyLocations, roundQty, warehouseStockLocation } from './stock.ts'
import { valueDoneMove } from './valuation.ts'
import { guardWorkflow } from './workflow.ts'

const invoiceInclude = {
  partner: { select: { id: true, name: true, email: true, city: true, street: true, taxId: true } },
  lines: { orderBy: { id: 'asc' as const } },
  payments: { orderBy: { id: 'asc' as const } },
  salesOrder: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, name: true } },
  posOrder: { select: { id: true, name: true } },
  reversalOf: { select: { id: true, name: true } },
  reversals: { select: { id: true, name: true, moveType: true, state: true } },
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
  ['3103', 'Retained earnings', 'equity'],
  ['6051', 'Other income', 'income'],
  ['6402', 'Operating charges', 'expense'],
  ['1409', 'Landed cost clearing', 'liability'],
] as const

const journals = [
  ['SAL', '销售'],
  ['PUR', '采购'],
  ['BNK', '银行'],
  ['GEN', '杂项'],
] as const

const booksReady = new Set<number>()

export function forgetBooks(companyId?: number) {
  if (companyId === undefined) booksReady.clear()
  else booksReady.delete(companyId)
}

function sequenceNames(companyId: number) {
  return [
    `account.out.${companyId}`,
    `account.in.${companyId}`,
    `account.out_refund.${companyId}`,
    `account.in_refund.${companyId}`,
    `account.entry.${companyId}`,
  ]
}

export async function ensureBooks(companyId: number) {
  if (booksReady.has(companyId)) return
  const names = sequenceNames(companyId)
  const [accounts, journalRows, sequences] = await Promise.all([
    prisma.account.findMany({ where: { companyId }, select: { code: true } }),
    prisma.journal.findMany({ where: { companyId }, select: { code: true } }),
    prisma.sequence.findMany({ where: { name: { in: names } }, select: { name: true } }),
  ])
  const haveAccounts = new Set(accounts.map((row) => row.code))
  const missingAccounts = chart.filter(([code]) => !haveAccounts.has(code))
  const haveJournals = new Set(journalRows.map((row) => row.code))
  const missingJournals = journals.filter(([code]) => !haveJournals.has(code))
  const haveSequences = new Set(sequences.map((row) => row.name))
  const missingSequences = names.filter((name) => !haveSequences.has(name))
  await Promise.all([
    missingAccounts.length > 0
      ? prisma.account.createMany({
          data: missingAccounts.map(([code, name, type]) => ({ code, name, type, companyId })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    missingJournals.length > 0
      ? prisma.journal.createMany({
          data: missingJournals.map(([code, name]) => ({ code, name, companyId })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    missingSequences.length > 0
      ? prisma.sequence.createMany({
          data: missingSequences.map((name) => ({ name, next: 0 })),
          skipDuplicates: true,
        })
      : Promise.resolve(),
    ensureCompanyFrame(prisma, companyId),
  ])
  booksReady.add(companyId)
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
  charge: number,
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
      lines = [row('1122', total, 0), row('6001', 0, untaxed), row('222101', 0, tax), row('6051', 0, charge)]
      break
    case 'out_refund':
      lines = [row('1122', 0, total), row('6001', untaxed, 0), row('222101', tax, 0), row('6051', charge, 0)]
      break
    case 'in_invoice':
      lines = [row('1405', untaxed, 0), row('222102', tax, 0), row('6402', charge, 0), row('2202', 0, total)]
      break
    case 'in_refund':
      lines = [row('1405', 0, untaxed), row('222102', 0, tax), row('6402', 0, charge), row('2202', total, 0)]
      break
    default:
      throw new AppError(400, 'Unknown invoice type.')
  }
  return lines.filter((line) => line.debit !== 0 || line.credit !== 0)
}

type DraftLine = {
  description: string
  quantity: number
  unitPrice: number
  taxRate: number
  subtotal: number
  taxAmount: number
  salesOrderLineId?: number
  purchaseOrderLineId?: number
}

async function createDraft(
  tx: Tx,
  companyId: number,
  moveType: string,
  partnerId: number,
  source: { salesOrderId?: number; purchaseOrderId?: number; posOrderId?: number; reversalOfId?: number },
  lines: DraftLine[],
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
      reversalOfId: source.reversalOfId,
      amountUntaxed,
      amountTax,
      amountTotal,
      residual: amountTotal,
      buyerName: buyer.buyerName ?? null,
      buyerTaxId: buyer.buyerTaxId ?? null,
      buyerAddress: buyer.buyerAddress ?? null,
      fapiaoType: moveType.startsWith('out') ? 'electronic' : null,
      fapiaoStatus: 'none',
      lines: {
        create: lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: line.taxRate,
          subtotal: line.subtotal,
          taxAmount: line.taxAmount,
          salesOrderLineId: line.salesOrderLineId,
          purchaseOrderLineId: line.purchaseOrderLineId,
        })),
      },
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

async function legacyCover(tx: Tx, where: { salesOrderId?: number; purchaseOrderId?: number }, lineKey: 'salesOrderLineId' | 'purchaseOrderLineId') {
  const existing = await tx.invoice.findMany({
    where: { ...where, state: { not: 'cancel' } },
    include: { lines: true },
  })
  const legacy = existing.find((invoice) => invoice.lines.length === 0 || invoice.lines.some((line) => !line[lineKey]))
  if (legacy) throw new AppError(409, `${legacy.name} already covers that document.`)
}

export async function invoiceFromSales(
  companyId: number,
  orderId: number,
  requested?: Array<{ lineId: number; quantity: number }>,
) {
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
    await legacyCover(tx, { salesOrderId: order.id }, 'salesOrderLineId')
    const asked = new Map((requested ?? []).map((row) => [row.lineId, row.quantity]))
    if (requested && requested.length === 0) throw new AppError(400, 'Enter a quantity to bill.')
    const bill: DraftLine[] = []
    for (const line of order.lines) {
      const open = roundQty(line.quantity - line.qtyInvoiced)
      if (!requested && open <= 0.0001) continue
      if (requested && !asked.has(line.id)) continue
      const quantity = roundQty(requested ? asked.get(line.id) ?? 0 : open)
      if (quantity <= 0) throw new AppError(400, 'Quantity must be greater than zero.')
      if (quantity - open > 0.0001) throw new AppError(400, 'You cannot bill more than the open quantity.')
      const amounts = lineAmounts({
        quantity,
        unitPrice: line.unitPrice,
        discount: line.discount,
        taxRate: line.tax?.rate ?? 0,
      })
      bill.push({
        description: line.description,
        quantity,
        unitPrice: line.unitPrice,
        taxRate: line.tax?.rate ?? 0,
        subtotal: amounts.subtotal,
        taxAmount: amounts.taxAmount,
        salesOrderLineId: line.id,
      })
      await tx.salesOrderLine.update({
        where: { id: line.id },
        data: { qtyInvoiced: roundQty(line.qtyInvoiced + quantity) },
      })
    }
    if (bill.length === 0) throw new AppError(409, 'Nothing left to bill.')
    const address = [order.customer.street, order.customer.city].filter(Boolean).join(' ')
    const invoice = await createDraft(
      tx,
      companyId,
      'out_invoice',
      order.customerId,
      { salesOrderId: order.id },
      bill,
      { buyerName: order.customer.name, buyerTaxId: order.customer.taxId, buyerAddress: address || null },
    )
    await tx.chatterMessage.create({
      data: {
        companyId,
        model: 'sale.order',
        recordId: order.id,
        kind: 'note',
        summary: `Invoice ${invoice.name} created.`,
      },
    })
    return invoice
  })
}

export async function invoiceFromPurchase(
  companyId: number,
  orderId: number,
  requested?: Array<{ lineId: number; quantity: number }>,
) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const order = await tx.purchaseOrder.findFirst({
      where: { id: orderId, companyId },
      include: { lines: { include: { tax: true, product: true } }, vendor: true },
    })
    if (!order) throw new AppError(404, 'Purchase not found.')
    if (order.state !== 'purchase' && order.state !== 'done') {
      throw new AppError(409, 'Confirm the purchase before billing it.')
    }
    await legacyCover(tx, { purchaseOrderId: order.id }, 'purchaseOrderLineId')
    const asked = new Map((requested ?? []).map((row) => [row.lineId, row.quantity]))
    if (requested && requested.length === 0) throw new AppError(400, 'Enter a quantity to bill.')
    const bill: DraftLine[] = []
    for (const line of order.lines) {
      const cap = line.product.type === 'product'
        ? roundQty(line.qtyReceived - line.qtyBilled)
        : roundQty(line.quantity - line.qtyBilled)
      if (!requested && cap <= 0.0001) continue
      if (requested && !asked.has(line.id)) continue
      const quantity = roundQty(requested ? asked.get(line.id) ?? 0 : cap)
      if (quantity <= 0) throw new AppError(400, 'Quantity must be greater than zero.')
      if (quantity - cap > 0.0001) throw new AppError(409, 'Receive the goods before billing.')
      const amounts = lineAmounts({
        quantity,
        unitPrice: line.unitCost,
        discount: 0,
        taxRate: line.tax?.rate ?? 0,
      })
      bill.push({
        description: line.description,
        quantity,
        unitPrice: line.unitCost,
        taxRate: line.tax?.rate ?? 0,
        subtotal: amounts.subtotal,
        taxAmount: amounts.taxAmount,
        purchaseOrderLineId: line.id,
      })
      await tx.purchaseOrderLine.update({
        where: { id: line.id },
        data: { qtyBilled: roundQty(line.qtyBilled + quantity) },
      })
    }
    if (bill.length === 0) throw new AppError(409, 'Receive the goods before billing.')
    const address = [order.vendor.street, order.vendor.city].filter(Boolean).join(' ')
    const invoice = await createDraft(
      tx,
      companyId,
      'in_invoice',
      order.vendorId,
      { purchaseOrderId: order.id },
      bill,
      { buyerName: order.vendor.name, buyerTaxId: order.vendor.taxId, buyerAddress: address || null },
    )
    await tx.chatterMessage.create({
      data: {
        companyId,
        model: 'purchase.order',
        recordId: order.id,
        kind: 'note',
        summary: `Bill ${invoice.name} created.`,
      },
    })
    return invoice
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
    select: {
      id: true,
      name: true,
      moveType: true,
      state: true,
      invoiceDate: true,
      amountTotal: true,
      partner: { select: { name: true } },
    },
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

export async function postInvoiceTx(tx: Tx, companyId: number, invoiceId: number) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
  if (!invoice) throw new AppError(404, 'Invoice not found.')
  if (invoice.state !== 'draft') throw new AppError(409, 'Only a draft can be posted.')
  await assertBooksOpen(tx, companyId, invoice.invoiceDate, Math.abs(invoice.amountTax) > 0.001)
  await assertYearOpen(tx, companyId, invoice.invoiceDate)
  await guardWorkflow(tx, {
    companyId,
    model: 'account.move',
    recordId: invoice.id,
    from: invoice.state,
    to: 'posted',
    label: invoice.name,
  })
  const accounts = await accountMap(tx, companyId)
  const journalCode = invoice.moveType.startsWith('in') ? 'PUR' : 'SAL'
  const journal = await tx.journal.findFirstOrThrow({ where: { companyId, code: journalCode } })
  const lines = postingLines(
    invoice.moveType,
    accounts,
    invoice.amountUntaxed,
    invoice.amountTax,
    invoice.amountTotal,
    invoice.chargeAmount,
    invoice.name,
  )
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
      lines: { create: lines.map((line) => ({ ...line, partnerId: invoice.partnerId, costCentreId: invoice.costCentreId })) },
    },
  })
  return tx.invoice.update({
    where: { id: invoice.id },
    data: { state: 'posted' },
    include: invoiceInclude,
  })
}

export async function postInvoice(companyId: number, invoiceId: number) {
  await ensureBooks(companyId)
  return prisma.$transaction((tx) => postInvoiceTx(tx, companyId, invoiceId))
}

export async function payInvoice(companyId: number, invoiceId: number, amount: number, method: string) {
  await ensureBooks(companyId)
  return prisma.$transaction((tx) => payInvoiceTx(tx, companyId, invoiceId, amount, method))
}

export async function payInvoiceTx(tx: Tx, companyId: number, invoiceId: number, amount: number, method: string) {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (invoice.state !== 'posted' && invoice.state !== 'paid') {
      throw new AppError(409, 'Post the invoice before recording a payment.')
    }
    await assertBooksOpen(tx, companyId, new Date(), false)
    await assertYearOpen(tx, companyId, new Date())
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
    const next = residual <= 0.001 ? 'paid' : 'posted'
    await guardWorkflow(tx, {
      companyId,
      model: 'account.move',
      recordId: invoice.id,
      from: invoice.state,
      to: next,
      label: invoice.name,
    })
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { residual, state: next },
      include: invoiceInclude,
    })
}

export async function reversePaymentTx(tx: Tx, companyId: number, invoiceId: number, amount: number) {
  const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
  if (!invoice) throw new AppError(404, 'Invoice not found.')
  const pay = roundMoney(amount)
  if (pay <= 0) throw new AppError(400, 'Payment amount must be greater than zero.')
  await assertYearOpen(tx, companyId, new Date())
  const accounts = await accountMap(tx, companyId)
  const cash = accounts.get('1002')
  const ar = accounts.get('1122')
  const ap = accounts.get('2202')
  if (!cash || !ar || !ap) throw new AppError(500, 'Payment accounts are missing.')
  const label = `${invoice.name} reversal`
  const partnerId = invoice.partnerId
  let lines: Array<{ accountId: number; debit: number; credit: number; label: string; partnerId: number }>
  switch (invoice.moveType) {
    case 'out_invoice':
      lines = [
        { accountId: ar.id, debit: pay, credit: 0, label, partnerId },
        { accountId: cash.id, debit: 0, credit: pay, label, partnerId },
      ]
      break
    case 'out_refund':
      lines = [
        { accountId: cash.id, debit: pay, credit: 0, label, partnerId },
        { accountId: ar.id, debit: 0, credit: pay, label, partnerId },
      ]
      break
    case 'in_invoice':
      lines = [
        { accountId: cash.id, debit: pay, credit: 0, label, partnerId },
        { accountId: ap.id, debit: 0, credit: pay, label, partnerId },
      ]
      break
    case 'in_refund':
      lines = [
        { accountId: ap.id, debit: pay, credit: 0, label, partnerId },
        { accountId: cash.id, debit: 0, credit: pay, label, partnerId },
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
  const payment = await tx.invoicePayment.findFirst({ where: { invoiceId: invoice.id, amount: pay }, orderBy: { id: 'desc' } })
  if (payment) await tx.invoicePayment.delete({ where: { id: payment.id } })
  const residual = roundMoney(invoice.residual + pay)
  const next = residual <= 0.001 ? 'paid' : 'posted'
  if (next !== invoice.state) {
    await guardWorkflow(tx, {
      companyId,
      model: 'account.move',
      recordId: invoice.id,
      from: invoice.state,
      to: next,
      label: invoice.name,
    })
  }
  return tx.invoice.update({
    where: { id: invoice.id },
    data: { residual, state: next },
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

export async function returnGoods(
  companyId: number,
  invoiceId: number,
  requested?: Array<{ lineId: number; quantity: number }>,
) {
  await ensureBooks(companyId)
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: {
        lines: { include: { salesOrderLine: { include: { product: true } }, purchaseOrderLine: { include: { product: true } } } },
        partner: true,
        salesOrder: true,
        purchaseOrder: true,
      },
    })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (invoice.state !== 'posted' && invoice.state !== 'paid') {
      throw new AppError(409, 'Post the invoice before returning goods.')
    }
    if (invoice.moveType !== 'out_invoice' && invoice.moveType !== 'in_invoice') {
      throw new AppError(409, 'A credit note cannot be returned again.')
    }
    const prior = await tx.invoice.findMany({
      where: { reversalOfId: invoice.id, state: { not: 'cancel' } },
      include: { lines: true },
    })
    const returnedFor = (lineId: number, key: 'salesOrderLineId' | 'purchaseOrderLineId') =>
      prior.reduce((sum, note) => sum + note.lines.filter((line) => line[key] === lineId).reduce((inner, line) => inner + line.quantity, 0), 0)
    const asked = new Map((requested ?? []).map((row) => [row.lineId, row.quantity]))
    const key = invoice.moveType === 'out_invoice' ? 'salesOrderLineId' : 'purchaseOrderLineId'
    const bill: DraftLine[] = []
    for (const line of invoice.lines) {
      const linkId = line[key]
      const open = roundQty(line.quantity - (linkId ? returnedFor(linkId, key) : 0))
      if (!requested && open <= 0.0001) continue
      if (requested && !asked.has(line.id)) continue
      const quantity = roundQty(requested ? asked.get(line.id) ?? 0 : open)
      if (quantity <= 0) throw new AppError(400, 'Quantity must be greater than zero.')
      if (quantity - open > 0.0001) throw new AppError(400, 'That quantity is more than what was invoiced.')
      const amounts = lineAmounts({ quantity, unitPrice: line.unitPrice, discount: 0, taxRate: line.taxRate })
      bill.push({
        description: line.description,
        quantity,
        unitPrice: line.unitPrice,
        taxRate: line.taxRate,
        subtotal: amounts.subtotal,
        taxAmount: amounts.taxAmount,
        salesOrderLineId: line.salesOrderLineId ?? undefined,
        purchaseOrderLineId: line.purchaseOrderLineId ?? undefined,
      })
    }
    if (bill.length === 0) throw new AppError(409, 'Nothing left to return.')
    const moveType = invoice.moveType === 'out_invoice' ? 'out_refund' : 'in_refund'
    const draft = await createDraft(
      tx,
      companyId,
      moveType,
      invoice.partnerId,
      {
        salesOrderId: invoice.salesOrderId ?? undefined,
        purchaseOrderId: invoice.purchaseOrderId ?? undefined,
        reversalOfId: invoice.id,
      },
      bill,
      { buyerName: invoice.buyerName, buyerTaxId: invoice.buyerTaxId, buyerAddress: invoice.buyerAddress },
    )
    const locations = await companyLocations(tx, companyId)
    const shelf = invoice.salesOrder?.warehouseId || invoice.purchaseOrder?.warehouseId
      ? (await warehouseStockLocation(tx, companyId, invoice.salesOrder?.warehouseId ?? invoice.purchaseOrder?.warehouseId)).location
      : locations.internal
    for (const line of invoice.lines) {
      const product = line.salesOrderLine?.product ?? line.purchaseOrderLine?.product
      if (!product || product.type !== 'product') continue
      const match = bill.find((row) =>
        (line.salesOrderLineId && row.salesOrderLineId === line.salesOrderLineId)
        || (line.purchaseOrderLineId && row.purchaseOrderLineId === line.purchaseOrderLineId),
      )
      if (!match) continue
      const incoming = invoice.moveType === 'out_invoice'
      const from = incoming ? locations.customer : shelf
      const to = incoming ? shelf : locations.supplier
      await applyQuant(tx, product.id, from.id, -match.quantity)
      await applyQuant(tx, product.id, to.id, match.quantity)
      const move = await tx.stockMove.create({
        data: {
          productId: product.id,
          locationFromId: from.id,
          locationToId: to.id,
          quantity: match.quantity,
          state: 'done',
          reference: draft.name,
          orderId: invoice.salesOrderId,
          purchaseOrderId: invoice.purchaseOrderId,
          date: new Date(),
        },
      })
      await valueDoneMove(tx, companyId, move.id)
    }
    const posted = await postInvoiceTx(tx, companyId, draft.id)
    const summary = `Return ${posted.name} posted against ${invoice.name}.`
    await tx.chatterMessage.create({
      data: { companyId, model: 'account.move', recordId: invoice.id, kind: 'note', summary },
    })
    if (invoice.salesOrderId) {
      await tx.chatterMessage.create({
        data: { companyId, model: 'sale.order', recordId: invoice.salesOrderId, kind: 'note', summary },
      })
    }
    if (invoice.purchaseOrderId) {
      await tx.chatterMessage.create({
        data: { companyId, model: 'purchase.order', recordId: invoice.purchaseOrderId, kind: 'note', summary },
      })
    }
    return posted
  })
}

export async function cancelInvoice(companyId: number, invoiceId: number) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (invoice.state !== 'draft') throw new AppError(409, 'Only a draft can be cancelled.')
    await guardWorkflow(tx, {
      companyId,
      model: 'account.move',
      recordId: invoice.id,
      from: invoice.state,
      to: 'cancel',
      label: invoice.name,
    })
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { state: 'cancel', residual: 0 },
      include: invoiceInclude,
    })
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
    select: {
      id: true,
      label: true,
      debit: true,
      credit: true,
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

type PnlItem = {
  debit: number
  credit: number
  account: { code: string; name: string; type: string }
  entry: { date: Date }
}

export function summarizePnl(items: PnlItem[], from?: string, to?: string) {
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

function entryDate(from?: string, to?: string) {
  if (!from && !to) return undefined
  return {
    ...(from ? { gte: new Date(`${from}T00:00:00.000Z`) } : {}),
    ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}),
  }
}

export async function profitAndLoss(companyId: number, from?: string, to?: string) {
  await ensureBooks(companyId)
  const items = await prisma.journalItem.findMany({
    where: {
      entry: { companyId, date: entryDate(from, to) },
      account: { type: { in: ['income', 'expense'] } },
    },
    select: {
      debit: true,
      credit: true,
      account: { select: { code: true, name: true, type: true } },
      entry: { select: { date: true } },
    },
  })
  return summarizePnl(items, from, to)
}

export async function balanceSheet(companyId: number, on?: string) {
  await ensureBooks(companyId)
  const items = await prisma.journalItem.findMany({
    where: {
      entry: { companyId, date: on ? { lte: new Date(`${on}T23:59:59.999Z`) } : undefined },
      account: { type: { in: ['asset', 'liability', 'equity'] } },
    },
    select: {
      debit: true,
      credit: true,
      account: { select: { code: true, name: true, type: true } },
      entry: { select: { date: true } },
    },
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
    where: {
      companyId,
      state: { in: ['posted', 'paid'] },
      invoiceDate: entryDate(from, to),
    },
    select: { moveType: true, amountTax: true, invoiceDate: true },
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
