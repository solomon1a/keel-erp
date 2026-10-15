import { getUserId } from './session.ts'

export class ApiError extends Error {}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  const userId = getUserId()
  if (userId) headers.set('x-user-id', userId)

  const response = await fetch(path, { ...init, headers })
  if (response.status === 204) return undefined as T
  const body = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) {
    throw new ApiError(body.error ?? 'The request failed.')
  }
  return body as T
}
