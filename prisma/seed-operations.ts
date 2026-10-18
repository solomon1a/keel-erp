import type { PrismaClient } from '@prisma/client'
import { jiangbeiAssets, jiangbeiDepreciationAsOf, jiangbeiSubcontractBooks } from '../shared/demo-adjustments.ts'
import { prisma, transactionOptions } from '../server/db.ts'
import { createAssetTx, postDueDepreciation } from '../server/services/assets.ts'
import { createSubcontractOrderTx, receiveFinishedTx, sendComponentsTx } from '../server/services/subcontract.ts'
import { companyLocations } from '../server/services/stock.ts'

export async function seedJiangbeiOperations(client: PrismaClient) {
  const admin = await client.user.findUnique({
    where: { email: 'maya@northline.example' },
    select: { companyId: true },
  })
  if (!admin) throw new Error('Jiangbei admin is missing.')
  const companyId = admin.companyId
  for (const spec of jiangbeiAssets) {
    const existing = await client.asset.findFirst({ where: { companyId, name: spec.name } })
    if (!existing) {
      await prisma.$transaction(
        (tx) => createAssetTx(tx, companyId, {
          name: spec.name,
          purchaseValue: spec.cost,
          salvageValue: spec.salvage,
          start: spec.start,
          method: spec.method,
          months: spec.months,
        }),
        transactionOptions,
      )
    }
    const asset = await client.asset.findFirst({ where: { companyId, name: spec.name } })
    if (!asset) throw new Error(`Asset ${spec.name} was not created.`)
    await postDueDepreciation(companyId, asset.id, jiangbeiDepreciationAsOf)
  }

  const sub = jiangbeiSubcontractBooks
  const existingOrder = await client.subcontractOrder.findFirst({ where: { companyId, name: sub.order } })
  if (existingOrder) return
  await prisma.$transaction(async (tx) => {
    const vendor = await tx.contact.findFirst({ where: { companyId, name: sub.vendor, isSupplier: true } })
    if (!vendor) throw new Error(`${sub.vendor} is missing.`)
    const component = await tx.product.create({
      data: {
        companyId,
        name: 'Greige cloth',
        sku: sub.componentSku,
        type: 'product',
        kind: 'raw',
        listPrice: sub.componentCost,
        costPrice: sub.componentCost,
        costMethod: 'fifo',
        purchasable: true,
      },
    })
    const finished = await tx.product.create({
      data: {
        companyId,
        name: 'Dyed roll',
        sku: sub.finishedSku,
        type: 'product',
        kind: 'finished',
        listPrice: 40,
        costPrice: 0,
        costMethod: 'avco',
      },
    })
    const bom = await tx.billOfMaterials.create({
      data: {
        companyId,
        productId: finished.id,
        yieldQty: 1,
        active: true,
        lines: { create: [{ productId: component.id, quantity: sub.perUnit }] },
      },
    })
    const places = await companyLocations(tx, companyId)
    await tx.stockQuant.create({
      data: { productId: component.id, locationId: places.internal.id, quantity: 20 },
    })
    const order = await createSubcontractOrderTx(tx, companyId, {
      vendorId: vendor.id,
      productId: finished.id,
      bomId: bom.id,
      quantity: sub.ordered,
      fee: sub.feeEach,
      name: sub.order,
    })
    await sendComponentsTx(tx, companyId, order.id, [{ productId: component.id, quantity: sub.sent }], new Date('2026-04-18T00:00:00.000Z'))
    await receiveFinishedTx(tx, companyId, order.id, sub.received, new Date('2026-04-18T00:00:00.000Z'))
  }, transactionOptions)
}
