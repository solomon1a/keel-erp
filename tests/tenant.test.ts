import { afterAll, describe, expect, it } from 'vitest'
import { demoPasswords, seedDatabase } from '../prisma/seed.ts'
import { primeSignupLimit } from '../server/rate-limit.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

afterAll(async () => {
  await prisma.$disconnect()
})

function signup(body: Record<string, unknown>, ip: string) {
  return call('/api/signup', '', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  })
}

describe('self-serve companies', () => {
  it('isolates a new company from the demo tenant and from a second signup', async () => {
    await resetAndSeed()
    const maya = await signIn('maya@northline.example', demoPasswords.maya)
    const created = await signup({
      companyName: 'North Glass Ltd',
      country: 'GB',
      name: 'Ada North',
      email: 'ada@northglass.example',
      password: 'keel-ada-desk',
      loadSample: true,
    }, '203.0.113.10')
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      name: 'Ada North',
      role: 'admin',
      locale: 'en',
      company: { name: 'North Glass Ltd', currency: 'GBP', defaultTaxRate: 20, city: 'London' },
    })
    const ada = created.setCookie?.split(';')[0] ?? ''
    expect(ada.startsWith('keel_session=')).toBe(true)

    const other = await signup({
      companyName: 'Plain Goods',
      country: 'OTHER',
      name: 'Bo Plain',
      email: 'bo@plain.example',
      password: 'keel-bo-desk',
      loadSample: false,
    }, '203.0.113.11')
    expect(other.status).toBe(201)
    expect(other.body).toMatchObject({
      locale: 'en',
      company: { name: 'Plain Goods', currency: 'EUR', defaultTaxRate: 0, city: '' },
    })
    const bo = other.setCookie?.split(';')[0] ?? ''

    const adaContacts = await call('/api/contacts', ada)
    const sample = (adaContacts.body as unknown as Array<{ id: number; name: string }>).find((row) => row.name === 'Sample Customer')
    expect(sample?.id).toBeTruthy()
    const boContacts = await call('/api/contacts', bo)
    expect(boContacts.body).toEqual([])
    expect((await call(`/api/contacts/${sample?.id}`, bo)).status).toBe(404)
    expect((await call(`/api/contacts/${sample?.id}`, maya)).status).toBe(404)

    const cedar = await prisma.contact.findFirstOrThrow({ where: { name: 'Cedar & Co' } })
    expect((await call(`/api/contacts/${cedar.id}`, ada)).status).toBe(404)
    const adaOrders = await call('/api/orders', ada)
    const quotation = (adaOrders.body as unknown as Array<{ id: number; name: string }>).find((row) => row.name === 'QT0001')
    expect(quotation?.id).toBeTruthy()
    expect((await call('/api/orders', bo)).body).toEqual([])
    expect((await call(`/api/orders/${quotation?.id}`, bo)).status).toBe(404)
    expect((await call(`/api/orders/${quotation?.id}`, maya)).status).toBe(404)

    const jiangbeiInvoice = await prisma.invoice.findFirstOrThrow({
      where: { name: 'INV0001', company: { name: 'Jiangbei Goods Co.' } },
    })
    expect((await call(`/api/invoices/${jiangbeiInvoice.id}`, ada)).status).toBe(404)
    const zhou = await prisma.employee.findFirstOrThrow({ where: { email: 'zhou.ning@northline.example' } })
    expect((await call(`/api/employees/${zhou.id}`, ada)).status).toBe(404)

    const hired = await call('/api/employees', ada, {
      method: 'POST',
      body: JSON.stringify({ name: 'Nia North', departmentId: null, active: true }),
    })
    expect(hired.status).toBe(201)
    const hiredId = (hired.body as { id: number }).id
    expect((await call(`/api/employees/${hiredId}`, bo)).status).toBe(404)
    const boStaff = await call('/api/employees', bo)
    expect(boStaff.body).toEqual([])

    const invited = await call('/api/admin/users', ada, {
      method: 'POST',
      body: JSON.stringify({ name: 'Ken North', email: 'ken@northglass.example', password: 'keel-ken-desk', role: 'user' }),
    })
    expect(invited.status).toBe(201)
    const ken = await signIn('ken@northglass.example', 'keel-ken-desk')
    const kenContacts = await call('/api/contacts', ken)
    expect((kenContacts.body as unknown as Array<{ name: string }>).some((row) => row.name === 'Sample Customer')).toBe(true)
    expect((await call(`/api/contacts/${cedar.id}`, ken)).status).toBe(404)
    const kenSettings = await call('/api/settings', ken)
    expect(kenSettings.body).toMatchObject({ name: 'North Glass Ltd', currency: 'GBP' })
    const mayaPeople = await call('/api/admin/users', maya)
    expect((mayaPeople.body as unknown as Array<{ email: string }>).some((row) => row.email === 'ken@northglass.example')).toBe(false)

    await seedDatabase(prisma)
    const names = (await prisma.company.findMany({ orderBy: { name: 'asc' } })).map((company) => company.name)
    expect(names).toEqual(['Harbour & Line', 'Hudson Yard Goods', 'Jiangbei Goods Co.', 'North Glass Ltd', 'Plain Goods'])
    expect(await prisma.salesOrder.count({ where: { name: 'SO1101' } })).toBe(3)
    expect(await prisma.user.count({ where: { email: 'ada@northglass.example' } })).toBe(1)
  })

  it('rejects a weak signup and slows a noisy address', async () => {
    await resetAndSeed()
    const weak = await signup({
      companyName: 'Weak Co',
      country: 'US',
      name: 'Pat Weak',
      email: 'not-an-email',
      password: 'short',
    }, '203.0.113.20')
    expect(weak.status).toBe(400)

    const china = await signup({
      companyName: 'Pudong Trial',
      country: 'CN',
      name: 'Lin Trial',
      email: 'lin.trial@pudong.example',
      password: 'keel-lin-trial',
    }, '203.0.113.21')
    expect(china.status).toBe(201)
    expect(china.body).toMatchObject({ locale: 'zh', company: { currency: 'CNY', defaultTaxRate: 13, city: 'Shanghai' } })

    const duplicate = await signup({
      companyName: 'Copy Co',
      country: 'CN',
      name: 'Lin Again',
      email: 'lin.trial@pudong.example',
      password: 'keel-lin-trial',
    }, '203.0.113.22')
    expect(duplicate.status).toBe(409)

    primeSignupLimit('203.0.113.99', 5)
    const limited = await signup({
      companyName: 'Too Fast',
      country: 'US',
      name: 'Rush',
      email: 'rush@fast.example',
      password: 'keel-rush-desk',
    }, '203.0.113.99')
    expect(limited.status).toBe(429)
  })
})
