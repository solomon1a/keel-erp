import type { Prisma, PrismaClient } from '@prisma/client'
import { defaultRateRows, displayCurrencies, isDisplayCurrency } from '../../shared/exchange.ts'
import { AppError } from '../errors.ts'

type RateDb = PrismaClient | Prisma.TransactionClient

export async function ensureDemoRates(db: RateDb, companyId: number, base: string) {
  const data = defaultRateRows(base).map((row) => ({ companyId, currency: row.currency, rate: row.rate }))
  if (data.length === 0) return
  await db.exchangeRate.createMany({ data, skipDuplicates: true })
}

export async function listRates(db: RateDb, companyId: number, base: string) {
  await ensureDemoRates(db, companyId, base)
  const rates = await db.exchangeRate.findMany({
    where: { companyId },
    orderBy: { currency: 'asc' },
    select: { currency: true, rate: true },
  })
  return { base, rates }
}

export function assertRateList(base: string, rates: Array<{ currency: string; rate: number }>) {
  const seen = new Set<string>()
  for (const row of rates) {
    if (seen.has(row.currency)) throw new AppError(400, 'Each currency can appear once.')
    seen.add(row.currency)
    if (row.currency !== base && !isDisplayCurrency(row.currency)) {
      throw new AppError(400, 'That currency is not on the display list.')
    }
    if (row.currency === base && row.rate !== 1) throw new AppError(400, 'The company currency stays at 1.')
  }
  if (!seen.has(base)) throw new AppError(400, 'Include the company currency.')
  for (const code of displayCurrencies) {
    if (code !== base && !seen.has(code)) throw new AppError(400, 'Include every display currency.')
  }
}

export async function replaceRates(db: PrismaClient, companyId: number, base: string, rates: Array<{ currency: string; rate: number }>) {
  assertRateList(base, rates)
  await db.$transaction(async (tx) => {
    await tx.exchangeRate.deleteMany({ where: { companyId } })
    await tx.exchangeRate.createMany({
      data: rates.map((row) => ({
        companyId,
        currency: row.currency,
        rate: row.currency === base ? 1 : row.rate,
      })),
    })
  })
  return listRates(db, companyId, base)
}
