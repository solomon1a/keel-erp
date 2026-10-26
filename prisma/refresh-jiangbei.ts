import { PrismaClient } from '@prisma/client'
import { prisma as serverPrisma, transactionOptions } from '../server/db.ts'
import { deleteCompany } from './company-cleanup.ts'
import { volumeMarker, volumePayroll } from './volume-plan.ts'

const jiangbeiAdmin = 'maya@northline.example'

/** Named Jiangbei staff who had no salary. Zhou Ning stays at 12,000 as sales manager. */
export const jiangbeiBasePay = {
  'He Gong': 8800,
  'Mina Cole': 7600,
  'Owen Price': 5600,
  'Sara Iqbal': 8200,
  'Theo Marsh': 7000,
  'Uma Shah': 7800,
  'Victor Lang': 5400,
  'Wen Li': 6400,
  'Yves Moreau': 5200,
} as const

export const zhouGross = 12000
export const zhouTitle = 'Sales manager'

const bandMin = 5000
const bandMax = 9600
const bandStep = 200

export function grossForUnassigned(name: string) {
  if (name === 'Zhou Ning') return zhouGross
  const known = jiangbeiBasePay[name as keyof typeof jiangbeiBasePay]
  if (known) return known
  let hash = 0
  for (const char of name) hash = (hash * 33 + char.charCodeAt(0)) >>> 0
  const steps = (bandMax - bandMin) / bandStep
  return bandMin + (hash % (steps + 1)) * bandStep
}

async function jiangbeiAdminUser(client: PrismaClient) {
  return client.user.findUnique({
    where: { email: jiangbeiAdmin },
    select: { companyId: true, displayCurrency: true },
  })
}

// Older builds seeded Jiangbei's twelve-month books with a smaller payroll and
// lower sales. The volume seed skips a company that already has its marker, so
// an existing database would keep the old figures. Jiangbei's books are
// outdated when it carries the marker but its volume staff have no salary
// structures (added with the new figures).
export async function jiangbeiBooksOutdated(client: PrismaClient, companyId: number) {
  const marker = await client.campaign.findFirst({ where: { companyId, name: volumeMarker }, select: { id: true } })
  if (!marker) return false
  const salaried = await client.salaryStructure.count({
    where: { companyId, employee: { name: { in: volumePayroll.map((row) => row.name) } } },
  })
  return salaried < volumePayroll.length
}

// When Jiangbei's books are outdated, rebuild Jiangbei from scratch, clearing
// the records deleteCompany does not (unbuild, forecast, downtime, ...).
// Other companies are not touched.
export async function refreshOutdatedJiangbei(client: PrismaClient) {
  const maya = await jiangbeiAdminUser(client)
  if (!maya) return null
  const companyId = maya.companyId
  if (!(await jiangbeiBooksOutdated(client, companyId))) return null
  console.log(`refresh-jiangbei: rebuilding company ${companyId} with the current demo figures`)
  await wipeCompanyExtras(client, companyId)
  await deleteCompany(client, companyId)
  return { displayCurrency: maya.displayCurrency }
}

export async function restoreDisplayCurrency(client: PrismaClient, displayCurrency: string | null) {
  await client.user.updateMany({ where: { email: jiangbeiAdmin }, data: { displayCurrency } })
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

/**
 * Fill missing Jiangbei salary records and mark Zhou Ning as sales manager.
 * Does not post a journal, and does not touch any other company.
 * When Jiangbei's books are outdated it does nothing: the seed rebuilds
 * Jiangbei first and runs this afterwards.
 */
export async function refreshJiangbei(client: PrismaClient) {
  const maya = await jiangbeiAdminUser(client)
  if (!maya) return { added: 0, titled: 0, skipped: false }
  const companyId = maya.companyId
  if (await jiangbeiBooksOutdated(client, companyId)) return { added: 0, titled: 0, skipped: true }
  const people = await client.employee.findMany({
    where: { companyId },
    include: { salary: { select: { id: true } } },
  })
  let added = 0
  let titled = 0
  for (const person of people) {
    if (person.name === 'Zhou Ning' && person.jobTitle !== zhouTitle) {
      await client.employee.update({ where: { id: person.id }, data: { jobTitle: zhouTitle } })
      titled += 1
    }
    if (person.salary) continue
    const monthlyGross = grossForUnassigned(person.name)
    if (person.name !== 'Zhou Ning' && (monthlyGross < bandMin || monthlyGross > bandMax)) {
      throw new Error(`Salary for ${person.name} is outside ${bandMin}–${bandMax}.`)
    }
    await client.salaryStructure.create({
      data: { companyId, employeeId: person.id, monthlyGross },
    })
    added += 1
  }
  return { added, titled, skipped: false }
}

const entry = process.argv[1] ?? ''
if (entry.endsWith('refresh-jiangbei.ts') || entry.endsWith('refresh-jiangbei.js')) {
  const client = new PrismaClient({ transactionOptions })
  try {
    const result = await refreshJiangbei(client)
    if (result.skipped) console.log('KEEL REFRESH: Jiangbei books are outdated; the seed rebuilds them and adds salaries')
    else console.log(`KEEL REFRESH: Jiangbei salaries added=${result.added} titles=${result.titled}`)
  } catch (error) {
    console.error('KEEL REFRESH FAILED')
    console.error(error)
    process.exitCode = 1
  } finally {
    await client.$disconnect().catch(() => undefined)
    await serverPrisma.$disconnect().catch(() => undefined)
  }
}
