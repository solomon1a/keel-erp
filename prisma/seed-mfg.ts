import type { PrismaClient } from '@prisma/client'

/**
 * Jiangbei master-schedule rows: forecasts, a draft plan, downtime, and unbuild drafts.
 * Nothing here posts a journal or consumes a document sequence.
 */
export async function seedMfgPlanning(client: PrismaClient) {
  const company = await client.company.findFirst({ where: { name: 'Jiangbei Goods Co.' }, select: { id: true } })
  if (!company) return
  const companyId = company.id
  const seeded = await client.demandForecast.findFirst({ where: { companyId, name: 'FC-JB-01' }, select: { id: true } })
  if (seeded) return

  const [fg, fg2, component, apron, packing, stitch] = await Promise.all([
    client.product.findFirst({ where: { companyId, sku: 'VOL-FG-01' } }),
    client.product.findFirst({ where: { companyId, sku: 'VOL-FG-02' } }),
    client.product.findFirst({ where: { companyId, sku: 'VOL-CP-01' } }),
    client.product.findFirst({ where: { companyId, name: 'Shop apron' } }),
    client.workstation.findFirst({ where: { companyId, name: 'Packing table' } }),
    client.workstation.findFirst({ where: { companyId, name: 'Stitch line' } }),
  ])
  if (!fg || !fg2 || !component || !apron || !packing || !stitch) {
    throw new Error('Jiangbei planning seed is missing a product or work center.')
  }
  const [fgBom, fg2Bom, apronBom] = await Promise.all([
    client.billOfMaterials.findFirst({ where: { companyId, productId: fg.id, active: true }, orderBy: { version: 'desc' } }),
    client.billOfMaterials.findFirst({ where: { companyId, productId: fg2.id, active: true }, orderBy: { version: 'desc' } }),
    client.billOfMaterials.findFirst({ where: { companyId, productId: apron.id, active: true }, orderBy: { version: 'desc' } }),
  ])

  async function onHand(productId: number) {
    const rows = await client.stockQuant.findMany({
      where: { productId, location: { companyId, type: 'internal' } },
      select: { quantity: true },
    })
    return Math.round(rows.reduce((sum, row) => sum + row.quantity, 0) * 1000) / 1000
  }

  const now = new Date()
  const period = (offset: number) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1))
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
  }
  const fgHave = await onHand(fg.id)
  const fg2Have = await onHand(fg2.id)
  const clothHave = await onHand(component.id)
  const apronHave = await onHand(apron.id)
  const fgDemand = Math.round((fgHave + 36) * 1000) / 1000
  const fg2Demand = Math.round((fg2Have + 24) * 1000) / 1000
  const clothDemand = Math.round((clothHave + 40) * 1000) / 1000

  await client.product.update({ where: { id: fg.id }, data: { leadDays: 5 } })
  await client.product.update({ where: { id: fg2.id }, data: { leadDays: 5 } })
  await client.product.update({ where: { id: component.id }, data: { leadDays: 12 } })
  await client.product.update({ where: { id: apron.id }, data: { leadDays: 4 } })

  await client.demandForecast.createMany({
    data: [
      { companyId, name: 'FC-JB-01', productId: fg.id, period: period(1), quantity: fgDemand, note: 'Next month, thirty-six above the shelf.' },
      { companyId, name: 'FC-JB-02', productId: fg2.id, period: period(1), quantity: fg2Demand, note: 'The second finished good, same month.' },
      { companyId, name: 'FC-JB-03', productId: fg.id, period: period(2), quantity: 30, note: 'A smaller repeat the month after.' },
      { companyId, name: 'FC-JB-04', productId: component.id, period: period(1), quantity: clothDemand, note: 'Cloth to buy ahead of the make plan.' },
    ],
  })

  const planName = `PLAN-MPS-${companyId}`
  const plan = await client.productionPlan.findFirst({ where: { companyId, name: planName }, select: { id: true } })
  if (!plan) {
    await client.productionPlan.create({
      data: {
        companyId,
        name: planName,
        state: 'draft',
        lines: {
          create: [
            { productId: fg.id, demandQty: fgDemand, onHand: fgHave, toMake: 36, toBuy: 0, bomId: fgBom?.id ?? null, source: 'forecast', leadDays: 5 },
            { productId: fg2.id, demandQty: fg2Demand, onHand: fg2Have, toMake: 24, toBuy: 0, bomId: fg2Bom?.id ?? null, source: 'forecast', leadDays: 5 },
            { productId: component.id, demandQty: clothDemand, onHand: clothHave, toMake: 0, toBuy: 40, bomId: null, source: 'forecast', leadDays: 12 },
            { productId: apron.id, demandQty: apronHave + 8, onHand: apronHave, toMake: 8, toBuy: 0, bomId: apronBom?.id ?? null, source: 'order', leadDays: 4 },
          ],
        },
      },
    })
  }

  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), Math.min(now.getUTCDate(), 28)))
  await client.downtimeEntry.createMany({
    data: [
      { companyId, name: 'DT-JB-01', workstationId: packing.id, date: day, minutes: 45, reason: 'Needle jam on the packing table', state: 'confirmed' },
      { companyId, name: 'DT-JB-02', workstationId: stitch.id, date: day, minutes: 30, reason: 'Thread changeover on the stitch line', state: 'confirmed' },
      { companyId, name: 'DT-JB-03', workstationId: packing.id, date: day, minutes: 15, reason: 'Waiting on labels', state: 'draft' },
    ],
  })

  await client.unbuildOrder.createMany({
    data: [
      { companyId, name: 'UBV-01', productId: fg.id, bomId: fgBom?.id ?? null, quantity: 1, state: 'draft', note: 'One returned piece still on the shelf. Not posted.' },
      { companyId, name: 'UBV-02', productId: apron.id, bomId: apronBom?.id ?? null, quantity: 1, state: 'draft', note: 'Sample apron to take apart. Not posted.' },
    ],
  })
}
