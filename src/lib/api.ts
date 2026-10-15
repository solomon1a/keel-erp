export class ApiError extends Error {
  details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.details = details
  }
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(path, { ...init, headers, credentials: 'same-origin' })
  if (response.status === 204) return undefined as T
  const body = (await response.json().catch(() => ({}))) as { error?: string; details?: unknown }
  if (!response.ok) {
    throw new ApiError(body.error ?? 'The request failed.', body.details)
  }
  return body as T
}
