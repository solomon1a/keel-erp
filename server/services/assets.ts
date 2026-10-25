import type { DepreciationMethod } from '../../shared/depreciation.ts'
import { depreciationSchedule } from '../../shared/depreciation.ts'
import { roundMoney } from '../../src/domain/money.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { assertYearOpen } from './books.ts'
import { readSetting } from './company-settings.ts'
import { accountId, ensureAccounts, postEntry } from './journals.ts'
import { assertBooksOpen } from './locks.ts'

const assetAccounts = [
  ['1002', 'Bank', 'asset'],
  ['1405', 'Inventory', 'asset'],
  ['1601', 'Fixed assets', 'asset'],
  ['1602', 'Accumulated depreciation', 'asset'],
  ['6605', 'Depreciation expense', 'expense'],
  ['6052', 'Gain on disposal', 'income'],
  ['6606', 'Loss on disposal', 'expense'],
] as const

const assetInclude = {
  category: { select: { id: true, name: true, method: true, months: true, frequency: true } },
  lines: {
    orderBy: { date: 'asc' as const },
    include: {
      entry: {
        select: {
          id: true,
          name: true,
          date: true,
          lines: {
            select: {
              debit: true,
              credit: true,
              label: true,
              account: { select: { code: true, name: true } },
            },
          },
        },
      },
    },
  },
} as const

