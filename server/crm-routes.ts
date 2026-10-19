import type { Hono } from 'hono'
import { crmActivitySchema, crmLeadSchema, crmStageSchema } from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import { asCrmGroup, crmAnalysis, crmAnalysisCsv } from './services/crm-analysis.ts'
import {
  activityBoard,
  addActivity,
  completeActivity,
  completeActivityById,
  convertLead,
  createLead,
  createLostReason,
  createTag,
  getLead,
  listLeads,
  listLostReasons,
  listTags,
  removeLostReason,
  removeTag,
  scheduleActivity,
  updateLead,
} from './services/crm.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  return parsed.data
}

export function registerCrmRoutes(app: Hono<AppEnv>) {
  app.get('/api/crm/activities', async (c) => {
    const user = c.get('user')
    return c.json(await activityBoard(user.companyId, user.id, c.req.query('mine') === '1', c.req.query('overdue') === '1'))
  })

  app.post('/api/crm/activities', async (c) => {
    const user = c.get('user')
    const input = parseBody(crmActivitySchema, await c.req.json())
    return c.json(await scheduleActivity(user.companyId, user.id, input), 201)
  })

  app.post('/api/crm/activities/:id/done', async (c) => {
    return c.json(await completeActivityById(c.get('user').companyId, Number(c.req.param('id'))))
  })

  app.get('/api/crm/analysis', async (c) => {
    const report = await crmAnalysis(c.get('user').companyId, asCrmGroup(c.req.query('group') ?? 'stage'))
    if (c.req.query('format') === 'csv') {
      return new Response(crmAnalysisCsv(report), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="crm-${report.group}.csv"`,
        },
      })
    }
    return c.json(report)
  })

  app.get('/api/crm/tags', async (c) => c.json(await listTags(c.get('user').companyId)))
  app.post('/api/crm/tags', async (c) => {
    const body = await c.req.json() as { name?: unknown }
    return c.json(await createTag(c.get('user').companyId, String(body.name ?? '')), 201)
  })
  app.delete('/api/crm/tags/:id', async (c) => c.json(await removeTag(c.get('user').companyId, Number(c.req.param('id')))))

  app.get('/api/crm/lost-reasons', async (c) => c.json(await listLostReasons(c.get('user').companyId)))
  app.post('/api/crm/lost-reasons', async (c) => {
    const body = await c.req.json() as { name?: unknown }
    return c.json(await createLostReason(c.get('user').companyId, String(body.name ?? '')), 201)
  })
  app.delete('/api/crm/lost-reasons/:id', async (c) => c.json(await removeLostReason(c.get('user').companyId, Number(c.req.param('id')))))

  app.get('/api/leads', async (c) => c.json(await listLeads(c.get('user').companyId)))
  app.post('/api/leads', async (c) => {
    const input = parseBody(crmLeadSchema, await c.req.json())
    return c.json(await createLead(c.get('user').companyId, c.get('user').id, input), 201)
  })
  app.get('/api/leads/:id', async (c) => c.json(await getLead(c.get('user').companyId, Number(c.req.param('id')))))
  app.patch('/api/leads/:id', async (c) => {
    const input = parseBody(crmLeadSchema.and(crmStageSchema), await c.req.json())
    return c.json(await updateLead(c.get('user').companyId, Number(c.req.param('id')), input))
  })
  app.post('/api/leads/:id/activities', async (c) => {
    const input = parseBody(crmActivitySchema, await c.req.json())
    return c.json(await addActivity(c.get('user').companyId, Number(c.req.param('id')), input), 201)
  })
  app.post('/api/leads/:id/activities/:activityId/done', async (c) => {
    return c.json(await completeActivity(c.get('user').companyId, Number(c.req.param('id')), Number(c.req.param('activityId'))))
  })
  app.post('/api/leads/:id/convert', async (c) => {
    return c.json(await convertLead(c.get('user').companyId, c.get('user').id, Number(c.req.param('id'))))
  })
}
