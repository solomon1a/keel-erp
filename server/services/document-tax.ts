import { lineAmounts, roundMoney, sumLines } from '../../src/domain/money.ts'
import { asTaxKind, computeTaxes, mapTaxes, type EngineTax } from '../../shared/tax-engine.ts'
import type { Tx } from '../db.ts'
import { AppError } from '../errors.ts'

export type TaxSlice = { taxId: number; base: number; amount: number; withheld: boolean }

type TaxRow = {
  id: number
  name: string
  kind: string
  amount: number
  priceInclude: boolean
  compound: boolean
  withholding: boolean
  sequence: number
  active: boolean
  accountCode: string
}

function engineTax(tax: TaxRow): EngineTax {
  return {
    id: tax.id,
    name: tax.name,
    kind: asTaxKind(tax.kind),
    amount: tax.amount,
    priceInclude: tax.priceInclude,
    compound: tax.compound,
    withholding: tax.withholding,
    sequence: tax.sequence,
  }
}

export function heldTotal(lines: Array<{ subtotal: number; taxAmount: number; withheld?: number }>) {
  const totals = sumLines(lines)
  const withheld = roundMoney(lines.reduce((sum, line) => sum + (line.withheld ?? 0), 0))
  return { ...totals, amountTotal: roundMoney(totals.amountTotal - withheld) }
}

export async function priceCommercial(
  tx: Tx,
  companyId: number,
  partnerId: number | null,
  quantity: number,
  unitPrice: number,
  discount: number,
  taxGroupId: number | null | undefined,
  legacyRate: number,
) {
  if (!taxGroupId) {
    const amounts = lineAmounts({ quantity, unitPrice, discount, taxRate: legacyRate })
    return { subtotal: amounts.subtotal, taxAmount: amounts.taxAmount, withheld: 0, slices: [] as TaxSlice[] }
  }
  const group = await tx.taxGroup.findFirst({
    where: { id: taxGroupId, companyId },
    include: { lines: { include: { tax: true }, orderBy: { sequence: 'asc' } } },
  })
  if (!group) throw new AppError(400, 'Choose a tax template from this company.')
  const base = roundMoney(quantity * unitPrice * (1 - (discount || 0) / 100))
  const taxes = await mappedTaxes(tx, companyId, partnerId, group.lines.map((line) => line.tax), group.lines.map((line) => line.taxId))
  const result = computeTaxes(base, quantity, taxes)
  return {
    subtotal: result.net,
    taxAmount: result.added,
    withheld: result.withheld,
    slices: result.slices.map((slice) => ({ taxId: slice.taxId, base: slice.base, amount: slice.amount, withheld: slice.withheld })),
  }
}

async function mappedTaxes(tx: Tx, companyId: number, partnerId: number | null, groupTaxes: TaxRow[], groupIds: number[]) {
  const active = groupTaxes.filter((tax) => tax.active)
  if (!partnerId) return active.map(engineTax)
  const partner = await tx.contact.findFirst({ where: { id: partnerId, companyId }, select: { fiscalPositionId: true } })
  if (!partner?.fiscalPositionId) return active.map(engineTax)
  const position = await tx.fiscalPosition.findFirst({
    where: { id: partner.fiscalPositionId, companyId },
    include: { maps: true },
  })
  if (!position) return active.map(engineTax)
  const pool = await tx.companyTax.findMany({ where: { companyId, active: true } })
  const ids = new Set(groupIds)
  const maps = position.maps.map((row) => ({ taxId: row.taxId, replacementId: row.replacementId }))
  const replacements = new Set(position.maps.flatMap((map) => (ids.has(map.taxId) && map.replacementId ? [map.replacementId] : [])))
  return mapTaxes(pool.map(engineTax), maps).filter((tax) => ids.has(tax.id) || replacements.has(tax.id))
}

export async function rememberTaxes(tx: Tx, companyId: number, model: string, recordId: number, slices: TaxSlice[]) {
  if (slices.length === 0) return
  await tx.documentTax.createMany({
    data: slices.map((slice) => ({
      companyId,
      taxId: slice.taxId,
      model,
      recordId,
      base: slice.base,
      amount: slice.amount,
      withheld: slice.withheld,
    })),
  })
}

export async function clearTaxes(tx: Tx, companyId: number, model: string, recordIds: number[]) {
  if (recordIds.length === 0) return
  await tx.documentTax.deleteMany({ where: { companyId, model, recordId: { in: recordIds } } })
}