function parseDay(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new AppError(400, 'Use a date like 2026-04-30.')
  return new Date(`${iso}T00:00:00.000Z`)
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function asMethod(value: string): DepreciationMethod {
  switch (value) {
    case 'straight_line':
    case 'declining':
      return value
    default:
      throw new AppError(400, 'Depreciation method is straight-line or declining balance.')
  }
}

type AssetRow = {
  id: number
  name: string
  purchaseValue: number
  salvageValue: number
  startDate: Date
  method: string
  months: number
  state: string
  invoiceLineId: number | null
  disposalDate: Date | null
  disposalPrice: number | null
  category: { id: number; name: string; method: string; months: number; frequency: string }
  lines: Array<{
    id: number
    date: Date
    amount: number
    state: string
    entry: {
      id: number
      name: string
      date: Date
      lines: Array<{ debit: number; credit: number; label: string; account: { code: string; name: string } }>
    } | null
  }>
}

function present(asset: AssetRow) {
  const posted = roundMoney(
    asset.lines.filter((line) => line.state === 'posted').reduce((sum, line) => sum + line.amount, 0),
  )
  return {
    id: asset.id,
    name: asset.name,
    purchaseValue: asset.purchaseValue,
    salvageValue: asset.salvageValue,
    startDate: dayKey(asset.startDate),
    method: asMethod(asset.method),
    months: asset.months,
    frequency: 'monthly' as const,
    state: asset.state,
    invoiceLineId: asset.invoiceLineId,
    disposalDate: asset.disposalDate ? dayKey(asset.disposalDate) : null,
    disposalPrice: asset.disposalPrice,
    bookValue: roundMoney(asset.purchaseValue - posted),
    postedDepreciation: posted,
    category: asset.category,
    lines: asset.lines.map((line) => ({
      id: line.id,
      date: dayKey(line.date),
      amount: line.amount,
      state: line.state,
      entry: line.entry
        ? {
            id: line.entry.id,
            name: line.entry.name,
            date: dayKey(line.entry.date),
            lines: line.entry.lines,
          }
        : null,
    })),
  }
}

type Store = Tx | typeof prisma

async function load(tx: Store, companyId: number, assetId: number) {
  const asset = await tx.asset.findFirst({ where: { id: assetId, companyId }, include: assetInclude })
  if (!asset) throw new AppError(404, 'Asset not found.')
  return asset
}

async function accounts(tx: Tx, companyId: number) {
  await ensureAccounts(tx, companyId, assetAccounts)
  const rows = await tx.account.findMany({
    where: { companyId, code: { in: assetAccounts.map((row) => row[0]) } },
  })
  return new Map(rows.map((row) => [row.code, row.id]))
}

export async function ensureAssetCategory(tx: Tx, companyId: number) {
  const existing = await tx.assetCategory.findFirst({ where: { companyId, name: 'Workshop equipment' } })
  if (existing) return existing
  const map = await accounts(tx, companyId)
  return tx.assetCategory.create({
    data: {
      companyId,
      name: 'Workshop equipment',
      assetAccountId: accountId(map, '1601'),
      accumAccountId: accountId(map, '1602'),
      expenseAccountId: accountId(map, '6605'),
      method: 'straight_line',
      months: 60,
      frequency: 'monthly',
    },
  })
}

export type AssetDraft = {
  name: string
  purchaseValue: number
  salvageValue: number
  start: string
  method: DepreciationMethod
  months: number
  categoryId?: number
  invoiceLineId?: number
}

export async function createAsset(companyId: number, input: AssetDraft) {
  return prisma.$transaction((tx) => createAssetTx(tx, companyId, input), transactionOptions)
}

export async function createAssetTx(tx: Tx, companyId: number, input: AssetDraft) {
  const name = input.name.trim()
  if (!name) throw new AppError(400, 'Name the asset.')
  const months = Math.round(input.months)
  if (months < 1 || months > 600) throw new AppError(400, 'Useful life is between 1 and 600 months.')
  const methodSetting = await readSetting(tx, companyId, 'assets', 'method', 'Straight line')
  const method = methodSetting === 'Declining balance' || methodSetting === 'Declining' ? asMethod('declining') : asMethod(input.method)
  let purchaseValue = roundMoney(input.purchaseValue)
  let invoiceLineId: number | null = null
  if (input.invoiceLineId) {
    const line = await tx.invoiceLine.findFirst({
      where: { id: input.invoiceLineId },
      include: { invoice: true, asset: { select: { id: true } } },
    })
    if (!line || line.invoice.companyId !== companyId) throw new AppError(404, 'Bill line not found.')
    if (line.invoice.moveType !== 'in_invoice' || line.invoice.state !== 'posted') {
      throw new AppError(409, 'Capitalize a line from a posted vendor bill.')
    }
    if (line.asset) throw new AppError(409, 'That bill line is already an asset.')
    purchaseValue = roundMoney(line.subtotal)
    invoiceLineId = line.id
  }
  if (purchaseValue <= 0) throw new AppError(400, 'Purchase value has to be above zero.')
  const salvageValue = roundMoney(input.salvageValue)
  if (salvageValue < 0 || salvageValue > purchaseValue) throw new AppError(400, 'Salvage sits between zero and the purchase value.')
  const category = input.categoryId
    ? await tx.assetCategory.findFirst({ where: { id: input.categoryId, companyId } })
    : await ensureAssetCategory(tx, companyId)
  if (!category) throw new AppError(400, 'Choose an asset category.')
  const start = parseDay(input.start)
  const slots = depreciationSchedule({
    cost: purchaseValue,
    salvage: salvageValue,
    months,
    method,
    start: input.start,
  })
  const map = await accounts(tx, companyId)
  await assertBooksOpen(tx, companyId, start, false)
  await assertYearOpen(tx, companyId, start)
  const asset = await tx.asset.create({
    data: {
      companyId,
      name,
      categoryId: category.id,
      purchaseValue,
      salvageValue,
      startDate: start,
      method,
      months,
      state: 'open',
      invoiceLineId,
      lines: { create: slots.map((slot) => ({ date: parseDay(slot.date), amount: slot.amount, state: 'draft' })) },
    },
  })
  const label = name
  if (invoiceLineId) {
    await postEntry(tx, companyId, start, [
      { accountId: category.assetAccountId, debit: purchaseValue, credit: 0, label },
      { accountId: accountId(map, '1405'), debit: 0, credit: purchaseValue, label },
    ])
  } else {
    await postEntry(tx, companyId, start, [
      { accountId: category.assetAccountId, debit: purchaseValue, credit: 0, label },
      { accountId: accountId(map, '1002'), debit: 0, credit: purchaseValue, label },
    ])
  }
  return present(await load(tx, companyId, asset.id))
}

async function postLineTx(tx: Tx, companyId: number, assetId: number, lineId: number) {
  const asset = await load(tx, companyId, assetId)
  if (asset.state !== 'open') throw new AppError(409, 'A disposed asset does not take more depreciation.')
  const line = asset.lines.find((row) => row.id === lineId)
  if (!line) throw new AppError(404, 'Depreciation line not found.')
  if (line.state === 'posted') return present(asset)
  if (line.state !== 'draft') throw new AppError(409, 'That depreciation line is not waiting to post.')
  const category = await tx.assetCategory.findFirstOrThrow({ where: { id: asset.categoryId } })
  await assertBooksOpen(tx, companyId, line.date, false)
  await assertYearOpen(tx, companyId, line.date)
  const journalCode = await readSetting(tx, companyId, 'assets', 'journal', 'GEN')
  const entry = await postEntry(tx, companyId, line.date, [
    { accountId: category.expenseAccountId, debit: line.amount, credit: 0, label: asset.name },
    { accountId: category.accumAccountId, debit: 0, credit: line.amount, label: asset.name },
  ], undefined, journalCode)
  await tx.assetDepreciation.update({ where: { id: line.id }, data: { state: 'posted', entryId: entry.id } })
  return present(await load(tx, companyId, asset.id))
}

export async function postDepreciationLine(companyId: number, assetId: number, lineId: number) {
  return prisma.$transaction((tx) => postLineTx(tx, companyId, assetId, lineId), transactionOptions)
}

export async function postDueDepreciation(companyId: number, assetId: number, asOf: string) {
  const end = parseDay(asOf)
  return prisma.$transaction(async (tx) => {
    const asset = await load(tx, companyId, assetId)
    const due = asset.lines.filter((line) => line.state === 'draft' && line.date.getTime() <= end.getTime())
    let current = asset.id
    for (const line of due) {
      await postLineTx(tx, companyId, current, line.id)
    }
    return present(await load(tx, companyId, asset.id))
  }, transactionOptions)
}

export async function disposeAsset(companyId: number, assetId: number, price: number, date: string) {
  const sale = roundMoney(price)
  if (sale < 0) throw new AppError(400, 'Sale price cannot be negative.')
  const when = parseDay(date)
  return prisma.$transaction(async (tx) => {
    const asset = await load(tx, companyId, assetId)
    if (asset.state !== 'open') throw new AppError(409, 'This asset is already closed.')
    await tx.assetDepreciation.updateMany({
      where: { assetId: asset.id, state: 'draft' },
      data: { state: 'cancel' },
    })
    const accum = roundMoney(asset.lines.filter((line) => line.state === 'posted').reduce((sum, line) => sum + line.amount, 0))
    const book = roundMoney(asset.purchaseValue - accum)
    const gain = roundMoney(Math.max(0, sale - book))
    const loss = roundMoney(Math.max(0, book - sale))
    const category = await tx.assetCategory.findFirstOrThrow({ where: { id: asset.categoryId } })
    const map = await accounts(tx, companyId)
    await assertBooksOpen(tx, companyId, when, false)
    await assertYearOpen(tx, companyId, when)
    const label = asset.name
    const entry = await postEntry(tx, companyId, when, [
      { accountId: category.accumAccountId, debit: accum, credit: 0, label },
      { accountId: accountId(map, '1002'), debit: sale, credit: 0, label },
      { accountId: accountId(map, '6606'), debit: loss, credit: 0, label },
      { accountId: category.assetAccountId, debit: 0, credit: asset.purchaseValue, label },
      { accountId: accountId(map, '6052'), debit: 0, credit: gain, label },
    ])
    const state = sale > 0 ? 'sold' : 'disposed'
    await tx.asset.update({
      where: { id: asset.id },
      data: { state, disposalDate: when, disposalPrice: sale, disposalEntryId: entry.id },
    })
    return present(await load(tx, companyId, asset.id))
  }, transactionOptions)
}

export async function listAssets(companyId: number) {
  const rows = await prisma.asset.findMany({
    where: { companyId },
    include: assetInclude,
    orderBy: { name: 'asc' },
  })
  return rows.map(present)
}

export async function getAsset(companyId: number, assetId: number) {
  return present(await load(prisma, companyId, assetId))
}

export async function listBillLines(companyId: number) {
  const lines = await prisma.invoiceLine.findMany({
    where: {
      asset: null,
      invoice: { companyId, moveType: 'in_invoice', state: 'posted' },
    },
    include: { invoice: { select: { name: true, partner: { select: { name: true } } } } },
    orderBy: { id: 'desc' },
    take: 40,
  })
  return lines.map((line) => ({
    id: line.id,
    description: line.description,
    subtotal: line.subtotal,
    invoice: line.invoice.name,
    vendor: line.invoice.partner.name,
  }))
}

export async function listAssetCategories(companyId: number) {
  return prisma.assetCategory.findMany({
    where: { companyId },
    select: { id: true, name: true, method: true, months: true, frequency: true },
    orderBy: { name: 'asc' },
  })
}
