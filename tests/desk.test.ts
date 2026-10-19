import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { jiangbeiBooks } from '../prisma/seed-books.ts'
import { demoPasswords } from '../prisma/seed.ts'
import { volumeDesk } from '../prisma/volume-plan.ts'
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
      openOrders: volumeDesk.openOrders,
      pipelineValue: volumeDesk.pipelineValue,
      pipelineCount: volumeDesk.pipelineCount,
      receivable: jiangbeiBooks.receivable,
      payable: jiangbeiBooks.payable,
      shopOrders: volumeDesk.shopOrders,
      staff: volumeDesk.staff,
      leaveWaiting: volumeDesk.leaveWaiting,
      profit: jiangbeiBooks.profit,
      vatPayable: jiangbeiBooks.vatPayable,
    })
  })
})
