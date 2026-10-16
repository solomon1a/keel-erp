import type { Prisma } from '@prisma/client'
import {
  accessModels,
  grantFor,
  groupKeys,
  groupName,
  isAccessModel,
  isGroupKey,
  type AccessModel,
  type AccessOp,
  type GroupKey,
} from '../../shared/access.ts'
import { parseRole, type Role } from '../../shared/roles.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'

type Db = Tx | typeof prisma

const routes = [
  { name: 'Receive, QC, store', kind: 'incoming', steps: 'receive,qc,store' },
  { name: 'Pick, pack, ship', kind: 'outgoing', steps: 'pick,pack,ship' },
] as const

export async function ensureRoutes(db: Db, companyId: number) {
  for (const route of routes) {
    await db.stockRoute.upsert({
      where: { companyId_name: { companyId, name: route.name } },
      update: {},
      create: { companyId, name: route.name, kind: route.kind, steps: route.steps },
    })
  }
}

export async function ensureCompanyAccess(db: Db, companyId: number) {
  for (const key of groupKeys) {
    const group = await db.accessGroup.upsert({
      where: { companyId_key: { companyId, key } },
      update: {},
      create: { companyId, key, name: groupName(key) },
    })
    for (const model of accessModels) {
      const flags = {
        canRead: grantFor(key, 'read'),
        canWrite: grantFor(key, 'write'),
        canCreate: grantFor(key, 'create'),
        canDelete: grantFor(key, 'delete'),
      }
      await db.modelAccess.upsert({
        where: { groupId_model: { groupId: group.id, model } },
        update: {},
        create: { groupId: group.id, model, ...flags },
      })
    }
    if (key === 'settings') continue
    for (const model of accessModels) {
      const rule = await db.recordRule.findFirst({ where: { groupId: group.id, model, name: 'Same company' } })
      if (rule) continue
      await db.recordRule.create({
        data: { groupId: group.id, model, name: 'Same company', field: 'companyId', op: 'eq', value: '$company' },
      })
    }
  }
  await ensureRoutes(db, companyId)
}

export function groupsForRole(role: Role): GroupKey[] {
  switch (role) {
    case 'admin':
      return ['settings', 'manager']
    case 'user':
      return ['internal']
    default: {
      const unexpected: never = role
      return unexpected
    }
  }
}

export async function ensureMembership(db: Db, user: { id: number; companyId: number; role: Role }) {
  const [members, groups] = await Promise.all([
    db.groupMember.count({ where: { userId: user.id, group: { companyId: user.companyId } } }),
    db.accessGroup.count({ where: { companyId: user.companyId } }),
  ])
  if (members > 0 && groups >= groupKeys.length) return
  await ensureCompanyAccess(db, user.companyId)
  if (members > 0) return
  const keys = groupsForRole(user.role)
  const rows = await db.accessGroup.findMany({ where: { companyId: user.companyId, key: { in: [...keys] } } })
  if (rows.length === 0) return
  await db.groupMember.createMany({
    data: rows.map((group) => ({ groupId: group.id, userId: user.id })),
    skipDuplicates: true,
  })
}

export async function seedAccess(client: Tx | typeof prisma) {
  const companies = await client.company.findMany({ select: { id: true } })
  for (const company of companies) {
    await ensureCompanyAccess(client, company.id)
    const users = await client.user.findMany({
      where: { companyId: company.id },
      select: { id: true, companyId: true, role: true },
    })
    for (const user of users) {
      await ensureMembership(client, { id: user.id, companyId: user.companyId, role: parseRole(user.role) ?? 'user' })
    }
  }
}

type SessionLike = { id: number; companyId: number; role: string; name: string }

function allows(grant: { canRead: boolean; canWrite: boolean; canCreate: boolean; canDelete: boolean }, op: AccessOp) {
  switch (op) {
    case 'read':
      return grant.canRead
    case 'write':
      return grant.canWrite
    case 'create':
      return grant.canCreate
    case 'delete':
      return grant.canDelete
    default: {
      const unexpected: never = op
      return unexpected
    }
  }
}

export async function assertModelAccess(user: SessionLike, model: AccessModel, op: AccessOp) {
  await ensureMembership(prisma, { id: user.id, companyId: user.companyId, role: parseRole(user.role) ?? 'user' })
  const members = await prisma.groupMember.findMany({
    where: { userId: user.id, group: { companyId: user.companyId } },
    include: { group: { include: { grants: { where: { model } }, rules: { where: { model } } } } },
  })
  const allowed = members.some((row) => row.group.grants.some((grant) => allows(grant, op)))
  if (!allowed) throw new AppError(403, 'You do not have access to that.')
  if (members.some((row) => row.group.key === 'settings')) return []
  return members.flatMap((row) => row.group.rules)
}

