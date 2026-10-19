import { roundMoney } from '../../src/domain/money.ts'
import { prisma } from '../db.ts'
import { AppError } from '../errors.ts'

const groups = ['stage', 'user', 'source', 'reason'] as const
export type CrmGroup = (typeof groups)[number]

const openStages = new Set(['new', 'qualified', 'proposition'])

export function asCrmGroup(value: string | undefined): CrmGroup {
  if (value === 'stage' || value === 'user' || value === 'source' || value === 'reason') return value
  throw new AppError(400, 'Choose stage, salesperson, source, or lost reason.')
}

type Bucket = { key: string; label: string; count: number; open: number; won: number; lost: number; expected: number }

function bucketFor(map: Map<string, Bucket>, key: string, label: string) {
  const existing = map.get(key)
  if (existing) return existing
  const created = { key, label, count: 0, open: 0, won: 0, lost: 0, expected: 0 }
  map.set(key, created)
  return created
}

function addLead(row: Bucket, stage: string, expected: number) {
  row.count += 1
  row.expected = roundMoney(row.expected + expected)
  if (openStages.has(stage)) row.open += 1
  if (stage === 'won') row.won += 1
  if (stage === 'lost') row.lost += 1
}

function finish(row: Bucket) {
  const closed = row.won + row.lost
  return { ...row, expected: roundMoney(row.expected), conversion: closed === 0 ? 0 : Math.round((row.won / closed) * 100) }
}

export async function crmAnalysis(companyId: number, group: CrmGroup) {
  const leads = await prisma.lead.findMany({
    where: { companyId },
    select: {
      stage: true,
      source: true,
      expectedRevenue: true,
      user: { select: { id: true, name: true } },
      lostReason: { select: { id: true, name: true } },
    },
  })
  const map = new Map<string, Bucket>()
  for (const lead of leads) {
    let key = 'none'
    let label = 'Unspecified'
    switch (group) {
      case 'stage':
        key = lead.stage
        label = lead.stage
        break
      case 'user':
        key = lead.user ? String(lead.user.id) : 'none'
        label = lead.user?.name ?? 'Unspecified'
        break
      case 'source':
        key = lead.source || 'none'
        label = lead.source || 'Unspecified'
        break
      case 'reason':
        if (lead.stage !== 'lost') continue
        key = lead.lostReason ? String(lead.lostReason.id) : 'none'
        label = lead.lostReason?.name ?? 'Unspecified'
        break
      default: {
        const unexpected: never = group
        throw new AppError(400, unexpected)
      }
    }
    addLead(bucketFor(map, key, label), lead.stage, lead.expectedRevenue)
  }
  const rows = [...map.values()].map(finish).sort((a, b) => b.expected - a.expected || a.label.localeCompare(b.label))
  const totals = rows.reduce((sum, row) => {
    sum.count += row.count
    sum.open += row.open
    sum.won += row.won
    sum.lost += row.lost
    sum.expected = roundMoney(sum.expected + row.expected)
    return sum
  }, { count: 0, open: 0, won: 0, lost: 0, expected: 0 })
  const closed = totals.won + totals.lost
  return {
    group,
    rows,
    totals: { ...totals, conversion: closed === 0 ? 0 : Math.round((totals.won / closed) * 100) },
  }
}

export function crmAnalysisCsv(report: Awaited<ReturnType<typeof crmAnalysis>>) {
  const header = ['label', 'count', 'open', 'won', 'lost', 'expected', 'conversion']
  const lines = report.rows.map((row) => [row.label, String(row.count), String(row.open), String(row.won), String(row.lost), String(row.expected), String(row.conversion)])
  const cell = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return [header, ...lines].map((line) => line.map(cell).join(',')).join('\n')
}
