import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { hashInviteToken } from '../server/services/invites.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''
let jonah = ''
let amira = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
  jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
  amira = await signIn('amira@harbourline.example', demoPasswords.amira)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('team invites', () => {
  it('refuses a user, isolates companies, and rejects an expired or reused token', async () => {
    const denied = await call('/api/invites', jonah, {
      method: 'POST',
      body: JSON.stringify({ email: 'new.clerk@northline.example', role: 'user' }),
    })
    expect(denied.status).toBe(403)

    const created = await call('/api/invites', maya, {
      method: 'POST',
      body: JSON.stringify({ email: 'new.clerk@northline.example', role: 'user' }),
    })
    expect(created.status).toBe(201)
    expect(created.body?.channel).toBe('log')
    expect(created.body?.emailed).toBe(false)
    const link = String(created.body?.link ?? '')
    expect(link).toContain('/invite/')
    const token = link.split('/invite/')[1] ?? ''
    const inviteId = created.body?.id as number

    const foreign = await call('/api/invites', amira)
    const foreignRows = foreign.body as unknown as Array<{ email: string }>
    expect(foreignRows.some((row) => row.email === 'new.clerk@northline.example')).toBe(false)
    const blocked = await call(`/api/invites/${inviteId}/revoke`, amira, { method: 'POST' })
    expect(blocked.status).toBe(404)

    const preview = await call(`/api/invites/${token}`, '')
    expect(preview.status).toBe(200)
    expect(preview.body).toMatchObject({ email: 'new.clerk@northline.example', status: 'pending' })

    const accepted = await call('/api/invites/accept', '', {
      method: 'POST',
      body: JSON.stringify({ token, name: 'New Clerk', password: 'keel-clerk-1' }),
    })
    expect(accepted.status).toBe(200)
    expect(accepted.setCookie).toContain('keel_session')
    const again = await call('/api/invites/accept', '', {
      method: 'POST',
      body: JSON.stringify({ token, name: 'New Clerk', password: 'keel-clerk-1' }),
    })
    expect(again.status).toBe(409)

    const expired = await call('/api/invites', maya, {
      method: 'POST',
      body: JSON.stringify({ email: 'late.clerk@northline.example', role: 'user' }),
    })
    const expiredToken = String(expired.body?.link ?? '').split('/invite/')[1] ?? ''
    await prisma.userInvite.update({
      where: { tokenHash: hashInviteToken(expiredToken) },
      data: { expiresAt: new Date('2020-01-01T00:00:00.000Z') },
    })
    const late = await call('/api/invites/accept', '', {
      method: 'POST',
      body: JSON.stringify({ token: expiredToken, name: 'Late Clerk', password: 'keel-clerk-1' }),
    })
    expect(late.status).toBe(409)
    expect(late.body?.error).toBe('That invite has expired.')
  })
})