export type RuleRow = { field: string; op: string; value: string }

export function ruleValue(rule: RuleRow, user: { id: number; name: string; companyId: number }) {
  switch (rule.value) {
    case '$company':
      return String(user.companyId)
    case '$user':
      return rule.field === 'userId' ? String(user.id) : user.name
    default:
      return rule.value
  }
}

export function deskRuleWhere(rules: RuleRow[], user: { id: number; name: string; companyId: number }): Prisma.DeskRecordWhereInput {
  const extra: Prisma.DeskRecordWhereInput[] = []
  for (const rule of rules) {
    const value = ruleValue(rule, user)
    switch (rule.field) {
      case 'companyId':
        if (rule.op === 'eq') extra.push({ companyId: Number(value) })
        break
      case 'owner':
        if (rule.op === 'eq') extra.push({ owner: value })
        if (rule.op === 'neq') extra.push({ NOT: { owner: value } })
        break
      case 'partner':
        if (rule.op === 'eq') extra.push({ partner: value })
        if (rule.op === 'neq') extra.push({ NOT: { partner: value } })
        break
      default:
        break
    }
  }
  if (extra.length === 0) return {}
  return { AND: extra }
}

export async function accessSnapshot(companyId: number) {
  await ensureCompanyAccess(prisma, companyId)
  const [groups, users] = await Promise.all([
    prisma.accessGroup.findMany({
      where: { companyId },
      include: { grants: { orderBy: { model: 'asc' } }, rules: { orderBy: { id: 'asc' } }, members: { select: { userId: true } } },
      orderBy: { key: 'asc' },
    }),
    prisma.user.findMany({
      where: { companyId },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ])
  return { groups, users }
}

export async function setUserGroups(companyId: number, userId: number, keys: string[]) {
  const parsed = keys.filter(isGroupKey)
  if (parsed.length !== keys.length) throw new AppError(400, 'Unknown group.')
  const user = await prisma.user.findFirst({ where: { id: userId, companyId } })
  if (!user) throw new AppError(404, 'That person is not on this desk.')
  await ensureCompanyAccess(prisma, companyId)
  const groups = await prisma.accessGroup.findMany({ where: { companyId, key: { in: parsed } } })
  await prisma.$transaction([
    prisma.groupMember.deleteMany({ where: { userId, group: { companyId } } }),
    prisma.groupMember.createMany({ data: groups.map((group) => ({ groupId: group.id, userId })) }),
  ])
}

export async function setGrant(
  companyId: number,
  groupKey: string,
  model: string,
  flags: { canRead: boolean; canWrite: boolean; canCreate: boolean; canDelete: boolean },
) {
  if (!isGroupKey(groupKey)) throw new AppError(400, 'Unknown group.')
  if (!isAccessModel(model)) throw new AppError(400, 'Unknown model.')
  const group = await prisma.accessGroup.findFirst({ where: { companyId, key: groupKey } })
  if (!group) throw new AppError(404, 'That group is not on this desk.')
  return prisma.modelAccess.update({
    where: { groupId_model: { groupId: group.id, model } },
    data: flags,
  })
}

export async function addRule(companyId: number, input: { groupKey: string; model: string; name: string; field: string; op: string; value: string }) {
  if (!isGroupKey(input.groupKey)) throw new AppError(400, 'Unknown group.')
  if (!isAccessModel(input.model)) throw new AppError(400, 'Unknown model.')
  if (input.op !== 'eq' && input.op !== 'neq') throw new AppError(400, 'A rule uses eq or neq.')
  const group = await prisma.accessGroup.findFirst({ where: { companyId, key: input.groupKey } })
  if (!group) throw new AppError(404, 'That group is not on this desk.')
  return prisma.recordRule.create({
    data: {
      groupId: group.id,
      model: input.model,
      name: input.name,
      field: input.field,
      op: input.op,
      value: input.value,
    },
  })
}

export async function deleteRule(companyId: number, ruleId: number) {
  const rule = await prisma.recordRule.findFirst({ where: { id: ruleId, group: { companyId } } })
  if (!rule) throw new AppError(404, 'That rule is not on this desk.')
  await prisma.recordRule.delete({ where: { id: rule.id } })
}
