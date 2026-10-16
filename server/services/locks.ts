import type { Tx } from '../db.ts'
import { AppError } from '../errors.ts'

export async function assertBooksOpen(tx: Tx, companyId: number, date: Date, taxed: boolean) {
  const company = await tx.company.findUnique({ where: { id: companyId } })
  if (!company) throw new AppError(404, 'Company not found.')
  if (company.lockDate && date.getTime() <= company.lockDate.getTime()) {
    throw new AppError(409, 'That date is on or before the lock date.')
  }
  if (taxed && company.taxLockDate && date.getTime() <= company.taxLockDate.getTime()) {
    throw new AppError(409, 'That date is on or before the tax lock date.')
  }
}
