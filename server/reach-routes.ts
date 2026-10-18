import type { Hono } from 'hono'
import { type AppEnv, readSessionToken, requireAdmin, userFromToken } from './auth.ts'
import { prisma } from './db.ts'
import { requestOrigin } from './invite-routes.ts'
import { AppError } from './errors.ts'
import {
  fillList,
  getCampaign,
  listCampaigns,
  listLists,
  listSuppressions,
  listTemplates,
  createList,
  recordClick,
  recordOpen,
  saveCampaign,
  saveTemplate,
  sendCampaign,
  suppress,
  unsubscribe,
} from './services/marketing.ts'
import {
  builderState,
  publicSite,
  publishPage,
  publishPost,
  reorderPages,
  robotsTxt,
  saveMenu,
  savePage,
  savePost,
  saveTheme,
  sitemapXml,
  submitContact,
} from './services/website.ts'

const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

function publishState(value: string) {
  switch (value) {
    case 'draft':
    case 'published':
      return value
    default:
      throw new AppError(400, 'Choose draft or published.')
  }
}

export function registerReachRoutes(app: Hono<AppEnv>) {
  app.get('/api/mail/lists', async (c) => c.json(await listLists(c.get('user').companyId)))
  app.post('/api/mail/lists', async (c) => {
    const body = await c.req.json()
    return c.json(await createList(c.get('user').companyId, body), 201)
  })
  app.post('/api/mail/lists/:id/fill', async (c) => c.json(await fillList(c.get('user').companyId, Number(c.req.param('id')))))
  app.get('/api/mail/suppression', async (c) => c.json(await listSuppressions(c.get('user').companyId)))
  app.post('/api/mail/suppression', async (c) => {
    const body = await c.req.json()
    return c.json(await suppress(c.get('user').companyId, String(body.email ?? ''), String(body.reason ?? '')))
  })
  app.get('/api/mail/templates', async (c) => c.json(await listTemplates(c.get('user').companyId)))
  app.post('/api/mail/templates', async (c) => c.json(await saveTemplate(c.get('user').companyId, await c.req.json())))
  app.get('/api/campaigns', async (c) => c.json(await listCampaigns(c.get('user').companyId)))
  app.get('/api/campaigns/:id', async (c) => c.json(await getCampaign(c.get('user').companyId, Number(c.req.param('id')))))
  app.post('/api/campaigns', async (c) => c.json(await saveCampaign(c.get('user').companyId, await c.req.json())))
  app.post('/api/campaigns/:id/send', async (c) => {
    requireAdmin(c.get('user'))
    const body = await c.req.json().catch(() => ({}))
    return c.json(await sendCampaign(c.get('user').companyId, Number(c.req.param('id')), requestOrigin(c), body.email))
  })

  app.get('/api/mail/open/:token', async (c) => {
    await recordOpen(c.req.param('token'))
    return new Response(pixel, { headers: { 'content-type': 'image/gif', 'cache-control': 'no-store' } })
  })
  app.get('/api/mail/click/:token', async (c) => {
    const url = await recordClick(c.req.param('token'), c.req.query('url') ?? '')
    return c.redirect(url)
  })
  app.get('/api/mail/unsubscribe/:token', async (c) => {
    const ok = await unsubscribe(c.req.param('token'))
    const message = ok ? 'You are unsubscribed. We will not mail this address again.' : 'That unsubscribe link is not valid.'
    return c.html(`<!doctype html><title>Unsubscribe</title><body style="font-family:Georgia,serif;padding:48px"><p>${message}</p></body>`)
  })

  app.get('/api/sites', async (c) => c.json(await builderState(c.get('user').companyId)))
  app.post('/api/sites/theme', async (c) => c.json(await saveTheme(c.get('user').companyId, await c.req.json())))
  app.post('/api/sites/menu', async (c) => {
    const body = await c.req.json()
    return c.json(await saveMenu(c.get('user').companyId, Array.isArray(body.items) ? body.items : []))
  })
  app.post('/api/sites/pages', async (c) => c.json(await savePage(c.get('user').companyId, await c.req.json())))
  app.post('/api/sites/pages/reorder', async (c) => {
    const body = await c.req.json()
    return c.json(await reorderPages(c.get('user').companyId, Array.isArray(body.ids) ? body.ids.map(Number) : []))
  })
  app.post('/api/sites/pages/:id/publish', async (c) => {
    requireAdmin(c.get('user'))
    const body = await c.req.json()
    return c.json(await publishPage(c.get('user').companyId, Number(c.req.param('id')), publishState(String(body.state ?? ''))))
  })
  app.post('/api/sites/posts', async (c) => c.json(await savePost(c.get('user').companyId, await c.req.json())))
  app.post('/api/sites/posts/:id/publish', async (c) => {
    requireAdmin(c.get('user'))
    const body = await c.req.json()
    return c.json(await publishPost(c.get('user').companyId, Number(c.req.param('id')), publishState(String(body.state ?? ''))))
  })

  app.get('/api/site/:slug/sitemap.xml', async (c) => {
    const site = await publicSite(c.req.param('slug'), false)
    const xml = sitemapXml(requestOrigin(c), c.req.param('slug'), site.pages, site.posts)
    return c.body(xml, 200, { 'content-type': 'application/xml; charset=utf-8' })
  })
  app.get('/api/site/:slug/robots.txt', async (c) => {
    return c.body(robotsTxt(requestOrigin(c), c.req.param('slug')), 200, { 'content-type': 'text/plain; charset=utf-8' })
  })
  app.get('/api/site/:slug', async (c) => {
    const preview = c.req.query('preview') === '1'
    if (preview) {
      const user = await userFromToken(readSessionToken(c))
      const company = await prisma.company.findFirst({ where: { slug: c.req.param('slug') }, select: { id: true } })
      if (!user || !company || user.companyId !== company.id) throw new AppError(403, 'Only this company can preview drafts.')
      return c.json(await publicSite(c.req.param('slug'), true))
    }
    return c.json(await publicSite(c.req.param('slug'), false))
  })
  app.post('/api/site/:slug/contact', async (c) => {
    const user = await userFromToken(readSessionToken(c))
    return c.json(await submitContact(c.req.param('slug'), await c.req.json(), user?.id ?? null), 201)
  })
}
