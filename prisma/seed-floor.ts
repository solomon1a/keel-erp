import type { PrismaClient } from '@prisma/client'

// Documents and quantities only. No journals, so the seeded profit and balance sheet stay put.
export async function seedFloor(client: PrismaClient) {
  const companies = await client.company.findMany({ select: { id: true, name: true } })
  for (const company of companies) {
    if (await client.workstation.findFirst({ where: { companyId: company.id, name: 'Cutting bench' } })) continue
    const admin = await client.user.findFirst({ where: { companyId: company.id, role: 'admin' } })
    const warehouse = await client.warehouse.findFirst({ where: { companyId: company.id, isDefault: true } })
    const shelf = warehouse
      ? await client.stockLocation.findFirst({ where: { companyId: company.id, warehouseId: warehouse.id, type: 'internal' } })
      : null
    if (!admin || !warehouse || !shelf) continue

    const tag = `FL${company.id}`
    const cloth = await client.product.create({
      data: { companyId: company.id, name: 'Floor cloth', sku: `${tag}-RM`, type: 'product', kind: 'raw', listPrice: 0, costPrice: 8, purchasable: true },
    })
    const panel = await client.product.create({
      data: { companyId: company.id, name: 'Cut panel', sku: `${tag}-PANEL`, type: 'product', kind: 'finished', listPrice: 18, costPrice: 10, purchasable: false },
    })
    const apron = await client.product.create({
      data: { companyId: company.id, name: 'Shop apron', sku: `${tag}-APRON`, type: 'product', kind: 'finished', listPrice: 68, costPrice: 30, purchasable: false },
    })
    const offcut = await client.product.create({
      data: { companyId: company.id, name: 'Cloth offcut', sku: `${tag}-OFF`, type: 'product', kind: 'raw', listPrice: 0, costPrice: 1, purchasable: false },
    })
    await client.stockQuant.create({ data: { productId: cloth.id, locationId: shelf.id, quantity: 40 } })
    await client.stockQuant.create({ data: { productId: panel.id, locationId: shelf.id, quantity: 10 } })

    const bench = await client.workstation.create({
      data: { companyId: company.id, name: 'Cutting bench', hourRate: 60 },
    })
    const panelBom = await client.billOfMaterials.create({
      data: {
        companyId: company.id,
        productId: panel.id,
        yieldQty: 1,
        version: 1,
        active: true,
        notes: 'One panel from floor cloth, with a little expected loss at the knife.',
        lines: { create: [{ productId: cloth.id, quantity: 1.2, lossPercent: 5 }] },
      },
    })
    const apronBom = await client.billOfMaterials.create({
      data: {
        companyId: company.id,
        productId: apron.id,
        yieldQty: 1,
        version: 1,
        active: true,
        notes: 'An apron is one cut panel, a short bench operation, and a cloth offcut.',
        lines: { create: [{ productId: panel.id, quantity: 1, lossPercent: 0 }] },
        operations: { create: [{ sequence: 1, name: 'Cut and hem', workstationId: bench.id, hours: 0.5, lossPercent: 0 }] },
        byproducts: { create: [{ productId: offcut.id, quantity: 0.2 }] },
      },
    })

    const wip = await client.warehouse.create({
      data: { companyId: company.id, name: 'Work in progress', code: `WIP${company.id}`, isDefault: false },
    })
    const scrap = await client.warehouse.create({
      data: { companyId: company.id, name: 'Scrap', code: `SCR${company.id}`, isDefault: false },
    })
    const wipShelf = await client.stockLocation.create({
      data: { companyId: company.id, warehouseId: wip.id, name: 'WIP shelf', type: 'internal' },
    })
    await client.stockLocation.create({
      data: { companyId: company.id, warehouseId: scrap.id, name: 'Scrap bin', type: 'internal' },
    })
    await client.stockQuant.update({
      where: { productId_locationId: { productId: panel.id, locationId: shelf.id } },
      data: { quantity: 6 },
    })
    await client.stockQuant.create({ data: { productId: panel.id, locationId: wipShelf.id, quantity: 3 } })

    const order = await client.manufacturingOrder.create({
      data: {
        companyId: company.id,
        name: `MO-WIP-${company.id}`,
        state: 'progress',
        purpose: 'stock',
        productId: apron.id,
        bomId: apronBom.id,
        quantity: 4,
        quantityDone: 1,
        transferred: true,
        sourceWarehouseId: warehouse.id,
        destWarehouseId: warehouse.id,
        wipWarehouseId: wip.id,
        scrapWarehouseId: scrap.id,
        createdById: admin.id,
        lines: { create: [{ productId: panel.id, quantity: 4, consumed: 1, lossPercent: 0 }] },
      },
    })
    const card = await client.jobCard.create({
      data: {
        companyId: company.id,
        orderId: order.id,
        name: `JC-WIP-${company.id}`,
        sequence: 1,
        operationName: 'Cut and hem',
        workstationId: bench.id,
        plannedQty: 4,
        completedQty: 1,
        processLoss: 0.2,
        status: 'open',
        logs: { create: [{ operatorName: 'August', minutes: 30, note: 'First apron on the bench.' }] },
      },
    })
    await client.wastageEntry.create({
      data: {
        companyId: company.id,
        orderId: order.id,
        jobCardId: card.id,
        productId: panel.id,
        workstationId: bench.id,
        operationName: 'Cut and hem',
        quantity: 0.2,
        expectedQty: 0.2,
        reason: 'Frayed edge',
        kind: 'process_loss',
        cost: 2.02,
      },
    })
    await client.manufacturingOrder.create({
      data: {
        companyId: company.id,
        name: `MO-SUB-${company.id}`,
        state: 'confirmed',
        purpose: 'subcontract',
        productId: panel.id,
        bomId: panelBom.id,
        quantity: 2,
        sourceWarehouseId: warehouse.id,
        destWarehouseId: warehouse.id,
        createdById: admin.id,
        lines: { create: [{ productId: cloth.id, quantity: 2.52, lossPercent: 5 }] },
      },
    })
    await client.productionPlan.create({
      data: {
        companyId: company.id,
        name: `PLAN-FLOOR-${company.id}`,
        state: 'draft',
        lines: {
          create: [
            { productId: apron.id, demandQty: 6, onHand: 0, toMake: 6, toBuy: 0, bomId: apronBom.id },
            { productId: cloth.id, demandQty: 8, onHand: 40, toMake: 0, toBuy: 0, bomId: null },
          ],
        },
      },
    })
  }
}
