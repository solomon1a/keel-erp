// The server source uses `.ts` import paths, which Vercel's Node runtime cannot
// load directly. scripts/vercel-build.sh bundles server/vercel-handler.ts into
// server-dist/handler.mjs before Vercel packages this function.
// @ts-ignore generated at build time
import { handler } from '../server-dist/handler.mjs'

export const GET = handler
export const POST = handler
export const PUT = handler
export const PATCH = handler
export const DELETE = handler
export const OPTIONS = handler
export default { fetch: handler }
