import { Prisma } from '@prisma/client'
import type { Hono } from 'hono'
import { findDeskScreen, settingsScreen } from '../shared/desk-screens.ts'
import { deskRecordPatchSchema, deskRecordSchema, moduleSettingsSchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { prisma } from './db.ts'
import { AppError } from './errors.ts'

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
    const companyId = c.get('user').companyId
    const module = c.req.query('module') ?? ''
    const screen = c.req.query('screen') ?? ''
    if (!findDeskScreen(module, screen)) throw new AppError(404, 'That page is not on this desk.')
    const q = (c.req.query('q') ?? '').trim()
    const state = c.req.query('state') ?? ''
    const where: Prisma.DeskRecordWhereInput = { companyId, module, screen }
    if (state && state !== 'all') where.state = state
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { partner: { contains: q, mode: 'insensitive' } },
        { owner: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
      ]
    }
    return c.json(await prisma.deskRecord.findMany({
      where,
      orderBy: [{ recordDate: 'desc' }, { id: 'desc' }],
    }))
  })

  app.post('/api/desk-records', async (c) => {
    const companyId = c.get('user').companyId
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
      return c.json(row, 201)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'A record with that name is already on this list.')
      }
      throw error
    }
  })

  app.get('/api/desk-records/:id', async (c) => {
    const row = await prisma.deskRecord.findFirst({
      where: { id: Number(c.req.param('id')), companyId: c.get('user').companyId },
    })
    if (!row) throw new AppError(404, 'That record is not in this company.')
    return c.json(row)
  })

  app.patch('/api/desk-records/:id', async (c) => {
    const companyId = c.get('user').companyId
    const existing = await prisma.deskRecord.findFirst({
      where: { id: Number(c.req.param('id')), companyId },
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
      return c.json(row)
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'A record with that name is already on this list.')
      }
      throw error
    }
  })

  app.get('/api/module-settings', async (c) => {
    const companyId = c.get('user').companyId
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
    const companyId = c.get('user').companyId
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
