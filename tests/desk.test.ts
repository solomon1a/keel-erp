import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { demoPasswords } from '../prisma/seed.ts'
import { prisma } from '../server/db.ts'
import { call, signIn } from './http.ts'
import { resetAndSeed } from './reset-db.ts'

let maya = ''

beforeAll(async () => {
  await resetAndSeed()
  maya = await signIn('maya@northline.example', demoPasswords.maya)
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('desk', () => {
  it('summarises sales, the pipeline, books, the shop, and staff', async () => {
    const desk = await call('/api/desk', maya)
    expect(desk.status).toBe(200)
    expect(desk.body).toMatchObject({
      openOrders: 1,
      pipelineValue: 3200,
      pipelineCount: 2,
      receivable: 97.18,
      payable: 0,
      shopOrders: 1,
      staff: 2,
      leaveWaiting: 1,
      profit: -12042,
      vatPayable: 11.18,
    })
  })
})