export async function loadSlices(tx: Tx, companyId: number, model: string, recordId: number, quantity: number, sourceQty: number) {
  const docs = await tx.documentTax.findMany({ where: { companyId, model, recordId } })
  if (docs.length === 0) return null
  const ratio = sourceQty === 0 ? 0 : quantity / sourceQty
  return docs.map((doc) => ({
    taxId: doc.taxId,
    base: roundMoney(doc.base * ratio),
    amount: roundMoney(doc.amount * ratio),
    withheld: doc.withheld,
  }))
}

type PostingLine = { accountId: number; debit: number; credit: number; label: string }

export async function linesForInvoiceTax(
  tx: Tx,
  companyId: number,
  moveType: string,
  accounts: Map<string, { id: number }>,
  invoice: { id: number; name: string; amountUntaxed: number; amountTotal: number; chargeAmount: number },
  lineIds: number[],
  receivable: string,
  payable: string,
): Promise<PostingLine[]> {
  const docs = await tx.documentTax.findMany({
    where: { companyId, model: 'account.move.line', recordId: { in: lineIds } },
    include: { tax: true },
  })
  const withheld = roundMoney(docs.filter((doc) => doc.withheld).reduce((sum, doc) => sum + doc.amount, 0))
  const sale = moveType === 'out_invoice' || moveType === 'out_refund'
  const idOf = (code: string) => {
    const account = accounts.get(code)
    if (!account) throw new AppError(400, `Account ${code} is not in this company.`)
    return account.id
  }
  if (withheld > 0.001) {
    const code = sale ? '1221' : '2242'
    if (!accounts.has(code)) {
      await tx.account.create({
        data: {
          companyId,
          code,
          name: sale ? 'Withholding receivable' : 'Withholding payable',
          type: sale ? 'asset' : 'liability',
        },
      })
      const created = await tx.account.findFirstOrThrow({ where: { companyId, code } })
      accounts.set(code, { id: created.id })
    }
  }
  const taxByAccount = new Map<string, number>()
  for (const doc of docs) {
    if (doc.withheld || Math.abs(doc.amount) < 0.001) continue
    const code = doc.tax.accountCode || (sale ? '222101' : '222102')
    taxByAccount.set(code, roundMoney((taxByAccount.get(code) ?? 0) + doc.amount))
  }
  const row = (code: string, debit: number, credit: number): PostingLine => ({
    accountId: idOf(code),
    debit: roundMoney(debit),
    credit: roundMoney(credit),
    label: invoice.name,
  })
  const control = sale ? receivable : payable
  const lines: PostingLine[] = []
  switch (moveType) {
    case 'out_invoice':
      lines.push(row(control, invoice.amountTotal, 0))
      if (withheld > 0.001) lines.push(row('1221', withheld, 0))
      lines.push(row('6001', 0, invoice.amountUntaxed))
      for (const [code, amount] of taxByAccount) lines.push(row(code, 0, amount))
      if (invoice.chargeAmount > 0.001) lines.push(row('6051', 0, invoice.chargeAmount))
      break
    case 'out_refund':
      lines.push(row(control, 0, invoice.amountTotal))
      if (withheld > 0.001) lines.push(row('1221', 0, withheld))
      lines.push(row('6001', invoice.amountUntaxed, 0))
      for (const [code, amount] of taxByAccount) lines.push(row(code, amount, 0))
      if (invoice.chargeAmount > 0.001) lines.push(row('6051', invoice.chargeAmount, 0))
      break
    case 'in_invoice':
      lines.push(row('1405', invoice.amountUntaxed, 0))
      for (const [code, amount] of taxByAccount) lines.push(row(code, amount, 0))
      if (invoice.chargeAmount > 0.001) lines.push(row('6402', invoice.chargeAmount, 0))
      if (withheld > 0.001) lines.push(row('2242', 0, withheld))
      lines.push(row(control, 0, invoice.amountTotal))
      break
    case 'in_refund':
      lines.push(row('1405', 0, invoice.amountUntaxed))
      for (const [code, amount] of taxByAccount) lines.push(row(code, 0, amount))
      if (invoice.chargeAmount > 0.001) lines.push(row('6402', 0, invoice.chargeAmount))
      if (withheld > 0.001) lines.push(row('2242', withheld, 0))
      lines.push(row(control, invoice.amountTotal, 0))
      break
    default:
      throw new AppError(400, 'Unknown invoice type.')
  }
  return lines.filter((line) => line.debit !== 0 || line.credit !== 0)
}
