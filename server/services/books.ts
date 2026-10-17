import { Prisma } from '@prisma/client'
import { roundMoney } from '../../src/domain/money.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'

async function ignoreDuplicate(run: () => Promise<unknown>) {
  try {
    await run()
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return
    throw error
  }
}

type FrameDb = Pick<typeof prisma, 'fiscalYear' | 'costCentre' | 'chargeTemplate'>

export async function ensureCompanyFrame(db: FrameDb, companyId: number) {
  const year = new Date().getUTCFullYear()
  const name = `FY${year}`
  await Promise.all([
    ignoreDuplicate(() => db.fiscalYear.upsert({
      where: { companyId_name: { companyId, name } },
      update: {},
      create: {
        companyId,
        name,
        startsOn: new Date(Date.UTC(year, 0, 1)),
        endsOn: new Date(Date.UTC(year, 11, 31, 23, 59, 59)),
      },
    })),
    ignoreDuplicate(() => db.costCentre.upsert({
      where: { companyId_code: { companyId, code: 'HQ' } },
      update: {},
      create: { companyId, code: 'HQ', name: 'Operations' },
    })),
    ignoreDuplicate(() => db.chargeTemplate.upsert({
      where: { companyId_name: { companyId, name: 'Handling' } },
      update: {},
      create: { companyId, name: 'Handling', side: 'sales', rate: 2 },
    })),
  ])
}

export async function assertYearOpen(tx: Tx, companyId: number, date: Date) {
  const year = await tx.fiscalYear.findFirst({
    where: { companyId, closed: true, startsOn: { lte: date }, endsOn: { gte: date } },
  })
  if (year) throw new AppError(409, `${year.name} is closed.`)
}

export async function listFiscalYears(companyId: number) {
  return prisma.fiscalYear.findMany({ where: { companyId }, orderBy: { startsOn: 'asc' } })
}

