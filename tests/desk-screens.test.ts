import { afterAll, describe, expect, it } from 'vitest'
import { seedDatabase, demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

afterAll(async () => {
  await prisma.$disconnect()
})

describe('desk screens', () => {
  it('keeps seeded lists inside the company and does not copy them again', async () => {
    await resetAndSeed()
    const maya = await signIn('maya@northline.example', demoPasswords.maya)
    const jonah = await signIn('jonah@northline.example', demoPasswords.jonah)
    const amira = await signIn('amira@harbourline.example', demoPasswords.amira)

    const list = await call('/api/desk-records?module=sales&screen=to-invoice', maya)
    expect(list.status).toBe(200)
    const rows = list.body as unknown as Array<{ id: number; name: string; companyId: number }>
    const sample = rows.find((row) => row.name === 'SO1108')
    expect(sample?.id).toBeTruthy()
    expect((await call(`/api/desk-records/${sample?.id}`, jonah)).status).toBe(200)
    expect((await call(`/api/desk-records/${sample?.id}`, amira)).status).toBe(404)
    expect((await call('/api/desk-records?module=missing&screen=nope', maya)).status).toBe(404)

    const created = await call('/api/desk-records', maya, {
      method: 'POST',
      body: JSON.stringify({ module: 'sales', screen: 'tags', name: 'Spring fair', state: 'active', partner: 'Field Office' }),
    })
    expect(created.status).toBe(201)
    const createdId = (created.body as { id?: number }).id
    expect((await call(`/api/desk-records/${createdId}`, amira)).status).toBe(404)
    const tagged = await call('/api/desk-records?module=sales&screen=tags&q=spring', maya)
    expect((tagged.body as unknown as Array<{ name: string }>).some((row) => row.name === 'Spring fair')).toBe(true)

    const saved = await call('/api/module-settings', maya, {
      method: 'PUT',
      body: JSON.stringify({ module: 'sales', values: [{ key: 'validity', value: '45' }] }),
    })
    expect(saved.status).toBe(200)

    await seedDatabase()
    const again = await call('/api/desk-records?module=sales&screen=to-invoice', maya)
    expect((again.body as unknown as Array<{ name: string }>).filter((row) => row.name === 'SO1108')).toHaveLength(1)
    const settings = await call('/api/module-settings?module=sales', maya)
    const validity = (settings.body as unknown as Array<{ key: string; value: string }>).find((row) => row.key === 'validity')
    expect(validity?.value).toBe('45')

    const accounts = await call('/api/accounts', maya)
    expect(accounts.status).toBe(200)
    expect((accounts.body as unknown as Array<{ code: string }>).some((row) => row.code === '1122')).toBe(true)
    expect((await call('/api/accounts', amira)).status).toBe(200)
    const amiraCodes = (await call('/api/accounts', amira)).body as unknown as Array<{ code: string; id: number }>
    const mayaCodes = accounts.body as unknown as Array<{ id: number }>
    expect(amiraCodes.every((row) => !mayaCodes.some((mayaRow) => mayaRow.id === row.id))).toBe(true)

    const names = async (cookie: string, module: string, screen: string) => {
      const response = await call(`/api/desk-records?module=${module}&screen=${screen}`, cookie)
      expect(response.status).toBe(200)
      return (response.body as unknown as Array<{ name: string }>).map((row) => row.name)
    }
    expect(await names(maya, 'hr', 'applicants')).toContain('Chen Wei')
    expect(await names(amira, 'hr', 'applicants')).toContain('Chen Wei')
    expect(await names(maya, 'attendance', 'check-in')).toContain('Lin Xiao · 16 Apr')
    expect(await names(amira, 'attendance', 'sheet')).toContain('Amira Shah · April')
    expect(await names(maya, 'wastage', 'records')).toContain('WS111 dye spill')
    expect(await names(amira, 'purchase', 'requisitions')).toContain('RQ1046 dye lot')
    expect(await names(maya, 'accounting', 'bank')).toContain('Operating account')
    const jordan = await signIn('jordan@hudsonyard.example', demoPasswords.jordan)
    expect(await names(jordan, 'attendance', 'sheet')).toContain('Jordan Hale · April')
    expect(await names(jordan, 'wastage', 'records')).toContain('WS108 failed totes')
  })
})
