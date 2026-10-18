import { roundMoney } from '../../src/domain/money.ts'
import type { Tx } from '../db.ts'
import { AppError } from '../errors.ts'

export async function ensureAccounts(tx: Tx, companyId: number, rows: ReadonlyArray<readonly [string, string, string]>) {
  for (const [code, name, type] of rows) {
    const existing = await tx.account.findFirst({ where: { companyId, code } })
    if (!existing) await tx.account.create({ data: { companyId, code, name, type } })
  }
}

export async function nextJournalName(tx: Tx, companyId: number) {
  const name = `account.entry.${companyId}`
  await tx.sequence.upsert({ where: { name }, update: {}, create: { name, next: 0 } })
  const sequence = await tx.sequence.update({ where: { name }, data: { next: { increment: 1 } } })
  return `JE${String(sequence.next).padStart(4, '0')}`
}

type Posting = { accountId: number; debit: number; credit: number; label: string; partnerId?: number }

export async function postEntry(
  tx: Tx,
  companyId: number,
  date: Date,
  lines: Posting[],
  invoiceId?: number,
) {
  const debit = roundMoney(lines.reduce((sum, line) => sum + line.debit, 0))
  const credit = roundMoney(lines.reduce((sum, line) => sum + line.credit, 0))
  if (Math.abs(debit - credit) > 0.001) throw new AppError(500, 'The journal entry does not balance.')
  const journal = await tx.journal.findFirst({ where: { companyId, code: 'GEN' } })
  if (!journal) throw new AppError(500, 'The general journal is missing.')
  const kept = lines.filter((line) => line.debit !== 0 || line.credit !== 0)
  return tx.journalEntry.create({
    data: {
      name: await nextJournalName(tx, companyId),
      journalId: journal.id,
      invoiceId,
      date,
      companyId,
      lines: {
        create: kept.map((line) => ({
          accountId: line.accountId,
          partnerId: line.partnerId,
          label: line.label,
          debit: roundMoney(line.debit),
          credit: roundMoney(line.credit),
        })),
      },
    },
    include: { lines: { include: { account: { select: { code: true, name: true } } } } },
  })
}

export function accountId(map: Map<string, number>, code: string) {
  const id = map.get(code)
  if (!id) throw new AppError(500, `Account ${code} is missing.`)
  return id
}