export async function openFiscalYear(companyId: number, name: string, startsOn: string, endsOn: string) {
  const start = new Date(`${startsOn}T00:00:00.000Z`)
  const end = new Date(`${endsOn}T23:59:59.000Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    throw new AppError(400, 'The year needs a start date and a later end date.')
  }
  return prisma.fiscalYear.upsert({
    where: { companyId_name: { companyId, name } },
    update: {},
    create: { companyId, name, startsOn: start, endsOn: end },
  })
}

export async function closeFiscalYear(companyId: number, name: string) {
  await ensureCompanyFrame(prisma, companyId)
  return prisma.$transaction(async (tx) => {
    const year = await tx.fiscalYear.findFirst({ where: { companyId, name } })
    if (!year) throw new AppError(404, 'That fiscal year is not on this company.')
    if (year.closed) throw new AppError(409, `${year.name} is already closed.`)
    const items = await tx.journalItem.findMany({
      where: { entry: { companyId, date: { gte: year.startsOn, lte: year.endsOn } } },
      include: { account: true },
    })
    const nets = new Map<number, { code: string; type: string; net: number }>()
    for (const item of items) {
      if (item.account.type !== 'income' && item.account.type !== 'expense') continue
      const current = nets.get(item.accountId) ?? { code: item.account.code, type: item.account.type, net: 0 }
      const signed = item.account.type === 'income' ? item.credit - item.debit : item.debit - item.credit
      current.net = roundMoney(current.net + signed)
      nets.set(item.accountId, current)
    }
    const retained = await tx.account.findFirst({ where: { companyId, code: '3103' } })
    const journal = await tx.journal.findFirst({ where: { companyId, code: 'GEN' } })
    if (!retained || !journal) throw new AppError(500, 'Retained earnings is missing.')
    const lines: Array<{ accountId: number; debit: number; credit: number; label: string }> = []
    let toEquity = 0
    for (const [accountId, row] of nets) {
      if (Math.abs(row.net) <= 0.001) continue
      if (row.type === 'income') {
        lines.push({ accountId, debit: row.net, credit: 0, label: year.name })
        toEquity = roundMoney(toEquity + row.net)
      } else {
        lines.push({ accountId, debit: 0, credit: row.net, label: year.name })
        toEquity = roundMoney(toEquity - row.net)
      }
    }
    if (Math.abs(toEquity) > 0.001) {
      lines.push({
        accountId: retained.id,
        debit: toEquity < 0 ? roundMoney(-toEquity) : 0,
        credit: toEquity > 0 ? toEquity : 0,
        label: year.name,
      })
    }
    if (lines.length > 0) {
      const sequence = await tx.sequence.update({
        where: { name: `account.entry.${companyId}` },
        data: { next: { increment: 1 } },
      })
      await tx.journalEntry.create({
        data: {
          name: `JE${String(sequence.next).padStart(4, '0')}`,
          journalId: journal.id,
          date: year.endsOn,
          companyId,
          lines: { create: lines },
        },
      })
    }
    return tx.fiscalYear.update({ where: { id: year.id }, data: { closed: true } })
  })
}

export async function applyChargeTemplate(companyId: number, invoiceId: number, templateName: string) {
  return prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findFirst({ where: { id: invoiceId, companyId } })
    if (!invoice) throw new AppError(404, 'Invoice not found.')
    if (invoice.state !== 'draft') throw new AppError(409, 'Only a draft can take a charges template.')
    const template = await tx.chargeTemplate.findFirst({ where: { companyId, name: templateName } })
    if (!template) throw new AppError(404, 'That charges template is not on this company.')
    const side = invoice.moveType.startsWith('out') ? 'sales' : 'purchase'
    if (template.side !== side) throw new AppError(400, 'That template does not apply to this invoice.')
    const chargeAmount = roundMoney(invoice.amountUntaxed * template.rate / 100)
    const amountTotal = roundMoney(invoice.amountUntaxed + invoice.amountTax + chargeAmount)
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { chargeRate: template.rate, chargeAmount, amountTotal, residual: amountTotal },
    })
  })
}

export async function assignCostCentre(companyId: number, invoiceId: number, code: string) {
  const centre = await prisma.costCentre.findFirst({ where: { companyId, code } })
  if (!centre) throw new AppError(404, 'That cost centre is not on this company.')
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId } })
  if (!invoice) throw new AppError(404, 'Invoice not found.')
  if (invoice.state !== 'draft') throw new AppError(409, 'Only a draft can change cost centre.')
  return prisma.invoice.update({ where: { id: invoice.id }, data: { costCentreId: centre.id } })
}

function bucketFor(days: number) {
  if (days <= 30) return 'current'
  if (days <= 60) return 'd30'
  if (days <= 90) return 'd60'
  return 'older'
}

export async function agingReport(companyId: number, asOf: string) {
  const day = new Date(`${asOf}T23:59:59.000Z`)
  if (Number.isNaN(day.getTime())) throw new AppError(400, 'Enter a valid as-of date.')
  const invoices = await prisma.invoice.findMany({
    where: { companyId, state: { in: ['posted', 'paid'] }, residual: { gt: 0.001 }, invoiceDate: { lte: day } },
    select: { name: true, moveType: true, invoiceDate: true, residual: true },
    orderBy: { invoiceDate: 'asc' },
  })
  const empty = () => ({ current: 0, d30: 0, d60: 0, older: 0, total: 0 })
  const receivable = empty()
  const payable = empty()
  const lines = invoices.map((invoice) => {
    const days = Math.floor((day.getTime() - invoice.invoiceDate.getTime()) / 86_400_000)
    const bucket = bucketFor(days)
    const side = invoice.moveType === 'out_invoice' || invoice.moveType === 'in_refund' ? receivable : payable
    side[bucket] = roundMoney(side[bucket] + invoice.residual)
    side.total = roundMoney(side.total + invoice.residual)
    return { name: invoice.name, moveType: invoice.moveType, bucket, residual: invoice.residual, days }
  })
  return { asOf, receivable, payable, lines }
}

export async function centreReport(companyId: number) {
  const items = await prisma.journalItem.findMany({
    where: { entry: { companyId }, costCentreId: { not: null } },
    select: {
      debit: true,
      credit: true,
      costCentre: { select: { code: true, name: true } },
      account: { select: { type: true } },
    },
  })
  const rows = new Map<string, { code: string; name: string; amount: number }>()
  for (const item of items) {
    if (!item.costCentre) continue
    const current = rows.get(item.costCentre.code) ?? { code: item.costCentre.code, name: item.costCentre.name, amount: 0 }
    const signed = item.account.type === 'income' ? item.credit - item.debit : item.debit - item.credit
    current.amount = roundMoney(current.amount + signed)
    rows.set(item.costCentre.code, current)
  }
  return [...rows.values()]
}
