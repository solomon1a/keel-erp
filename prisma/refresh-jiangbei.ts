import { PrismaClient } from '@prisma/client'
import { prisma as serverPrisma, transactionOptions } from '../server/db.ts'

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

/**
 * Fill missing Jiangbei salary records and mark Zhou Ning as sales manager.
 * Does not post a journal, and does not touch any other company.
 */
export async function refreshJiangbei(client: PrismaClient) {
  const company = await client.company.findFirst({
    where: { name: 'Jiangbei Goods Co.' },
    select: { id: true },
  })
  if (!company) return { added: 0, titled: 0 }
  const people = await client.employee.findMany({
    where: { companyId: company.id },
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
      data: { companyId: company.id, employeeId: person.id, monthlyGross },
    })
    added += 1
  }
  return { added, titled }
}

const entry = process.argv[1] ?? ''
if (entry.endsWith('refresh-jiangbei.ts') || entry.endsWith('refresh-jiangbei.js')) {
  const client = new PrismaClient({ transactionOptions })
  try {
    const result = await refreshJiangbei(client)
    console.log(`KEEL REFRESH: Jiangbei salaries added=${result.added} titles=${result.titled}`)
  } catch (error) {
    console.error('KEEL REFRESH FAILED')
    console.error(error)
    process.exitCode = 1
  } finally {
    await client.$disconnect().catch(() => undefined)
    await serverPrisma.$disconnect().catch(() => undefined)
  }
}
