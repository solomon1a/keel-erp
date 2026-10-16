import { Prisma } from '@prisma/client'
import type { Hono } from 'hono'
import { findDeskScreen, settingsScreen } from '../shared/desk-screens.ts'
import { deskListMeta } from '../shared/views.ts'
import { deskRecordPatchSchema, deskRecordSchema, moduleSettingsSchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { prisma } from './db.ts'
import { AppError } from './errors.ts'
import { assertModelAccess, deskRuleWhere } from './services/access.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  return parsed.data
}

function parseDate(value: string | undefined) {
  if (!value) return new Date()
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new AppError(400, 'Enter a valid date.')
  return date
}

export function registerDeskRoutes(app: Hono<AppEnv>) {
  app.get('/api/desk-records', async (c) => {
    const user = c.get('user')
    const companyId = user.companyId
    const rules = await assertModelAccess(user, 'desk.record', 'read')
    const module = c.req.query('module') ?? ''
    const screen = c.req.query('screen') ?? ''
    if (!findDeskScreen(module, screen)) throw new AppError(404, 'That page is not on this desk.')
    const q = (c.req.query('q') ?? '').trim()
    const state = c.req.query('state') ?? ''
    const where: Prisma.DeskRecordWhereInput = { companyId, module, screen, ...deskRuleWhere(rules, user) }
    if (state && state !== 'all') where.state = state
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { partner: { contains: q, mode: 'insensitive' } },
        { owner: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ]
    }
    const orderBy = [{ recordDate: 'desc' as const }, { id: 'desc' as const }]
    const pageRaw = c.req.query('page')
    if (!pageRaw) {
      return c.json(await prisma.deskRecord.findMany({ where, orderBy }))
    }
    const page = Math.max(1, Number(pageRaw) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize') ?? deskListMeta.pageSize) || deskListMeta.pageSize))
    const [rows, total] = await Promise.all([
      prisma.deskRecord.findMany({ where, orderBy, skip: (page - 1) * pageSize, take: pageSize }),
      prisma.deskRecord.count({ where }),
    ])
    return c.json({ rows, total, page, pageSize })
  })

  app.post('/api/desk-records', async (c) => {
    const user = c.get('user')
    const companyId = user.companyId
    await assertModelAccess(user, 'desk.record', 'create')
    const input = parseBody(deskRecordSchema, await c.req.json())
    const screen = findDeskScreen(input.module, input.screen)
    if (!screen || screen.kind !== 'list') throw new AppError(404, 'That page is not on this desk.')
    const state = input.state || screen.states[0] || 'draft'
    if (screen.states.length > 0 && !screen.states.includes(state)) throw new AppError(400, 'That status is not used here.')
    try {
      const row = await prisma.deskRecord.create({
        data: {
          companyId,
          module: input.module,
          screen: input.screen,
          name: input.name,
          state,
          partner: input.partner ?? '',
          owner: input.owner ?? '',
          bucket: input.bucket ?? '',
          amount: input.amount ?? 0,
          notes: input.notes ?? '',
          recordDate: parseDate(input.recordDate),
        },
      })
      await prisma.chatterMessage.create({
        data: {
          companyId,
          model: 'desk.record',
          recordId: row.id,
          userId: user.id,
          kind: 'note',
          summary: `${user.name} created ${row.name}.`,
        },
      })
      return c.json(row, 201)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'A record with that name is already on this list.')
      }
      throw error
    }
  })

  app.get('/api/desk-records/:id', async (c) => {
    const user = c.get('user')
    const rules = await assertModelAccess(user, 'desk.record', 'read')
    const row = await prisma.deskRecord.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId, ...deskRuleWhere(rules, user) },
    })
    if (!row) throw new AppError(404, 'That record is not in this company.')
    return c.json(row)
  })

  app.patch('/api/desk-records/:id', async (c) => {
    const user = c.get('user')
    const companyId = user.companyId
    const rules = await assertModelAccess(user, 'desk.record', 'write')
    const existing = await prisma.deskRecord.findFirst({
      where: { id: Number(c.req.param('id')), companyId, ...deskRuleWhere(rules, user) },
    })
    if (!existing) throw new AppError(404, 'That record is not in this company.')
    const screen = findDeskScreen(existing.module, existing.screen)
    if (!screen || screen.kind !== 'list') throw new AppError(404, 'That page is not on this desk.')
    const input = parseBody(deskRecordPatchSchema, await c.req.json())
    const state = input.state ?? existing.state
    if (screen.states.length > 0 && !screen.states.includes(state)) throw new AppError(400, 'That status is not used here.')
    try {
      const row = await prisma.deskRecord.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          state,
          partner: input.partner ?? '',
          owner: input.owner ?? '',
          bucket: input.bucket ?? '',
          amount: input.amount ?? 0,
          notes: input.notes ?? '',
          recordDate: input.recordDate ? parseDate(input.recordDate) : existing.recordDate,
        },
      })
      const summary = existing.state === row.state
        ? `${user.name} updated ${row.name}.`
        : `${user.name} moved ${row.name} from ${existing.state} to ${row.state}.`
      await prisma.chatterMessage.create({
        data: { companyId, model: 'desk.record', recordId: row.id, userId: user.id, kind: 'change', summary },
      })
      return c.json(row)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'A record with that name is already on this list.')
      }
      throw error
    }
  })

  app.delete('/api/desk-records/:id', async (c) => {
    const user = c.get('user')
    const rules = await assertModelAccess(user, 'desk.record', 'delete')
    const existing = await prisma.deskRecord.findFirst({
      where: { id: Number(c.req.param('id')), companyId: user.companyId, ...deskRuleWhere(rules, user) },
    })
    if (!existing) throw new AppError(404, 'That record is not in this company.')
    await prisma.deskRecord.delete({ where: { id: existing.id } })
    return c.json({ ok: true })
  })

  app.get('/api/module-settings', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'desk.record', 'read')
    const companyId = user.companyId
    const module = c.req.query('module') ?? ''
    const screen = settingsScreen(module)
    if (!screen) throw new AppError(404, 'That page is not on this desk.')
    const saved = await prisma.moduleSetting.findMany({ where: { companyId, module } })
    const byKey = new Map(saved.map((row) => [row.key, row.value]))
    return c.json(screen.settings.map((field) => ({
      key: field.key,
      labelEn: field.labelEn,
      labelZh: field.labelZh,
      value: byKey.get(field.key) ?? field.value,
    })))
  })

  app.put('/api/module-settings', async (c) => {
    const user = c.get('user')
    await assertModelAccess(user, 'desk.record', 'write')
    const companyId = user.companyId
    const input = parseBody(moduleSettingsSchema, await c.req.json())
    const screen = settingsScreen(input.module)
    if (!screen) throw new AppError(404, 'That page is not on this desk.')
    const allowed = new Set(screen.settings.map((field) => field.key))
    for (const row of input.values) {
      if (!allowed.has(row.key)) throw new AppError(400, 'That setting is not on this page.')
    }
    await prisma.$transaction(input.values.map((row) => prisma.moduleSetting.upsert({
      where: { companyId_module_key: { companyId, module: input.module, key: row.key } },
      update: { value: row.value },
      create: { companyId, module: input.module, key: row.key, value: row.value },
    })))
    return c.json({ ok: true })
  })
}
