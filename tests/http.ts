import { createApp } from '../server/app.ts'

export async function signIn(email: string, password: string) {
  const response = await createApp().request('/api/session/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const setCookie = response.headers.get('set-cookie')
  if (response.status !== 200 || !setCookie?.includes('HttpOnly')) {
    throw new Error(`sign-in failed (${response.status})`)
  }
  return setCookie.split(';')[0] ?? ''
}

export async function call(path: string, cookie: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (cookie) headers.set('cookie', cookie)
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  const response = await createApp().request(path, { ...init, headers })
  const text = await response.text()
  return {
    status: response.status,
    body: text ? (JSON.parse(text) as Record<string, unknown>) : null,
    setCookie: response.headers.get('set-cookie'),
    serverTiming: response.headers.get('server-timing'),
  }
}
