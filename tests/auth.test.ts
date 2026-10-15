import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords, seedDatabase } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'

beforeAll(async () => {
  rmSync('prisma/test.db', { force: true })
  execSync('npx prisma db push --skip-generate', {
    stdio: 'pipe',
    env: { ...process.env, DATABASE_URL: 'file:./test.db' },
  })
  await seedDatabase(prisma)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('sessions', () => {
  it('rejects a bad password and blocks routes without a cookie', async () => {
    const denied = await call('/api/session/login', '', {
      method: 'POST',
      body: JSON.stringify({ email: 'maya@northline.example', password: 'not-the-password' }),
    })
    expect(denied.status).toBe(401)
    expect(denied.setCookie ?? '').not.toContain('keel_session=')

    const health = await call('/api/health', '')
    expect(health.status).toBe(200)

    const desk = await call('/api/desk', '')
    expect(desk.status).toBe(401)

    const headerOnly = await createSpoofedRequest()
    expect(headerOnly).toBe(401)
  })

  it('signs in with an httpOnly cookie, then signs out', async () => {
    const cookie = await signIn('maya@northline.example', demoPasswords.maya)
    expect(cookie.startsWith('keel_session=')).toBe(true)

    const me = await call('/api/session/me', cookie)
    expect(me.status).toBe(200)
    expect(me.body?.email).toBe('maya@northline.example')
    expect(me.body?.role).toBe('admin')
    expect(me.body).not.toHaveProperty('passwordHash')

    const loggedOut = await call('/api/session/logout', cookie, { method: 'POST' })
    expect(loggedOut.status).toBe(204)
    const again = await call('/api/session/me', cookie)
    expect(again.status).toBe(401)
  })

  it('lets an admin add a user and keeps a normal user out of that screen', async () => {
    const maya = await signIn('maya@northline.example', demoPasswords.maya)
    const jonah = await signIn('jonah@northline.example', demoPasswords.jonah)

    const forbidden = await call('/api/admin/users', jonah)
    expect(forbidden.status).toBe(403)

    const created = await call('/api/admin/users', maya, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Priya Shah',
        email: 'priya@northline.example',
        password: 'priya-temp-pass',
        role: 'user',
      }),
    })
    expect(created.status).toBe(201)
    expect(created.body).not.toHaveProperty('passwordHash')

    const priya = await signIn('priya@northline.example', 'priya-temp-pass')
    const changed = await call('/api/session/password', priya, {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'priya-temp-pass', newPassword: 'priya-new-pass' }),
    })
    expect(changed.status).toBe(200)
    const oldCookie = await call('/api/session/me', priya)
    expect(oldCookie.status).toBe(401)

    const signedIn = await signIn('priya@northline.example', 'priya-new-pass')
    expect((await call('/api/session/me', signedIn)).status).toBe(200)

    const reset = await call(`/api/admin/users/${created.body?.id}/password`, maya, {
      method: 'POST',
      body: JSON.stringify({ password: 'priya-reset-pass' }),
    })
    expect(reset.status).toBe(200)
    expect((await call('/api/session/me', signedIn)).status).toBe(401)
    expect((await signIn('priya@northline.example', 'priya-reset-pass')).startsWith('keel_session=')).toBe(true)
  })
})

async function createSpoofedRequest() {
  const maya = await prisma.user.findUniqueOrThrow({ where: { email: 'maya@northline.example' } })
  const response = await call('/api/desk', '', { headers: { 'x-user-id': String(maya.id) } })
  return response.status
}
