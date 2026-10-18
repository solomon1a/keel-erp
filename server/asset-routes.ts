import type { Hono } from 'hono'
import {
  assetDisposeSchema,
  assetDraftSchema,
  assetFromBillSchema,
  assetPostDueSchema,
} from '../shared/schemas.ts'
import type { AppEnv } from './auth.ts'
import { AppError } from './errors.ts'
import {
  createAsset,
  disposeAsset,
  getAsset,
  listAssetCategories,
  listAssets,
  listBillLines,
  postDepreciationLine,
  postDueDepreciation,
} from './services/assets.ts'

function parseBody<T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false; error: { issues: Array<{ message: string }> } } }, body: unknown): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new AppError(400, parsed.error.issues[0]?.message ?? 'Check the form and try again.')
  return parsed.data
}

export function registerAssetRoutes(app: Hono<AppEnv>) {
  app.get('/api/assets', async (c) => c.json(await listAssets(c.get('user').companyId)))
  app.get('/api/assets/categories', async (c) => c.json(await listAssetCategories(c.get('user').companyId)))
  app.get('/api/assets/bill-lines', async (c) => c.json(await listBillLines(c.get('user').companyId)))
  app.post('/api/assets', async (c) => {
    const input = parseBody(assetDraftSchema, await c.req.json())
    return c.json(await createAsset(c.get('user').companyId, input), 201)
  })
  app.post('/api/assets/from-bill', async (c) => {
    const input = parseBody(assetFromBillSchema, await c.req.json())
    return c.json(await createAsset(c.get('user').companyId, { ...input, purchaseValue: input.purchaseValue ?? 1 }), 201)
  })
  app.get('/api/assets/:id', async (c) => c.json(await getAsset(c.get('user').companyId, Number(c.req.param('id')))))
  app.post('/api/assets/:id/post-due', async (c) => {
    const input = parseBody(assetPostDueSchema, await c.req.json())
    return c.json(await postDueDepreciation(c.get('user').companyId, Number(c.req.param('id')), input.asOf))
  })
  app.post('/api/assets/:id/lines/:lineId/post', async (c) => {
    return c.json(await postDepreciationLine(c.get('user').companyId, Number(c.req.param('id')), Number(c.req.param('lineId'))))
  })
  app.post('/api/assets/:id/dispose', async (c) => {
    const input = parseBody(assetDisposeSchema, await c.req.json())
    return c.json(await disposeAsset(c.get('user').companyId, Number(c.req.param('id')), input.price, input.date))
  })
}
