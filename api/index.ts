import { createApp } from '../server/app.ts'

const app = createApp()

// Vercel usually forwards the original path (`/api/session/login`). If a runtime
// strips the `/api` prefix, put it back so the Hono routes still match.
function requestForApp(request: Request) {
  const url = new URL(request.url)
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return request
  const suffix = url.pathname === '/' ? '' : url.pathname
  url.pathname = `/api${suffix}`
  return new Request(url, request)
}

function handler(request: Request) {
  return app.fetch(requestForApp(request))
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
export default { fetch: handler }
