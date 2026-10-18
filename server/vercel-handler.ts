import { createApp } from './app.ts'

const app = createApp()

const publicCrawl = /^\/(?:sitemap\.xml|robots\.txt|site\/[^/]+\/(?:sitemap\.xml|robots\.txt))$/

// Vercel usually forwards the original path (`/api/session/login`, or
// `/site/jiangbei/sitemap.xml` after a rewrite whose destination is `/api`).
// If a runtime strips the `/api` prefix, put it back. Crawl files stay on the
// original URL because that is the route Hono matches.
function requestForApp(request: Request) {
  const url = new URL(request.url)
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return request
  if (publicCrawl.test(url.pathname)) return request
  const suffix = url.pathname === '/' ? '' : url.pathname
  url.pathname = `/api${suffix}`
  return new Request(url, request)
}

export function handler(request: Request) {
  return app.fetch(requestForApp(request))
}
