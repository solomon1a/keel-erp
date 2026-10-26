import type { PrismaClient } from '@prisma/client'
import { deleteCompany } from './company-cleanup.ts'
import { volumeMarker, volumePayroll } from './volume-plan.ts'

// Older builds seeded Jiangbei's twelve-month books with a smaller payroll and
// lower sales. The volume seed skips a company that already has its marker, so
// an existing database would keep the old figures. When Jiangbei carries the
// marker but its staff have no salary structures (added with the new figures),
// rebuild Jiangbei from scratch. Other companies are not touched.
export async function refreshOutdatedJiangbei(client: PrismaClient) {
  const maya = await client.user.findUnique({
    where: { email: 'maya@northline.example' },
    select: { companyId: true, displayCurrency: true },
  })
  if (!maya) return null
  const companyId = maya.companyId
  const marker = await client.campaign.findFirst({ where: { companyId, name: volumeMarker }, select: { id: true } })
  if (!marker) return null
  const salaried = await client.salaryStructure.count({
    where: { companyId, employee: { name: { in: volumePayroll.map((row) => row.name) } } },
  })
  if (salaried >= volumePayroll.length) return null
  console.log(`refresh-jiangbei: rebuilding company ${companyId} with the current demo figures`)
  await wipeCompanyExtras(client, companyId)
  await deleteCompany(client, companyId)
  return { displayCurrency: maya.displayCurrency }
}

export async function restoreDisplayCurrency(client: PrismaClient, displayCurrency: string | null) {
  await client.user.updateMany({ where: { email: 'maya@northline.example' }, data: { displayCurrency } })
}

// Records that deleteCompany does not clear yet.
async function wipeCompanyExtras(client: PrismaClient, companyId: number) {
  await client.$transaction(async (tx) => {
    await tx.paymentAllocation.deleteMany({ where: { payment: { companyId } } })
    await tx.paymentEntry.deleteMany({ where: { companyId } })
    await tx.fxRevaluation.deleteMany({ where: { companyId } })
    await tx.numberSeries.deleteMany({ where: { companyId } })
    await tx.unbuildOrder.deleteMany({ where: { companyId } })
    await tx.demandForecast.deleteMany({ where: { companyId } })
    await tx.downtimeEntry.deleteMany({ where: { companyId } })
    await tx.jobTimeLog.deleteMany({ where: { jobCard: { companyId } } })
    await tx.wastageEntry.deleteMany({ where: { companyId } })
    await tx.jobCard.deleteMany({ where: { companyId } })
    await tx.bomOperation.deleteMany({ where: { bom: { companyId } } })
    await tx.bomByproduct.deleteMany({ where: { bom: { companyId } } })
    await tx.workstation.deleteMany({ where: { companyId } })
    await tx.productionPlanLine.deleteMany({ where: { plan: { companyId } } })
    await tx.productionPlan.deleteMany({ where: { companyId } })
    await tx.groupMember.deleteMany({ where: { group: { companyId } } })
    await tx.modelAccess.deleteMany({ where: { group: { companyId } } })
    await tx.recordRule.deleteMany({ where: { group: { companyId } } })
  }, { maxWait: 20000, timeout: 120000 })
}
