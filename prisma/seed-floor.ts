import type { PrismaClient } from '@prisma/client'

// Documents and quantities only. No journals, so the seeded profit and balance sheet stay put.
// Each named document is created only when that name is missing. A workstation that already
// exists does not skip the bills, work orders, job cards, plan, or wastage.
export async function seedFloor(client: PrismaClient) {
  const companies = await client.company.findMany({ select: { id: true, name: true } })
  const failures: string[] = []
  for (const company of companies) {
    try {
      await seedCompanyFloor(client, company)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`seed-floor: ${company.name} failed: ${message}`)
      if (error instanceof Error && error.stack) console.error(error.stack)
      failures.push(`${company.name}: ${message}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`seed-floor did not finish: ${failures.join('; ')}`)
  }
}

async function seedCompanyFloor(client: PrismaClient, company: { id: number; name: string }) {
  const added: string[] = []
  const admin = await client.user.findFirst({ where: { companyId: company.id, role: 'admin' } })
  const warehouse = await client.warehouse.findFirst({ where: { companyId: company.id, isDefault: true } })
  const shelf = warehouse
    ? await client.stockLocation.findFirst({ where: { companyId: company.id, warehouseId: warehouse.id, type: 'internal' } })
    : null
  if (!admin || !warehouse || !shelf) {
    console.log(`seed-floor: ${company.name} has no default shelf, so floor documents were not added.`)
    return
  }

  const tag = `FL${company.id}`
  const cloth = await ensureProduct(client, company.id, {
    name: 'Floor cloth',
    sku: `${tag}-RM`,
    kind: 'raw',
    listPrice: 0,
    costPrice: 8,
    purchasable: true,
  }, added)
  const panel = await ensureProduct(client, company.id, {
    name: 'Cut panel',
    sku: `${tag}-PANEL`,
    kind: 'finished',
    listPrice: 18,
    costPrice: 10,
    purchasable: false,
  }, added)
  const apron = await ensureProduct(client, company.id, {
    name: 'Shop apron',
    sku: `${tag}-APRON`,
    kind: 'finished',
    listPrice: 68,
    costPrice: 30,
    purchasable: false,
  }, added)
  const offcut = await ensureProduct(client, company.id, {
    name: 'Cloth offcut',
    sku: `${tag}-OFF`,
    kind: 'raw',
    listPrice: 0,
    costPrice: 1,
    purchasable: false,
  }, added)
  await ensureQuant(client, cloth.id, shelf.id, 40, added, cloth.sku)
  const bench = await ensureWorkstation(client, company.id, added)

  const panelBom = await ensureBom(client, company.id, panel.id, {
    notes: 'One panel from floor cloth, with a little expected loss at the knife.',
    lines: [{ productId: cloth.id, quantity: 1.2, lossPercent: 5 }],
  }, added, 'Cut panel bill')
  const apronBom = await ensureBom(client, company.id, apron.id, {
    notes: 'An apron is one cut panel, a short bench operation, and a cloth offcut.',
    lines: [{ productId: panel.id, quantity: 1, lossPercent: 0 }],
    operations: [{ sequence: 1, name: 'Cut and hem', workstationId: bench.id, hours: 0.5, lossPercent: 0 }],
    byproducts: [{ productId: offcut.id, quantity: 0.2 }],
  }, added, 'Shop apron bill')

  const wip = await ensureWarehouse(client, company.id, 'Work in progress', `WIP${company.id}`, added)
  const scrap = await ensureWarehouse(client, company.id, 'Scrap', `SCR${company.id}`, added)
  const wipShelf = await ensureLocation(client, company.id, wip.id, 'WIP shelf', added)
  await ensureLocation(client, company.id, scrap.id, 'Scrap bin', added)
  await ensureQuant(client, panel.id, shelf.id, 6, added, `${panel.sku} shelf`)
  await ensureQuant(client, panel.id, wipShelf.id, 3, added, `${panel.sku} WIP`)

  const order = await ensureOrder(client, {
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
    line: { productId: panel.id, quantity: 4, consumed: 1, lossPercent: 0 },
  }, added)
  const card = await ensureJobCard(client, {
    companyId: company.id,
    orderId: order.id,
    name: `JC-WIP-${company.id}`,
    workstationId: bench.id,
  }, added)
  await ensureWastage(client, {
    companyId: company.id,
    orderId: order.id,
    jobCardId: card.id,
    productId: panel.id,
    workstationId: bench.id,
  }, added)
  await ensureOrder(client, {
    companyId: company.id,
    name: `MO-SUB-${company.id}`,
    state: 'confirmed',
    purpose: 'subcontract',
    productId: panel.id,
    bomId: panelBom.id,
    quantity: 2,
    quantityDone: 0,
    transferred: false,
    sourceWarehouseId: warehouse.id,
    destWarehouseId: warehouse.id,
    wipWarehouseId: null,
    scrapWarehouseId: null,
    createdById: admin.id,
    line: { productId: cloth.id, quantity: 2.52, consumed: 0, lossPercent: 5 },
  }, added)
  await ensurePlan(client, company.id, apron.id, apronBom.id, cloth.id, added)
  await seedShopCenters(client, company.id, admin.id, warehouse.id, bench.id, apron.id, apronBom.id, added)

  console.log(`seed-floor: ${company.name} ${added.length > 0 ? `added ${added.join(', ')}` : 'already had the named floor documents'}.`)
}

async function ensureProduct(
  client: PrismaClient,
  companyId: number,
  input: { name: string; sku: string; kind: string; listPrice: number; costPrice: number; purchasable: boolean },
  added: string[],
) {
  const existing = await client.product.findFirst({ where: { companyId, sku: input.sku } })
  if (existing) return existing
  added.push(input.name)
  return client.product.create({
    data: { companyId, name: input.name, sku: input.sku, type: 'product', kind: input.kind, listPrice: input.listPrice, costPrice: input.costPrice, purchasable: input.purchasable },
  })
}

async function ensureQuant(client: PrismaClient, productId: number, locationId: number, quantity: number, added: string[], label: string) {
  const existing = await client.stockQuant.findUnique({ where: { productId_locationId: { productId, locationId } } })
  if (existing) return
  added.push(label)
  await client.stockQuant.create({ data: { productId, locationId, quantity } })
}

async function ensureWorkstation(client: PrismaClient, companyId: number, added: string[]) {
  const existing = await client.workstation.findFirst({ where: { companyId, name: 'Cutting bench' } })
  if (existing) return existing
  added.push('Cutting bench')
  return client.workstation.create({ data: { companyId, name: 'Cutting bench', hourRate: 60 } })
}

async function ensureWarehouse(client: PrismaClient, companyId: number, name: string, code: string, added: string[]) {
  const existing = await client.warehouse.findFirst({ where: { companyId, code } })
  if (existing) return existing
  added.push(name)
  return client.warehouse.create({ data: { companyId, name, code, isDefault: false } })
}

async function ensureLocation(client: PrismaClient, companyId: number, warehouseId: number, name: string, added: string[]) {
  const existing = await client.stockLocation.findFirst({ where: { companyId, warehouseId, name, type: 'internal' } })
  if (existing) return existing
  added.push(name)
  return client.stockLocation.create({ data: { companyId, warehouseId, name, type: 'internal' } })
}

async function ensureBom(
  client: PrismaClient,
  companyId: number,
  productId: number,
  recipe: {
    notes: string
    lines: Array<{ productId: number; quantity: number; lossPercent: number }>
    operations?: Array<{ sequence: number; name: string; workstationId: number; hours: number; lossPercent: number }>
    byproducts?: Array<{ productId: number; quantity: number }>
  },
  added: string[],
  label: string,
) {
  const existing = await client.billOfMaterials.findFirst({
    where: { companyId, productId },
    orderBy: [{ active: 'desc' }, { version: 'desc' }],
  })
  if (existing) return existing
  added.push(label)
  return client.billOfMaterials.create({
    data: {
      companyId,
      productId,
      yieldQty: 1,
      version: 1,
      active: true,
      notes: recipe.notes,
      lines: { create: recipe.lines },
      operations: recipe.operations ? { create: recipe.operations } : undefined,
      byproducts: recipe.byproducts ? { create: recipe.byproducts } : undefined,
    },
  })
}

async function ensureOrder(
  client: PrismaClient,
  input: {
    companyId: number
    name: string
    state: string
    purpose: string
    productId: number
    bomId: number
    quantity: number
    quantityDone: number
    transferred: boolean
    sourceWarehouseId: number
    destWarehouseId: number
    wipWarehouseId: number | null
    scrapWarehouseId: number | null
    createdById: number
    line: { productId: number; quantity: number; consumed: number; lossPercent: number }
  },
  added: string[],
) {
  const existing = await client.manufacturingOrder.findFirst({ where: { companyId: input.companyId, name: input.name } })
  if (existing) return existing
  added.push(input.name)
  return client.manufacturingOrder.create({
    data: {
      companyId: input.companyId,
      name: input.name,
      state: input.state,
      purpose: input.purpose,
      productId: input.productId,
      bomId: input.bomId,
      quantity: input.quantity,
      quantityDone: input.quantityDone,
      transferred: input.transferred,
      sourceWarehouseId: input.sourceWarehouseId,
      destWarehouseId: input.destWarehouseId,
      wipWarehouseId: input.wipWarehouseId,
      scrapWarehouseId: input.scrapWarehouseId,
      createdById: input.createdById,
      lines: { create: [input.line] },
    },
  })
}

async function ensureJobCard(
  client: PrismaClient,
  input: { companyId: number; orderId: number; name: string; workstationId: number },
  added: string[],
) {
  const existing = await client.jobCard.findFirst({ where: { companyId: input.companyId, name: input.name } })
  const card = existing ?? await client.jobCard.create({
    data: {
      companyId: input.companyId,
      orderId: input.orderId,
      name: input.name,
      sequence: 1,
      operationName: 'Cut and hem',
      workstationId: input.workstationId,
      plannedQty: 4,
      completedQty: 1,
      processLoss: 0.2,
      status: 'open',
    },
  })
  if (!existing) added.push(input.name)
  const log = await client.jobTimeLog.findFirst({ where: { jobCardId: card.id, note: 'First apron on the bench.' } })
  if (!log) {
    await client.jobTimeLog.create({
      data: { jobCardId: card.id, operatorName: 'August', minutes: 30, note: 'First apron on the bench.' },
    })
    if (existing) added.push(`${input.name} time log`)
  }
  return card
}

async function ensureWastage(
  client: PrismaClient,
  input: { companyId: number; orderId: number; jobCardId: number; productId: number; workstationId: number },
  added: string[],
) {
  const existing = await client.wastageEntry.findFirst({
    where: { companyId: input.companyId, orderId: input.orderId, reason: 'Frayed edge' },
  })
  if (existing) return
  added.push('Frayed edge')
  await client.wastageEntry.create({
    data: {
      companyId: input.companyId,
      orderId: input.orderId,
      jobCardId: input.jobCardId,
      productId: input.productId,
      workstationId: input.workstationId,
      operationName: 'Cut and hem',
      quantity: 0.2,
      expectedQty: 0.2,
      reason: 'Frayed edge',
      kind: 'process_loss',
      cost: 2.02,
    },
  })
}

async function ensureNamedStation(
  client: PrismaClient,
  companyId: number,
  input: {
    name: string
    hourRate: number
    capacityHours: number
    startMinutes: number
    endMinutes: number
    workingDays: string
    efficiency: number
  },
  added: string[],
) {
  const existing = await client.workstation.findFirst({ where: { companyId, name: input.name } })
  if (existing) return existing
  added.push(input.name)
  return client.workstation.create({ data: { companyId, ...input } })
}

async function seedShopCenters(
  client: PrismaClient,
  companyId: number,
  adminId: number,
  warehouseId: number,
  benchId: number,
  apronId: number,
  apronBomId: number,
  added: string[],
) {
  const dye = await ensureNamedStation(client, companyId, {
    name: 'Dye vat',
    hourRate: 48,
    capacityHours: 8,
    startMinutes: 540,
    endMinutes: 1020,
    workingDays: '1,2,3,4,5',
    efficiency: 92,
  }, added)
  const hem = await ensureNamedStation(client, companyId, {
    name: 'Hem station',
    hourRate: 36,
    capacityHours: 6,
    startMinutes: 480,
    endMinutes: 840,
    workingDays: '1,2,3,4,5',
    efficiency: 88,
  }, added)
  const tag = `FL${companyId}`
  const dyed = await ensureProduct(client, companyId, {
    name: 'Dyed shop apron',
    sku: `${tag}-DYED`,
    kind: 'finished',
    listPrice: 88,
    costPrice: 40,
    purchasable: false,
  }, added)
  const dyedBom = await ensureBom(client, companyId, dyed.id, {
    notes: 'Dye a shop apron, then hem it.',
    lines: [{ productId: apronId, quantity: 1, lossPercent: 0 }],
    operations: [
      { sequence: 1, name: 'Dye', workstationId: dye.id, hours: 1.2, lossPercent: 0 },
      { sequence: 2, name: 'Hem', workstationId: hem.id, hours: 0.4, lossPercent: 0 },
    ],
  }, added, 'Dyed shop apron bill')

  const queue = await ensureOrder(client, {
    companyId,
    name: `MO-QUEUE-${companyId}`,
    state: 'confirmed',
    purpose: 'stock',
    productId: apronId,
    bomId: apronBomId,
    quantity: 4,
    quantityDone: 0,
    transferred: false,
    sourceWarehouseId: warehouseId,
    destWarehouseId: warehouseId,
    wipWarehouseId: null,
    scrapWarehouseId: null,
    createdById: adminId,
    line: { productId: apronId, quantity: 4, consumed: 0, lossPercent: 0 },
  }, added)
  await ensureDemoCard(client, {
    companyId,
    orderId: queue.id,
    name: `JC-QUEUE-${companyId}`,
    workstationId: benchId,
    operationName: 'Cut and hem',
    status: 'pending',
    plannedQty: 4,
    completedQty: 0,
    rejectedQty: 0,
  }, added)

  const running = await ensureOrder(client, {
    companyId,
    name: `MO-RUN-${companyId}`,
    state: 'progress',
    purpose: 'stock',
    productId: dyed.id,
    bomId: dyedBom.id,
    quantity: 4,
    quantityDone: 0,
    transferred: false,
    sourceWarehouseId: warehouseId,
    destWarehouseId: warehouseId,
    wipWarehouseId: null,
    scrapWarehouseId: null,
    createdById: adminId,
    line: { productId: apronId, quantity: 4, consumed: 0, lossPercent: 0 },
  }, added)
  const runningCard = await ensureDemoCard(client, {
    companyId,
    orderId: running.id,
    name: `JC-RUN-${companyId}`,
    workstationId: dye.id,
    operationName: 'Dye',
    status: 'running',
    plannedQty: 4,
    completedQty: 3,
    rejectedQty: 0,
    logs: [
      { operatorName: 'Mina Cole', minutes: 400, note: 'Morning dye lot.' },
      { operatorName: 'Wen Li', minutes: 0, note: null, startedAt: new Date(Date.now() - 25 * 60 * 1000) },
    ],
  }, added)
  await client.jobTimeLog.updateMany({
    where: { jobCardId: runningCard.id, operatorName: 'Wen Li', endedAt: null },
    data: { startedAt: new Date(Date.now() - 25 * 60 * 1000), minutes: 0 },
  })

  const held = await ensureOrder(client, {
    companyId,
    name: `MO-HOLD-${companyId}`,
    state: 'stopped',
    purpose: 'stock',
    productId: dyed.id,
    bomId: dyedBom.id,
    quantity: 5,
    quantityDone: 0,
    transferred: false,
    sourceWarehouseId: warehouseId,
    destWarehouseId: warehouseId,
    wipWarehouseId: null,
    scrapWarehouseId: null,
    createdById: adminId,
    line: { productId: apronId, quantity: 5, consumed: 0, lossPercent: 0 },
  }, added)
  await ensureDemoCard(client, {
    companyId,
    orderId: held.id,
    name: `JC-HOLD-${companyId}`,
    workstationId: hem.id,
    operationName: 'Hem',
    status: 'paused',
    plannedQty: 5,
    completedQty: 4,
    rejectedQty: 1,
    logs: [{ operatorName: 'He Gong', minutes: 300, note: 'Paused for a needle change.', startedAt: new Date(Date.now() - 6 * 60 * 60 * 1000), endedAt: new Date(Date.now() - 60 * 60 * 1000) }],
  }, added)

  const finished = await ensureOrder(client, {
    companyId,
    name: `MO-FIN-${companyId}`,
    state: 'stopped',
    purpose: 'stock',
    productId: apronId,
    bomId: apronBomId,
    quantity: 4,
    quantityDone: 0,
    transferred: false,
    sourceWarehouseId: warehouseId,
    destWarehouseId: warehouseId,
    wipWarehouseId: null,
    scrapWarehouseId: null,
    createdById: adminId,
    line: { productId: apronId, quantity: 4, consumed: 0, lossPercent: 0 },
  }, added)
  await ensureDemoCard(client, {
    companyId,
    orderId: finished.id,
    name: `JC-FIN-${companyId}`,
    workstationId: benchId,
    operationName: 'Cut and hem',
    status: 'done',
    plannedQty: 4,
    completedQty: 4,
    rejectedQty: 0,
    logs: [{ operatorName: 'August', minutes: 360, note: 'Four aprons off the bench.', startedAt: new Date(Date.now() - 8 * 60 * 60 * 1000), endedAt: new Date(Date.now() - 2 * 60 * 60 * 1000) }],
  }, added)
}

async function ensureDemoCard(
  client: PrismaClient,
  input: {
    companyId: number
    orderId: number
    name: string
    workstationId: number
    operationName: string
    status: string
    plannedQty: number
    completedQty: number
    rejectedQty: number
    logs?: Array<{ operatorName: string; minutes: number; note: string | null; startedAt?: Date; endedAt?: Date }>
  },
  added: string[],
) {
  const existing = await client.jobCard.findFirst({ where: { companyId: input.companyId, name: input.name } })
  if (existing) return existing
  added.push(input.name)
  return client.jobCard.create({
    data: {
      companyId: input.companyId,
      orderId: input.orderId,
      name: input.name,
      sequence: 1,
      operationName: input.operationName,
      workstationId: input.workstationId,
      plannedQty: input.plannedQty,
      completedQty: input.completedQty,
      rejectedQty: input.rejectedQty,
      status: input.status,
      logs: {
        create: (input.logs ?? []).map((log) => ({
          operatorName: log.operatorName,
          minutes: log.minutes,
          note: log.note,
          startedAt: log.startedAt,
          endedAt: log.endedAt,
        })),
      },
    },
  })
}

async function ensurePlan(client: PrismaClient, companyId: number, apronId: number, apronBomId: number, clothId: number, added: string[]) {
  const name = `PLAN-FLOOR-${companyId}`
  const existing = await client.productionPlan.findFirst({ where: { companyId, name }, include: { lines: true } })
  if (existing && existing.lines.length > 0) return
  if (!existing) {
    added.push(name)
    await client.productionPlan.create({
      data: {
        companyId,
        name,
        state: 'draft',
        lines: {
          create: [
            { productId: apronId, demandQty: 6, onHand: 0, toMake: 6, toBuy: 0, bomId: apronBomId },
            { productId: clothId, demandQty: 8, onHand: 40, toMake: 0, toBuy: 0, bomId: null },
          ],
        },
      },
    })
    return
  }
  added.push(`${name} lines`)
  await client.productionPlanLine.createMany({
    data: [
      { planId: existing.id, productId: apronId, demandQty: 6, onHand: 0, toMake: 6, toBuy: 0, bomId: apronBomId },
      { planId: existing.id, productId: clothId, demandQty: 8, onHand: 40, toMake: 0, toBuy: 0, bomId: null },
    ],
  })
}
