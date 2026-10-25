import { prisma, type Tx } from '../db.ts'

type Db = Tx | typeof prisma

export async function readSetting(db: Db, companyId: number, module: string, key: string, fallback: string) {
  const row = await db.moduleSetting.findUnique({
    where: { companyId_module_key: { companyId, module, key } },
  })
  const value = row?.value.trim()
  return value ? value : fallback
}

export async function namedUserId(db: Db, companyId: number, name: string) {
  if (!name || name === 'Direct') return null
  const user = await db.user.findFirst({ where: { companyId, name }, select: { id: true } })
  return user?.id ?? null
}
