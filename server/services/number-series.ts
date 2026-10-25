import type { Tx } from '../db.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'

type CatalogItem = {
  document: string
  prefix: string
  legacy: (companyId: number) => string
}

export const numberCatalog: CatalogItem[] = [
  { document: 'sales.order', prefix: 'SO', legacy: () => 'sales.order' },
  { document: 'purchase.order', prefix: 'PO', legacy: () => 'purchase.order' },
  { document: 'manufacturing.order', prefix: 'MO', legacy: () => 'manufacturing.order' },
  { document: 'stock.transfer', prefix: 'INT', legacy: () => 'stock.transfer' },
  { document: 'pos.session', prefix: 'SES', legacy: () => 'pos.session' },
  { document: 'pos.order', prefix: 'POS', legacy: () => 'pos.order' },
  { document: 'account.out', prefix: 'INV', legacy: (companyId) => `account.out.${companyId}` },
  { document: 'account.in', prefix: 'BILL', legacy: (companyId) => `account.in.${companyId}` },
  { document: 'account.out_refund', prefix: 'CN', legacy: (companyId) => `account.out_refund.${companyId}` },
  { document: 'account.in_refund', prefix: 'DN', legacy: (companyId) => `account.in_refund.${companyId}` },
  { document: 'account.entry', prefix: 'JE', legacy: (companyId) => `account.entry.${companyId}` },
  { document: 'helpdesk.ticket', prefix: 'HD', legacy: (companyId) => `helpdesk.ticket.${companyId}` },
  { document: 'subcontract.order', prefix: 'SC', legacy: (companyId) => `subcontract.order.${companyId}` },
  { document: 'job.card', prefix: 'JC', legacy: (companyId) => `job.card.${companyId}` },
  { document: 'delivery', prefix: 'DN', legacy: (companyId) => `delivery.${companyId}` },
  { document: 'receipt', prefix: 'GR', legacy: (companyId) => `receipt.${companyId}` },
  { document: 'material', prefix: 'MR', legacy: (companyId) => `material.${companyId}` },
  { document: 'supplier.quote', prefix: 'SQ', legacy: (companyId) => `supplier.quote.${companyId}` },
  { document: 'payment.entry', prefix: 'PAY', legacy: (companyId) => `payment.entry.${companyId}` },
]

export function catalogItem(document: string) {
  return numberCatalog.find((item) => item.document === document) ?? null
}

function formatNumber(prefix: string, padding: number, value: number) {
  const width = padding > 0 ? padding : 4
  return `${prefix}${String(value).padStart(width, '0')}`
}

/**
 * Copies the legacy counter once, without advancing it, then advances only this company's series.
 */
export async function allocateDocument(tx: Tx, companyId: number, document: string, legacyName: string, defaultPrefix: string) {
  await tx.sequence.upsert({
    where: { name: legacyName },
    update: {},
    create: { name: legacyName, next: 0 },
  })
  const legacy = await tx.sequence.findUniqueOrThrow({ where: { name: legacyName } })
  await tx.numberSeries.upsert({
    where: { companyId_document: { companyId, document } },
    update: {},
    create: { companyId, document, prefix: defaultPrefix, padding: 4, next: legacy.next },
  })
  const series = await tx.numberSeries.update({
    where: { companyId_document: { companyId, document } },
    data: { next: { increment: 1 } },
  })
  return formatNumber(series.prefix, series.padding, series.next)
}

export async function allocateKnown(tx: Tx, companyId: number, document: string) {
  const item = catalogItem(document)
  if (!item) throw new AppError(400, 'That document has no number series.')
  return allocateDocument(tx, companyId, item.document, item.legacy(companyId), item.prefix)
}

export function accountDocument(sequenceName: string): { companyId: number; document: string } | null {
  const match = sequenceName.match(/^account\.(out_refund|in_refund|out|in|entry)\.(\d+)$/)
  if (!match?.[1] || !match[2]) return null
  const companyId = Number(match[2])
  switch (match[1]) {
    case 'out':
      return { companyId, document: 'account.out' }
    case 'in':
      return { companyId, document: 'account.in' }
    case 'out_refund':
      return { companyId, document: 'account.out_refund' }
    case 'in_refund':
      return { companyId, document: 'account.in_refund' }
    case 'entry':
      return { companyId, document: 'account.entry' }
    default:
      return null
  }
}

export async function listNumberSeries(companyId: number) {
  const rows = await prisma.numberSeries.findMany({ where: { companyId } })
  const byDocument = new Map(rows.map((row) => [row.document, row]))
  const sequences = await prisma.sequence.findMany({
    where: { name: { in: numberCatalog.map((item) => item.legacy(companyId)) } },
  })
  const legacyNext = new Map(sequences.map((row) => [row.name, row.next]))
  return numberCatalog.map((item) => {
    const saved = byDocument.get(item.document)
    const prefix = saved?.prefix ?? item.prefix
    const padding = saved?.padding ?? 4
    const issued = saved ? saved.next : (legacyNext.get(item.legacy(companyId)) ?? 0)
    return {
      document: item.document,
      prefix,
      padding,
      next: saved ? saved.next : null,
      preview: formatNumber(prefix, padding, issued + 1),
    }
  })
}

export async function saveNumberSeries(companyId: number, input: { document: string; prefix: string; padding: number; next: number }) {
  const item = catalogItem(input.document)
  if (!item) throw new AppError(400, 'That document has no number series.')
  const prefix = input.prefix.trim()
  if (!prefix) throw new AppError(400, 'Enter a prefix.')
  await prisma.numberSeries.upsert({
    where: { companyId_document: { companyId, document: item.document } },
    update: { prefix, padding: input.padding, next: input.next },
    create: { companyId, document: item.document, prefix, padding: input.padding, next: input.next },
  })
  return listNumberSeries(companyId)
}
