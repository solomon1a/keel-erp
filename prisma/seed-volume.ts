import type { Prisma, PrismaClient } from '@prisma/client'
import { ensureAssetCategory } from '../server/services/assets.ts'
import { ensureAccounts } from '../server/services/journals.ts'
import { ensurePayrollAccounts } from '../server/services/payroll.ts'
import { transactionOptions } from '../server/db.ts'
import { roundMoney } from '../src/domain/money.ts'
import {
  jiangbeiHelpdeskBoard,
  volumeBankLines,
  volumeCustomers,
  volumeDate,
  volumeDepartments,
  volumeDeskOrders,
  volumeDraftLeaves,
  volumeEmployees,
  volumeInvoices,
  volumeJournals,
  volumeLeads,
  volumeManufacturing,
  volumeMarker,
  volumePayroll,
  volumeProducts,
  volumeProjects,
  volumePurchases,
  volumeQuotations,
  volumeRfqs,
  volumeShopOrders,
  volumeTicketBreached,
  volumeTickets,
  volumeVendors,
  type VolumeProduct,
} from './volume-plan.ts'

const openMo = new Set(['confirmed', 'progress', 'done', 'stopped'])

function pad(value: number, width: number) {
  return String(value).padStart(width, '0')
}

async function chunks<T>(rows: T[], write: (part: T[]) => Promise<unknown>) {
  for (let index = 0; index < rows.length; index += 150) {
    await write(rows.slice(index, index + 150))
  }
}

function money(quantity: number, price: number) {
  const untaxed = roundMoney(quantity * price)
  const tax = roundMoney(untaxed * 0.13)
  return { untaxed, tax, total: roundMoney(untaxed + tax) }
}

async function parties(client: PrismaClient, companyId: number) {
  const rows = await client.contact.findMany({
    where: { companyId, email: { endsWith: '@volume.jiangbei.example' } },
    select: { id: true, email: true, isCustomer: true, isSupplier: true },
  })
  const customers = rows.filter((row) => row.isCustomer).sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))
  const vendors = rows.filter((row) => row.isSupplier).sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))
  return { customers, vendors }
}

async function products(client: PrismaClient, companyId: number) {
  const rows = await client.product.findMany({
    where: { companyId, sku: { startsWith: 'VOL-' } },
    select: { id: true, sku: true, name: true, listPrice: true, costPrice: true, type: true },
  })
  const bySku = new Map(rows.map((row) => [row.sku, row]))
  return { rows, bySku }
}

function sellable(rows: Array<{ id: number; sku: string; name: string; listPrice: number; costPrice: number; type: string }>) {
  return rows.filter((row) => row.sku.startsWith('VOL-FG-') || row.sku.startsWith('VOL-SV-')).sort((a, b) => a.sku.localeCompare(b.sku))
}

function buyable(rows: Array<{ id: number; sku: string; name: string; listPrice: number; costPrice: number; type: string }>) {
  return rows.filter((row) => row.sku.startsWith('VOL-RM-') || row.sku.startsWith('VOL-CP-') || row.sku.startsWith('VOL-CN-')).sort((a, b) => a.sku.localeCompare(b.sku))
}

export async function seedVolume(client: PrismaClient) {
  const admin = await client.user.findUnique({
    where: { email: 'maya@northline.example' },
    select: { id: true, companyId: true },
  })
  if (!admin) return
  const companyId = admin.companyId
  const userId = admin.id
  if (await client.campaign.findFirst({ where: { companyId, name: volumeMarker }, select: { id: true } })) return
  const now = new Date()
  await seedCatalog(client, companyId, userId)
  await seedCrm(client, companyId, userId, now)
  await seedSales(client, companyId, userId, now)
  await seedPurchasing(client, companyId, userId, now)
  await seedStock(client, companyId, userId, now)
  await seedMaking(client, companyId, userId, now)
  await seedPeople(client, companyId, now)
  await seedAccounting(client, companyId, now)
  await seedPayroll(client, companyId)
  await seedProjects(client, companyId, now)
  await seedTickets(client, companyId, userId, now)
  await seedPos(client, companyId, userId, now)
  await seedSite(client, companyId, now)
  if (jiangbeiHelpdeskBoard.tickets < 50) throw new Error('Volume helpdesk board is short.')
}

async function seedCatalog(client: PrismaClient, companyId: number, userId: number) {
  if (await client.product.findFirst({ where: { companyId, sku: 'VOL-FG-01' }, select: { id: true } })) return
  const warehouse = await client.warehouse.findFirst({ where: { companyId, code: 'SH' }, select: { id: true } })
  const main = await client.stockLocation.findFirst({ where: { companyId, name: 'Main stock', type: 'internal' }, select: { id: true } })
  if (!warehouse || !main) throw new Error('Jiangbei stock is not ready for the volume seed.')
  await client.$transaction(async (tx) => {
    await tx.productCategory.createMany({
      data: ['Cloth', 'Paper', 'Home', 'Service', 'Packaging'].map((name) => ({ companyId, name })),
      skipDuplicates: true,
    })
    await tx.customerGroup.createMany({
      data: ['Wholesale', 'Export', 'Studio', 'Retail'].map((name) => ({ companyId, name })),
      skipDuplicates: true,
    })
    const categories = await tx.productCategory.findMany({ where: { companyId }, select: { id: true, name: true } })
    const groups = await tx.customerGroup.findMany({ where: { companyId }, select: { id: true, name: true } })
    const categoryId = new Map(categories.map((row) => [row.name, row.id]))
    const groupNames = ['Wholesale', 'Export', 'Studio', 'Retail'] as const
    const groupId = new Map(groups.map((row) => [row.name, row.id]))
    await tx.contact.createMany({
      data: volumeCustomers.map((row, index) => ({
        companyId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        isCompany: true,
        isCustomer: true,
        street: row.street,
        city: row.city,
        postalCode: row.postal,
        notes: `Tags: ${row.tags}`,
        customerGroupId: groupId.get(groupNames[index % groupNames.length]!) ?? null,
        createdById: userId,
      })),
    })
    const createdCustomers = await tx.contact.findMany({
      where: { companyId, email: { in: volumeCustomers.map((row) => row.email) } },
      select: { id: true, email: true },
    })
    const customerByEmail = new Map(createdCustomers.map((row) => [row.email, row.id]))
    await tx.contact.createMany({
      data: volumeCustomers.slice(0, 24).map((row) => ({
        companyId,
        name: row.person,
        email: row.email.replace('customer', 'person'),
        phone: row.phone,
        isCompany: false,
        parentId: customerByEmail.get(row.email) ?? null,
        city: row.city,
        street: row.street,
        notes: `Buyer at ${row.name}`,
        createdById: userId,
      })),
    })
    await tx.contact.createMany({
      data: volumeVendors.map((row) => ({
        companyId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        isCompany: true,
        isSupplier: true,
        street: row.street,
        city: row.city,
        postalCode: row.postal,
        notes: `Tags: ${row.tags}`,
        createdById: userId,
      })),
    })
    await tx.product.createMany({
      data: volumeProducts.map((row) => ({
        companyId,
        name: row.name,
        sku: row.sku,
        type: row.type,
        kind: row.kind,
        listPrice: row.list,
        costPrice: row.cost,
        purchasable: row.purchasable,
        websitePublished: row.published,
        categoryId: categoryId.get(row.category) ?? null,
        description: `${row.category} · ${row.name}`,
      })),
    })
    const stored = await tx.product.findMany({
      where: { companyId, sku: { in: volumeProducts.map((row) => row.sku) } },
      select: { id: true, sku: true },
    })
    const productId = new Map(stored.map((row) => [row.sku, row.id]))
    const suzhou = await tx.warehouse.create({
      data: { companyId, name: 'Suzhou Warehouse', code: 'SZU', isDefault: false },
    })
    await tx.stockLocation.create({
      data: { companyId, warehouseId: suzhou.id, name: 'Suzhou stock', type: 'internal', isDefault: true },
    })
    await tx.stockLocation.create({
      data: { companyId, name: 'Quarantine cage', type: 'quarantine' },
    })
    const rules = volumeProducts.filter((row) => row.type === 'product').map((row) => ({
      companyId,
      productId: productId.get(row.sku) ?? 0,
      warehouseId: warehouse.id,
      minQty: row.main < 5 ? 8 : 12,
      maxQty: 48,
    })).filter((row) => row.productId > 0)
    await chunks(rules, (part) => tx.reorderRule.createMany({ data: part }))
    await tx.workstation.createMany({
      data: [
        { companyId, name: 'Packing table', hourRate: 48, capacityHours: 8, efficiency: 100 },
        { companyId, name: 'Stitch line', hourRate: 36, capacityHours: 8, efficiency: 100 },
      ],
    })
    const stations = await tx.workstation.findMany({
      where: { companyId, name: { in: ['Packing table', 'Stitch line'] } },
      select: { id: true, name: true },
    })
    const stationId = new Map(stations.map((row) => [row.name, row.id]))
    const packing = stationId.get('Packing table')
    const stitch = stationId.get('Stitch line')
    if (!packing || !stitch) throw new Error('Volume workstations were not created.')
    const finished = volumeProducts.filter((row) => row.sku.startsWith('VOL-FG-')).slice(0, 12)
    for (const row of finished) {
      const id = productId.get(row.sku)
      const component = productId.get(`VOL-CP-${pad((Number(row.sku.slice(-2)) % 15) + 1, 2)}`)
      const raw = productId.get(`VOL-RM-${pad((Number(row.sku.slice(-2)) % 30) + 1, 2)}`)
      if (!id || !component || !raw) throw new Error(`Volume recipe for ${row.sku} is incomplete.`)
      await tx.billOfMaterials.create({
        data: {
          companyId,
          productId: id,
          yieldQty: 1,
          active: true,
          notes: `Recipe for ${row.name}`,
          lines: {
            create: [
              { productId: component, quantity: 1 },
              { productId: raw, quantity: 2 },
            ],
          },
          operations: {
            create: [
              { sequence: 1, name: 'Stitch', workstationId: stitch, hours: 0.4 },
              { sequence: 2, name: 'Pack', workstationId: packing, hours: 0.2 },
            ],
          },
        },
      })
    }
  }, transactionOptions)
}

async function seedCrm(client: PrismaClient, companyId: number, userId: number, now: Date) {
  if (await client.lead.findFirst({ where: { companyId, name: volumeLeads[0]?.name ?? '' }, select: { id: true } })) return
  await client.$transaction(async (tx) => {
    const reason = await tx.lostReason.create({ data: { companyId, name: 'Capacity' } })
    await tx.crmTag.createMany({
      data: ['Export', 'Repeat', 'Studio', 'Phone'].map((name) => ({ companyId, name })),
      skipDuplicates: true,
    })
    const tags = await tx.crmTag.findMany({ where: { companyId, name: { in: ['Export', 'Repeat', 'Studio', 'Phone'] } }, select: { id: true, name: true } })
    const tagIds = tags.map((row) => row.id)
    await tx.lead.createMany({
      data: volumeLeads.map((row) => ({
        companyId,
        name: row.name,
        contactName: row.contactName,
        email: row.email,
        phone: '+86 21 5500 8800',
        expectedRevenue: row.expected,
        stage: row.stage,
        source: row.source,
        lostReasonId: row.stage === 'lost' ? reason.id : null,
        userId: null,
        createdAt: volumeDate(row.monthsAgo, 4, now),
      })),
    })
    const leads = await tx.lead.findMany({
      where: { companyId, name: { startsWith: 'VOL-L-' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    await chunks(leads.map((row, index) => ({
      leadId: row.id,
      tagId: tagIds[index % tagIds.length] ?? tagIds[0] ?? 0,
    })).filter((row) => row.tagId > 0), (part) => tx.leadTag.createMany({ data: part }))
    const activities = leads.slice(0, 100).map((row, index) => {
      const overdue = index % 3 === 0
      return {
        leadId: row.id,
        kind: (['call', 'meeting', 'todo'] as const)[index % 3]!,
        summary: overdue ? `Chase ${row.name}` : `Prepare ${row.name}`,
        dueOn: new Date(now.getTime() + (overdue ? -4 : 8) * 86_400_000),
        done: !overdue && index % 2 === 0,
        assigneeId: index % 2 === 0 ? userId : null,
      }
    })
    await chunks(activities, (part) => tx.activity.createMany({ data: part }))
  }, transactionOptions)
}

async function seedSales(client: PrismaClient, companyId: number, userId: number, now: Date) {
  if (await client.salesOrder.findFirst({ where: { companyId, name: 'SOV0001' }, select: { id: true } })) return
  const { customers } = await parties(client, companyId)
  const catalog = await products(client, companyId)
  const goods = sellable(catalog.rows)
  const warehouse = await client.warehouse.findFirst({ where: { companyId, code: 'SH' }, select: { id: true } })
  if (customers.length < 60 || goods.length < 40 || !warehouse) throw new Error('Volume sales is missing customers or goods.')
  const orders = [...volumeDeskOrders, ...volumeShopOrders]
  await client.$transaction(async (tx) => {
    await tx.salesOrder.createMany({
      data: orders.map((row, index) => {
        const product = goods[index % goods.length]!
        const price = money(row.qty, product.listPrice)
        return {
          companyId,
          name: row.name,
          state: row.state,
          customerId: customers[index % customers.length]!.id,
          warehouseId: warehouse.id,
          dateOrder: volumeDate(row.monthsAgo, 8 + (index % 10), now),
          amountUntaxed: price.untaxed,
          amountTax: price.tax,
          amountTotal: price.total,
          origin: row.origin,
          createdById: userId,
        }
      }),
    })
    const stored = await tx.salesOrder.findMany({
      where: { companyId, name: { startsWith: 'SOV' } },
      select: { id: true, name: true },
    })
    const orderId = new Map(stored.map((row) => [row.name, row.id]))
    await chunks(orders.map((row, index) => {
      const product = goods[index % goods.length]!
      const price = money(row.qty, product.listPrice)
      return {
        orderId: orderId.get(row.name) ?? 0,
        productId: product.id,
        description: product.name,
        quantity: row.qty,
        unitPrice: product.listPrice,
        discount: 0,
        subtotal: price.untaxed,
        taxAmount: price.tax,
        qtyDelivered: row.state === 'done' ? row.qty : 0,
      }
    }).filter((row) => row.orderId > 0), (part) => tx.salesOrderLine.createMany({ data: part }))
    await tx.quotation.createMany({
      data: volumeQuotations.map((row, index) => ({
        companyId,
        name: row.name,
        customerId: customers[index % customers.length]!.id,
        state: row.state,
        createdAt: volumeDate(row.monthsAgo, 3, now),
      })),
    })
    const quotes = await tx.quotation.findMany({
      where: { companyId, name: { startsWith: 'QTV' } },
      select: { id: true, name: true },
    })
    const quoteId = new Map(quotes.map((row) => [row.name, row.id]))
    await chunks(volumeQuotations.map((row, index) => {
      const product = goods[index % goods.length]!
      return {
        quotationId: quoteId.get(row.name) ?? 0,
        productId: product.id,
        description: product.name,
        quantity: row.qty,
        unitPrice: product.listPrice,
        discount: 0,
      }
    }).filter((row) => row.quotationId > 0), (part) => tx.quotationLine.createMany({ data: part }))
    const doneLines = await tx.salesOrderLine.findMany({
      where: { order: { companyId, name: { startsWith: 'SOV' }, state: 'done' } },
      select: { id: true, orderId: true, productId: true, quantity: true, order: { select: { name: true, dateOrder: true } } },
    })
    const noteByOrder = new Map<number, { name: string; date: Date }>()
    for (const line of doneLines) {
      if (!noteByOrder.has(line.orderId)) noteByOrder.set(line.orderId, { name: `DLV-${line.order.name}`, date: line.order.dateOrder })
    }
    await tx.deliveryNote.createMany({
      data: [...noteByOrder.entries()].map(([orderId, note]) => ({
        companyId,
        name: note.name,
        salesOrderId: orderId,
        state: 'done',
        date: note.date,
      })),
    })
    const notes = await tx.deliveryNote.findMany({
      where: { companyId, name: { startsWith: 'DLV-SOV' } },
      select: { id: true, salesOrderId: true },
    })
    const noteId = new Map(notes.map((row) => [row.salesOrderId, row.id]))
    await chunks(doneLines.map((line) => ({
      noteId: noteId.get(line.orderId) ?? 0,
      salesOrderLineId: line.id,
      productId: line.productId,
      quantity: line.quantity,
    })).filter((row) => row.noteId > 0), (part) => tx.deliveryNoteLine.createMany({ data: part }))
  }, transactionOptions)
}

async function seedPurchasing(client: PrismaClient, companyId: number, userId: number, now: Date) {
  if (await client.purchaseOrder.findFirst({ where: { companyId, name: 'POV0001' }, select: { id: true } })) return
  const { vendors } = await parties(client, companyId)
  const catalog = await products(client, companyId)
  const goods = buyable(catalog.rows)
  const warehouse = await client.warehouse.findFirst({ where: { companyId, code: 'SH' }, select: { id: true } })
  if (vendors.length < 25 || goods.length < 20 || !warehouse) throw new Error('Volume purchasing is missing vendors or materials.')
  await client.$transaction(async (tx) => {
    await tx.purchaseOrder.createMany({
      data: volumePurchases.map((row, index) => {
        const product = goods[index % goods.length]!
        const price = money(row.qty, product.costPrice || product.listPrice)
        return {
          companyId,
          name: row.name,
          state: row.state,
          vendorId: vendors[index % vendors.length]!.id,
          warehouseId: warehouse.id,
          dateOrder: volumeDate(row.monthsAgo, 6, now),
          amountUntaxed: price.untaxed,
          amountTax: price.tax,
          amountTotal: price.total,
          createdById: userId,
        }
      }),
    })
    const stored = await tx.purchaseOrder.findMany({
      where: { companyId, name: { startsWith: 'POV' } },
      select: { id: true, name: true, state: true },
    })
    const orderId = new Map(stored.map((row) => [row.name, row.id]))
    await chunks(volumePurchases.map((row, index) => {
      const product = goods[index % goods.length]!
      const cost = product.costPrice || product.listPrice
      const price = money(row.qty, cost)
      return {
        orderId: orderId.get(row.name) ?? 0,
        productId: product.id,
        description: product.name,
        quantity: row.qty,
        unitCost: cost,
        subtotal: price.untaxed,
        taxAmount: price.tax,
        qtyReceived: row.state === 'done' ? row.qty : 0,
      }
    }).filter((row) => row.orderId > 0), (part) => tx.purchaseOrderLine.createMany({ data: part }))
    const doneLines = await tx.purchaseOrderLine.findMany({
      where: { order: { companyId, name: { startsWith: 'POV' }, state: 'done' } },
      select: { id: true, orderId: true, productId: true, quantity: true, unitCost: true, order: { select: { name: true, dateOrder: true } } },
    })
    const receiptByOrder = new Map<number, { name: string; date: Date }>()
    for (const line of doneLines) {
      if (!receiptByOrder.has(line.orderId)) receiptByOrder.set(line.orderId, { name: `RCP-${line.order.name}`, date: line.order.dateOrder })
    }
    await tx.purchaseReceipt.createMany({
      data: [...receiptByOrder.entries()].map(([orderId, note]) => ({
        companyId,
        name: note.name,
        purchaseOrderId: orderId,
        state: 'done',
        date: note.date,
      })),
    })
    const receipts = await tx.purchaseReceipt.findMany({
      where: { companyId, name: { startsWith: 'RCP-POV' } },
      select: { id: true, purchaseOrderId: true },
    })
    const receiptId = new Map(receipts.map((row) => [row.purchaseOrderId, row.id]))
    await chunks(doneLines.map((line) => ({
      receiptId: receiptId.get(line.orderId) ?? 0,
      purchaseOrderLineId: line.id,
      productId: line.productId,
      quantity: line.quantity,
      unitCost: line.unitCost,
    })).filter((row) => row.receiptId > 0), (part) => tx.purchaseReceiptLine.createMany({ data: part }))
    await tx.supplierQuotation.createMany({
      data: volumeRfqs.map((row, index) => ({
        companyId,
        name: row.name,
        vendorId: vendors[index % vendors.length]!.id,
        purchaseOrderId: orderId.get(volumePurchases[index]?.name ?? '') ?? null,
        state: row.state,
        createdAt: volumeDate(row.monthsAgo, 2, now),
      })),
    })
    const quotes = await tx.supplierQuotation.findMany({
      where: { companyId, name: { startsWith: 'RFQV' } },
      select: { id: true, name: true },
    })
    const quoteId = new Map(quotes.map((row) => [row.name, row.id]))
    await chunks(volumeRfqs.map((row, index) => {
      const product = goods[index % goods.length]!
      return {
        quoteId: quoteId.get(row.name) ?? 0,
        productId: product.id,
        quantity: row.qty,
        unitCost: product.costPrice || product.listPrice,
      }
    }).filter((row) => row.quoteId > 0), (part) => tx.supplierQuotationLine.createMany({ data: part }))
  }, transactionOptions)
}

async function seedStock(client: PrismaClient, companyId: number, userId: number, now: Date) {
  if (await client.stockTransfer.findFirst({ where: { companyId, name: 'STV-01' }, select: { id: true } })) return
  const catalog = await products(client, companyId)
  const main = await client.stockLocation.findFirstOrThrow({ where: { companyId, name: 'Main stock', type: 'internal' } })
  const suzhou = await client.stockLocation.findFirstOrThrow({ where: { companyId, name: 'Suzhou stock', type: 'internal' } })
  const supplier = await client.stockLocation.findFirstOrThrow({ where: { companyId, type: 'supplier' } })
  const adjustment = await client.stockLocation.findFirstOrThrow({ where: { companyId, type: 'inventory' } })
  const quarantine = await client.stockLocation.findFirstOrThrow({ where: { companyId, name: 'Quarantine cage' } })
  const plan = new Map(volumeProducts.map((row) => [row.sku, row]))
  const stocked = catalog.rows.filter((row) => {
    const spec = plan.get(row.sku)
    return spec && spec.type === 'product' && spec.main + spec.suzhou + spec.scrap > 0
  })
  await client.$transaction(async (tx) => {
    const quants: Prisma.StockQuantCreateManyInput[] = []
    const moves: Prisma.StockMoveCreateManyInput[] = []
    const ledgers: Prisma.StockLedgerCreateManyInput[] = []
    const suzhouLines: Array<{ productId: number; quantity: number }> = []
    for (const row of stocked) {
      const spec = plan.get(row.sku) as VolumeProduct
      const onHand = spec.main + spec.suzhou + spec.scrap
      quants.push({ productId: row.id, locationId: main.id, quantity: spec.main })
      if (spec.suzhou > 0) {
        quants.push({ productId: row.id, locationId: suzhou.id, quantity: spec.suzhou })
        suzhouLines.push({ productId: row.id, quantity: spec.suzhou })
      }
      if (spec.scrap > 0) quants.push({ productId: row.id, locationId: quarantine.id, quantity: spec.scrap })
      const inbound = onHand
      moves.push({
        productId: row.id,
        locationFromId: supplier.id,
        locationToId: main.id,
        quantity: inbound,
        state: 'done',
        reference: `VOL-IN-${row.sku}`,
        date: volumeDate(11, 2, now),
      })
      if (spec.suzhou > 0) {
        moves.push({
          productId: row.id,
          locationFromId: main.id,
          locationToId: suzhou.id,
          quantity: spec.suzhou,
          state: 'done',
          reference: `STV-${row.sku}`,
          date: volumeDate(6, 10, now),
        })
      }
      if (spec.scrap > 0) {
        moves.push({
          productId: row.id,
          locationFromId: main.id,
          locationToId: quarantine.id,
          quantity: spec.scrap,
          state: 'done',
          reference: `SCRAP-${row.sku}`,
          date: volumeDate(2, 15, now),
        })
      }
      ledgers.push({
        companyId,
        productId: row.id,
        qtyIn: onHand,
        qtyOut: 0,
        value: roundMoney(onHand * row.costPrice),
        balanceQty: onHand,
        balanceValue: roundMoney(onHand * row.costPrice),
      })
    }
    const adjusted = stocked.slice(0, 8)
    for (const row of adjusted) {
      moves.push(
        {
          productId: row.id,
          locationFromId: adjustment.id,
          locationToId: main.id,
          quantity: 4,
          state: 'done',
          reference: `ADJ-V-${row.sku}-IN`,
          date: volumeDate(3, 7, now),
        },
        {
          productId: row.id,
          locationFromId: main.id,
          locationToId: adjustment.id,
          quantity: 4,
          state: 'done',
          reference: `ADJ-V-${row.sku}-OUT`,
          date: volumeDate(3, 7, now),
        },
      )
    }
    await chunks(quants, (part) => tx.stockQuant.createMany({ data: part }))
    await chunks(moves, (part) => tx.stockMove.createMany({ data: part }))
    await chunks(ledgers, (part) => tx.stockLedger.createMany({ data: part }))
    const groups = [0, 1, 2, 3, 4, 5].map((index) => suzhouLines.filter((_, line) => line % 6 === index)).filter((group) => group.length > 0)
    await tx.stockTransfer.createMany({
      data: groups.map((_, index) => ({
        companyId,
        name: `STV-${pad(index + 1, 2)}`,
        state: 'done',
        locationFromId: main.id,
        locationToId: suzhou.id,
        createdById: userId,
      })),
    })
    const transfers = await tx.stockTransfer.findMany({
      where: { companyId, name: { startsWith: 'STV-' } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })
    const lines = groups.flatMap((group, index) => group.map((line) => ({
      transferId: transfers[index]?.id ?? 0,
      productId: line.productId,
      quantity: line.quantity,
    }))).filter((line) => line.transferId > 0)
    await chunks(lines, (part) => tx.stockTransferLine.createMany({ data: part }))
  }, transactionOptions)
}

function produced(state: (typeof volumeManufacturing)[number]['state'], qty: number) {
  switch (state) {
    case 'draft':
    case 'confirmed':
    case 'cancel':
      return 0
    case 'progress':
      return Math.max(1, Math.round(qty / 2))
    case 'done':
      return qty
    case 'stopped':
      return 1
    default: {
      const unexpected: never = state
      return unexpected
    }
  }
}

function cardStatus(state: (typeof volumeManufacturing)[number]['state'], sequence: number) {
  switch (state) {
    case 'draft':
    case 'cancel':
      return 'pending'
    case 'confirmed':
      return 'pending'
    case 'progress':
      return sequence === 1 ? 'running' : 'paused'
    case 'done':
      return 'done'
    case 'stopped':
      return 'open'
    default: {
      const unexpected: never = state
      return unexpected
    }
  }
}

async function seedMaking(client: PrismaClient, companyId: number, userId: number, now: Date) {
  if (await client.manufacturingOrder.findFirst({ where: { companyId, name: 'MOV-001' }, select: { id: true } })) return
  const catalog = await products(client, companyId)
  const finished = catalog.rows.filter((row) => row.sku.startsWith('VOL-FG-')).sort((a, b) => a.sku.localeCompare(b.sku)).slice(0, 12)
  const boms = await client.billOfMaterials.findMany({
    where: { companyId, productId: { in: finished.map((row) => row.id) }, active: true },
    select: { id: true, productId: true },
  })
  const bomByProduct = new Map(boms.map((row) => [row.productId, row.id]))
  const component = catalog.bySku.get('VOL-CP-01')
  const packing = await client.workstation.findFirst({ where: { companyId, name: 'Packing table' }, select: { id: true } })
  const stitch = await client.workstation.findFirst({ where: { companyId, name: 'Stitch line' }, select: { id: true } })
  const vendor = await client.contact.findFirst({ where: { companyId, email: volumeVendors[0]?.email ?? '' }, select: { id: true } })
  if (!component || !packing || !stitch || !vendor || finished.length < 12) throw new Error('Volume manufacturing is missing a recipe.')
  await client.$transaction(async (tx) => {
    await tx.manufacturingOrder.createMany({
      data: volumeManufacturing.map((row, index) => {
        const product = finished[index % finished.length]!
        return {
          companyId,
          name: row.name,
          state: row.state,
          productId: product.id,
          bomId: bomByProduct.get(product.id) ?? 0,
          quantity: row.qty,
          quantityDone: produced(row.state, row.qty),
          createdById: userId,
          createdAt: volumeDate(row.monthsAgo, 9, now),
        }
      }),
    })
    const orders = await tx.manufacturingOrder.findMany({
      where: { companyId, name: { startsWith: 'MOV-' } },
      select: { id: true, name: true, state: true, quantity: true, productId: true },
      orderBy: { name: 'asc' },
    })
    await chunks(orders.map((row) => ({
      orderId: row.id,
      productId: component.id,
      quantity: row.quantity * 2,
      consumed: row.state === 'done' ? row.quantity * 2 : 0,
    })), (part) => tx.manufacturingComponent.createMany({ data: part }))
    const cards = orders.filter((row) => openMo.has(row.state)).flatMap((row) => [1, 2].map((sequence) => {
      const spec = volumeManufacturing.find((item) => item.name === row.name)
      const state = spec?.state ?? 'draft'
      const made = produced(state, row.quantity)
      return {
        companyId,
        orderId: row.id,
        name: `${row.name}-${sequence}`,
        sequence,
        operationName: sequence === 1 ? 'Stitch' : 'Pack',
        workstationId: sequence === 1 ? stitch.id : packing.id,
        plannedQty: row.quantity,
        completedQty: state === 'done' ? row.quantity : made,
        rejectedQty: state === 'done' && sequence === 2 ? 1 : 0,
        status: cardStatus(state, sequence),
        orderName: row.name,
        state,
      }
    }))
    await chunks(cards.map(({ orderName: _orderName, state: _state, ...card }) => card), (part) => tx.jobCard.createMany({ data: part }))
    const storedCards = await tx.jobCard.findMany({
      where: { companyId, name: { startsWith: 'MOV-' } },
      select: { id: true, name: true, status: true },
    })
    const logs = storedCards.filter((card) => card.status !== 'pending').map((card, index) => {
      const started = volumeDate(index % 12, 10, now)
      const ended = new Date(started.getTime() + (40 + (index % 5) * 15) * 60_000)
      return {
        jobCardId: card.id,
        operatorName: volumeEmployees[index % volumeEmployees.length]!,
        minutes: 40 + (index % 5) * 15,
        note: card.status === 'done' ? 'Closed the card' : 'Logged the shift',
        startedAt: started,
        endedAt: ended,
      }
    })
    await chunks(logs, (part) => tx.jobTimeLog.createMany({ data: part }))
    const doneOrders = orders.filter((row) => row.state === 'done')
    await tx.wastageEntry.createMany({
      data: doneOrders.slice(0, 12).map((row, index) => ({
        companyId,
        orderId: row.id,
        productId: component.id,
        workstationId: index % 2 === 0 ? stitch.id : packing.id,
        operationName: index % 2 === 0 ? 'Stitch' : 'Pack',
        quantity: 1,
        reason: ['Short dye lot', 'Frayed selvedge', 'Oil mark'][index % 3]!,
        kind: (['process_loss', 'scrap', 'rejected'] as const)[index % 3]!,
        cost: 6 + index,
      })),
    })
    const point = await tx.qualityPoint.create({
      data: {
        companyId,
        name: 'Volume seam check',
        productId: finished[0]!.id,
        trigger: 'operation',
        operationName: 'Stitch',
        checkType: 'pass_fail',
      },
    })
    await tx.qualityCheck.createMany({
      data: orders.slice(0, 16).map((row, index) => ({
        companyId,
        pointId: point.id,
        productId: row.productId,
        trigger: 'operation',
        operationName: 'Stitch',
        status: index < 5 ? 'fail' : 'pass',
        quantity: 1,
        manufacturingOrderId: row.id,
        notes: index < 5 ? 'Seam wandered' : 'Seam holds',
      })),
    })
    const failed = await tx.qualityCheck.findMany({
      where: { companyId, pointId: point.id, status: 'fail' },
      select: { id: true, productId: true },
    })
    await tx.qualityAlert.createMany({
      data: failed.map((row, index) => ({
        companyId,
        checkId: row.id,
        productId: row.productId,
        status: index < 3 ? 'open' : 'resolved',
        action: index % 2 === 0 ? 'rework' : 'scrap',
        heldFrom: 'none',
        quantity: 1,
        value: 0,
        note: 'Held in the quarantine cage',
      })),
    })
    const bench = await tx.stockLocation.create({
      data: { companyId, name: 'Suzhou dye bench', type: 'subcontract', vendorId: vendor.id },
    })
    const subStates = ['draft', 'confirmed', 'progress', 'done', 'cancel', 'progress'] as const
    await tx.subcontractOrder.createMany({
      data: subStates.map((state, index) => ({
        companyId,
        name: `SCV-${pad(index + 1, 2)}`,
        vendorId: vendor.id,
        productId: finished[index]!.id,
        bomId: bomByProduct.get(finished[index]!.id) ?? 0,
        locationId: bench.id,
        quantity: 6,
        fee: 12,
        state,
        received: state === 'done' ? 6 : state === 'progress' ? 2 : 0,
      })),
    })
    const subs = await tx.subcontractOrder.findMany({
      where: { companyId, name: { startsWith: 'SCV-' } },
      select: { id: true },
    })
    await tx.subcontractComponent.createMany({
      data: subs.map((row) => ({
        orderId: row.id,
        productId: component.id,
        perUnit: 2,
        sent: 4,
        consumed: 2,
      })),
    })
  }, transactionOptions)
}

async function seedPeople(client: PrismaClient, companyId: number, now: Date) {
  if (await client.employee.findFirst({ where: { companyId, name: volumeEmployees[0] }, select: { id: true } })) return
  const titles = ['Dyer', 'Stitcher', 'Picker', 'Buyer', 'Bookkeeper', 'Pattern maker']
  await client.$transaction(async (tx) => {
    await tx.department.createMany({
      data: volumeDepartments.map((name) => ({ companyId, name })),
    })
    const departments = await tx.department.findMany({
      where: { companyId, name: { in: [...volumeDepartments] } },
      select: { id: true, name: true },
    })
    const departmentId = new Map(departments.map((row) => [row.name, row.id]))
    await tx.employee.createMany({
      data: volumeEmployees.map((name, index) => ({
        companyId,
        name,
        email: `staff${pad(index + 1, 2)}@volume.jiangbei.example`,
        phone: `+86 21 5600 ${pad(2000 + index, 4)}`,
        jobTitle: titles[index % titles.length]!,
        hourlyCost: 48,
        hourlyRate: 120,
        departmentId: departmentId.get(volumeDepartments[index % volumeDepartments.length]!) ?? null,
        active: true,
      })),
    })
    const people = await tx.employee.findMany({
      where: { companyId, email: { endsWith: '@volume.jiangbei.example' } },
      select: { id: true, name: true, email: true },
      orderBy: { email: 'asc' },
    })
    const attendance: Prisma.AttendanceCreateManyInput[] = []
    for (let ago = 1; ago <= 60; ago += 1) {
      const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ago))
      const weekday = day.getUTCDay()
      if (weekday === 0 || weekday === 6) continue
      people.forEach((person, index) => {
        const late = (ago + index) % 9 === 0
        const absent = (ago + index) % 23 === 0
        const status = absent ? 'absent' : late ? 'late' : 'present'
        attendance.push({
          employeeId: person.id,
          workDate: day,
          status,
          note: late ? 'Arrived after the line started' : '',
          checkIn: absent ? null : new Date(day.getTime() + (late ? 10 * 60 : 9 * 60) * 60_000),
          checkOut: absent ? null : new Date(day.getTime() + 18 * 60 * 60_000),
        })
      })
    }
    await chunks(attendance, (part) => tx.attendance.createMany({ data: part }))
    const annual = await tx.leaveType.findFirst({ where: { companyId, code: 'annual' }, select: { id: true } })
    const sick = await tx.leaveType.findFirst({ where: { companyId, code: 'sick' }, select: { id: true } })
    if (!annual || !sick) throw new Error('Leave types are missing.')
    const year = now.getUTCFullYear()
    await tx.leaveAllocation.createMany({
      data: people.flatMap((person) => [
        { companyId, employeeId: person.id, leaveTypeId: annual.id, year, days: 12 },
        { companyId, employeeId: person.id, leaveTypeId: sick.id, year, days: 8 },
      ]),
    })
    const leaves: Prisma.LeaveRequestCreateManyInput[] = []
    for (let index = 0; index < volumeDraftLeaves; index += 1) {
      const person = people[index]
      if (!person) continue
      leaves.push({
        employeeId: person.id,
        kind: 'annual',
        dateFrom: volumeDate(0, 12 + index, now),
        dateTo: volumeDate(0, 12 + index, now),
        state: 'draft',
        reason: 'Waiting on the line lead',
      })
    }
    people.slice(3, 8).forEach((person, index) => {
      leaves.push({
        employeeId: person.id,
        kind: index % 2 === 0 ? 'sick' : 'annual',
        dateFrom: volumeDate(1, 4 + index, now),
        dateTo: volumeDate(1, 4 + index, now),
        state: 'approved',
        reason: 'Approved last month',
      })
    })
    people.slice(8, 11).forEach((person, index) => {
      leaves.push({
        employeeId: person.id,
        kind: 'personal',
        dateFrom: volumeDate(2, 3 + index, now),
        dateTo: volumeDate(2, 3 + index, now),
        state: 'refused',
        reason: 'The dye lot could not wait',
      })
    })
    await tx.leaveRequest.createMany({ data: leaves })
  }, transactionOptions)
}

async function seedAccounting(client: PrismaClient, companyId: number, now: Date) {
  if (await client.invoice.findFirst({ where: { companyId, name: 'INV-V-01' }, select: { id: true } })) return
  const { customers, vendors } = await parties(client, companyId)
  const people = await client.employee.findMany({
    where: { companyId, email: { endsWith: '@volume.jiangbei.example' } },
    select: { id: true },
    orderBy: { email: 'asc' },
  })
  if (customers.length === 0 || vendors.length === 0 || people.length === 0) throw new Error('Volume books are missing partners.')
  await client.$transaction(async (tx) => {
    await ensurePayrollAccounts(tx, companyId)
    await ensureAccounts(tx, companyId, [['6608', 'Utilities', 'expense']])
    await ensureAssetCategory(tx, companyId)
    const accounts = await tx.account.findMany({ where: { companyId }, select: { id: true, code: true } })
    const accountId = new Map(accounts.map((row) => [row.code, row.id]))
    const journal = await tx.journal.findFirst({ where: { companyId, code: 'GEN' }, select: { id: true } })
    if (!journal) throw new Error('The general journal is missing.')
    const idFor = (code: string) => {
      const id = accountId.get(code)
      if (!id) throw new Error(`Account ${code} is missing.`)
      return id
    }
    await tx.invoice.createMany({
      data: volumeInvoices.map((row, index) => ({
        companyId,
        name: row.name,
        moveType: row.moveType,
        state: row.state,
        partnerId: row.moveType === 'in_invoice' ? vendors[index % vendors.length]!.id : customers[index % customers.length]!.id,
        invoiceDate: volumeDate(row.monthsAgo, row.day, now),
        dueDate: row.residual > 0 ? new Date(now.getTime() - 40 * 86_400_000) : volumeDate(row.monthsAgo, row.day + 15, now),
        amountUntaxed: row.untaxed,
        amountTax: row.tax,
        amountTotal: row.total,
        residual: row.residual,
      })),
    })
    const drafts: Prisma.InvoiceCreateManyInput[] = []
    for (let index = 0; index < 40; index += 1) {
      const price = money(2, 180 + index)
      drafts.push({
        companyId,
        name: `INV-V-D${pad(index + 1, 2)}`,
        moveType: 'out_invoice',
        state: 'draft',
        partnerId: customers[index % customers.length]!.id,
        invoiceDate: volumeDate(index % 12, 5, now),
        amountUntaxed: price.untaxed,
        amountTax: price.tax,
        amountTotal: price.total,
        residual: price.total,
      })
    }
    for (let index = 0; index < 70; index += 1) {
      const price = money(8, 40 + (index % 9))
      drafts.push({
        companyId,
        name: `BILL-V-D${pad(index + 1, 2)}`,
        moveType: 'in_invoice',
        state: 'draft',
        partnerId: vendors[index % vendors.length]!.id,
        invoiceDate: volumeDate(index % 12, 4, now),
        amountUntaxed: price.untaxed,
        amountTax: price.tax,
        amountTotal: price.total,
        residual: price.total,
      })
    }
    await chunks(drafts, (part) => tx.invoice.createMany({ data: part }))
    const invoices = await tx.invoice.findMany({
      where: { companyId, OR: [{ name: { startsWith: 'INV-V-' } }, { name: { startsWith: 'BILL-V-' } }, { name: 'CN-V-01' }] },
      select: { id: true, name: true },
    })
    const invoiceId = new Map(invoices.map((row) => [row.name, row.id]))
    await chunks(volumeInvoices.map((row) => ({
      invoiceId: invoiceId.get(row.name) ?? 0,
      description: row.description,
      quantity: 1,
      unitPrice: row.untaxed,
      taxRate: 13,
      subtotal: row.untaxed,
      taxAmount: row.tax,
    })).filter((row) => row.invoiceId > 0), (part) => tx.invoiceLine.createMany({ data: part }))
    await tx.invoicePayment.createMany({
      data: volumeInvoices.filter((row) => row.paid > 0).map((row) => ({
        invoiceId: invoiceId.get(row.name) ?? 0,
        amount: row.paid,
        method: 'bank',
        paidAt: volumeDate(row.monthsAgo, row.day + 10, now),
      })).filter((row) => row.invoiceId > 0),
    })
    await tx.journalEntry.createMany({
      data: volumeJournals.map((row) => ({
        companyId,
        name: row.name,
        journalId: journal.id,
        date: volumeDate(row.monthsAgo, row.day, now),
      })),
    })
    const entries = await tx.journalEntry.findMany({
      where: { companyId, name: { startsWith: 'JE-V-' } },
      select: { id: true, name: true },
    })
    const entryId = new Map(entries.map((row) => [row.name, row.id]))
    const items = volumeJournals.flatMap((row) => row.lines.map((item) => ({
      entryId: entryId.get(row.name) ?? 0,
      accountId: idFor(item.code),
      label: item.label,
      debit: item.debit,
      credit: item.credit,
    }))).filter((row) => row.entryId > 0)
    await chunks(items, (part) => tx.journalItem.createMany({ data: part }))
    const bank = await tx.bankAccount.findFirst({ where: { companyId, name: 'Jiangbei operating' }, select: { id: true } })
    const statement = await tx.bankStatement.create({
      data: {
        companyId,
        bankAccountId: bank?.id ?? null,
        name: 'Jiangbei year statement',
        statementDate: volumeDate(0, 28, now),
        openingBalance: 18600,
      },
    })
    await tx.bankStatementLine.createMany({
      data: volumeBankLines.map((row) => ({
        statementId: statement.id,
        companyId,
        lineDate: volumeDate(row.monthsAgo, row.day, now),
        label: row.label,
        amount: row.amount,
        reference: row.reference,
        fingerprint: `vol:${row.reference}:${row.amount}`,
        reconciled: row.matchedJournal ? row.amount : 0,
      })),
    })
    const lines = await tx.bankStatementLine.findMany({
      where: { statementId: statement.id },
      select: { id: true, reference: true },
    })
    const lineId = new Map(lines.map((row) => [row.reference, row.id]))
    await tx.reconcileMatch.createMany({
      data: volumeBankLines.filter((row) => row.matchedJournal).map((row) => ({
        lineId: lineId.get(row.reference) ?? 0,
        entryId: entryId.get(row.matchedJournal ?? '') ?? null,
        companyId,
        amount: Math.abs(row.amount),
        kind: 'link',
      })).filter((row) => row.lineId > 0 && row.entryId),
    })
    const category = await tx.assetCategory.findFirstOrThrow({ where: { companyId, name: 'Workshop equipment' } })
    const assets = [
      { name: 'Delivery van', cost: 86000, salvage: 8000, months: 60, prefix: 'JE-V-DV', amount: 1300, startAgo: 11 },
      { name: 'Embroidery machine', cost: 42000, salvage: 0, months: 48, prefix: 'JE-V-DM', amount: 875, startAgo: 10 },
    ] as const
    for (const asset of assets) {
      const created = await tx.asset.create({
        data: {
          companyId,
          name: asset.name,
          categoryId: category.id,
          purchaseValue: asset.cost,
          salvageValue: asset.salvage,
          startDate: volumeDate(asset.startAgo, 4, now),
          method: 'straight_line',
          months: asset.months,
          state: 'open',
        },
      })
      await tx.assetDepreciation.createMany({
        data: Array.from({ length: 12 }, (_, index) => {
          const monthsAgo = 11 - index
          const entry = entryId.get(`${asset.prefix}${pad(index + 1, 2)}`)
          return {
            assetId: created.id,
            date: volumeDate(monthsAgo, 28, now),
            amount: asset.amount,
            state: 'posted',
            entryId: entry ?? null,
          }
        }),
      })
    }
    const merchants = ['Jinjiang rail', 'Suzhou hardware', 'North station taxi', 'Dye market', 'Parcel counter', 'Staff canteen']
    await tx.expenseClaim.createMany({
      data: Array.from({ length: 16 }, (_, index) => {
        const reimbursed = index < 6
        return {
          companyId,
          name: `EXV-${pad(index + 1, 2)}`,
          employeeId: people[index % people.length]!.id,
          merchant: merchants[index % merchants.length]!,
          description: reimbursed ? 'Reimbursed from the operating account' : 'Waiting on a receipt check',
          receiptRef: `EXV-R-${pad(index + 1, 2)}`,
          amount: reimbursed ? 240 : 80 + index * 15,
          spentOn: volumeDate(index % 8, 16, now),
          state: reimbursed ? 'reimbursed' : index < 10 ? 'approved' : index < 14 ? 'submitted' : 'refused',
          entryId: reimbursed ? entryId.get(`JE-V-X${pad(index + 1, 2)}`) ?? null : null,
        }
      }),
    })
  }, transactionOptions)
}

async function seedPayroll(client: PrismaClient, companyId: number) {
  if (await client.payrollRun.findFirst({ where: { companyId, name: 'PR-V-01' }, select: { id: true } })) return
  const payByName = new Map<string, { gross: number; deduction: number; net: number }>(volumePayroll.map((row) => [row.name, row]))
  const people = await client.employee.findMany({
    where: { companyId, name: { in: volumePayroll.map((row) => row.name) } },
    select: { id: true, name: true },
  })
  const entries = await client.journalEntry.findMany({
    where: { companyId, name: { startsWith: 'JE-V-W' } },
    select: { id: true, name: true, date: true },
  })
  if (people.length !== volumePayroll.length || entries.length < 12) throw new Error('Volume payroll is missing people or journals.')
  const wage = entries.filter((row) => /^JE-V-W\d\d$/.test(row.name)).sort((a, b) => a.name.localeCompare(b.name))
  await client.$transaction(async (tx) => {
    await tx.salaryStructure.createMany({
      data: people.map((person) => ({
        companyId,
        employeeId: person.id,
        monthlyGross: payByName.get(person.name)?.gross ?? 0,
      })),
    })
    await tx.payrollRun.createMany({
      data: wage.map((row, index) => ({
        companyId,
        name: `PR-V-${pad(index + 1, 2)}`,
        period: row.date.toISOString().slice(0, 7),
        state: 'paid',
        entryId: row.id,
      })),
    })
    const runs = await tx.payrollRun.findMany({
      where: { companyId, name: { startsWith: 'PR-V-' } },
      select: { id: true },
    })
    await chunks(runs.flatMap((run) => people.map((person) => {
      const pay = payByName.get(person.name)
      return {
        runId: run.id,
        employeeId: person.id,
        gross: pay?.gross ?? 0,
        deduction: pay?.deduction ?? 0,
        net: pay?.net ?? 0,
      }
    })), (part) => tx.payslip.createMany({ data: part }))
    const slips = await tx.payslip.findMany({
      where: { run: { companyId, name: { startsWith: 'PR-V-' } } },
      select: { id: true, employee: { select: { name: true } } },
    })
    await chunks(slips.flatMap((slip) => {
      const pay = payByName.get(slip.employee.name)
      return [
        { payslipId: slip.id, code: 'BASIC', label: 'Basic pay', kind: 'earning', amount: pay?.gross ?? 0 },
        { payslipId: slip.id, code: 'IIT', label: 'Wage withholding', kind: 'deduction', amount: pay?.deduction ?? 0 },
      ]
    }), (part) => tx.payslipLine.createMany({ data: part }))
  }, transactionOptions)
}

async function seedProjects(client: PrismaClient, companyId: number, now: Date) {
  if (await client.project.findFirst({ where: { companyId, name: volumeProjects[0] }, select: { id: true } })) return
  const { customers } = await parties(client, companyId)
  const people = await client.employee.findMany({
    where: { companyId, email: { endsWith: '@volume.jiangbei.example' } },
    select: { id: true },
    orderBy: { email: 'asc' },
  })
  await client.$transaction(async (tx) => {
    await tx.project.createMany({
      data: volumeProjects.map((name, index) => ({
        companyId,
        name,
        partnerId: customers[index % customers.length]?.id ?? null,
        billingType: index % 2 === 0 ? 'fixed' : 'time',
        hourlyRate: index % 2 === 0 ? 0 : 180,
        state: index < 7 ? 'open' : 'done',
      })),
    })
    const projects = await tx.project.findMany({
      where: { companyId, name: { in: [...volumeProjects] } },
      select: { id: true, name: true },
    })
    const stages = ['Plan', 'Make', 'Review']
    await tx.projectStage.createMany({
      data: projects.flatMap((project) => stages.map((name, sequence) => ({
        companyId,
        projectId: project.id,
        name,
        sequence,
      }))),
    })
    const storedStages = await tx.projectStage.findMany({
      where: { companyId, project: { name: { in: [...volumeProjects] } } },
      select: { id: true, projectId: true, name: true },
    })
    const tasks = ['Measure the room', 'Cut the cloth', 'Fit and photograph']
    await tx.projectTask.createMany({
      data: storedStages.map((stage, index) => ({
        companyId,
        projectId: stage.projectId,
        stageId: stage.id,
        name: tasks[index % tasks.length]!,
        assigneeId: people[index % people.length]?.id ?? null,
        deadline: volumeDate(index % 6, 20, now),
        sequence: index % 3,
      })),
    })
    const storedTasks = await tx.projectTask.findMany({
      where: { companyId, project: { name: { in: [...volumeProjects] } } },
      select: { id: true, projectId: true },
    })
    const firstTask = new Map<number, number>()
    for (const task of storedTasks) if (!firstTask.has(task.projectId)) firstTask.set(task.projectId, task.id)
    await tx.timesheet.createMany({
      data: projects.flatMap((project, index) => {
        const taskId = firstTask.get(project.id)
        const employeeId = people[index % people.length]?.id
        if (!taskId || !employeeId) return []
        return [
          { companyId, projectId: project.id, taskId, employeeId, workDate: volumeDate(1, 8, now), hours: 4, state: 'approved', description: 'On site' },
          { companyId, projectId: project.id, taskId, employeeId, workDate: volumeDate(0, 6, now), hours: 2.5, state: 'draft', description: 'Follow-up notes' },
        ]
      }),
    })
    await tx.projectMilestone.createMany({
      data: projects.flatMap((project, index) => [
        { companyId, projectId: project.id, name: 'Deposit', amount: 4000 + index * 250, dueDate: volumeDate(2, 1, now), state: index === 0 ? 'approved' : 'open' },
        { companyId, projectId: project.id, name: 'Handover', amount: 6500 + index * 250, dueDate: volumeDate(0, 24, now), state: 'open' },
      ]),
    })
  }, transactionOptions)
}

async function seedTickets(client: PrismaClient, companyId: number, userId: number, now: Date) {
  if (await client.ticket.findFirst({ where: { companyId, number: 'HDV-001' }, select: { id: true } })) return
  const { customers } = await parties(client, companyId)
  const teams = await client.helpdeskTeam.findMany({ where: { companyId }, select: { id: true, name: true } })
  const subjects = [
    'Tote seam opened', 'Notebook cover scuffed', 'Dye lot looks light', 'Delivery missed the stall',
    'Apron strap short', 'Invoice copy requested', 'Swatch card faded', 'Button box short',
    'Blanket smell', 'Zipper sticks',
  ]
  await client.$transaction(async (tx) => {
    await tx.helpdeskTag.createMany({
      data: ['delivery', 'stitch', 'dye-lot'].map((name) => ({ companyId, name })),
      skipDuplicates: true,
    })
    await tx.ticket.createMany({
      data: volumeTickets.map((row, index) => {
        const breached = volumeTicketBreached(row.number)
        const closed = row.stage === 'solved' || row.stage === 'closed'
        const createdAt = new Date(now.getTime() - (20 + (index % 40)) * 86_400_000)
        return {
          companyId,
          number: row.number,
          partnerId: customers[index % customers.length]!.id,
          subject: subjects[index % subjects.length]!,
          description: 'Raised from the shop floor during the volume year.',
          teamId: teams[index % Math.max(teams.length, 1)]?.id ?? null,
          assigneeId: index % 2 === 0 ? userId : null,
          priority: (['low', 'normal', 'high', 'urgent'] as const)[index % 4]!,
          stage: row.stage,
          slaDeadline: closed
            ? new Date(now.getTime() - 86_400_000)
            : new Date(now.getTime() + (breached ? -2 : 4) * 86_400_000),
          resolvedAt: closed ? new Date(now.getTime() - 5 * 86_400_000) : null,
          createdAt,
        }
      }),
    })
    const tickets = await tx.ticket.findMany({
      where: { companyId, number: { startsWith: 'HDV-' } },
      select: { id: true, number: true },
    })
    const tags = await tx.helpdeskTag.findMany({
      where: { companyId, name: { in: ['delivery', 'stitch', 'dye-lot'] } },
      select: { id: true },
    })
    await chunks(tickets.map((row, index) => ({
      ticketId: row.id,
      tagId: tags[index % tags.length]?.id ?? 0,
    })).filter((row) => row.tagId > 0), (part) => tx.ticketTag.createMany({ data: part }))
    await chunks(tickets.map((row) => ({
      ticketId: row.id,
      authorName: 'August',
      body: `Noted on ${row.number}. The workshop has the sample.`,
      internal: false,
    })), (part) => tx.ticketMessage.createMany({ data: part }))
  }, transactionOptions)
}

async function seedPos(client: PrismaClient, companyId: number, userId: number, now: Date) {
  if (await client.posSession.findFirst({ where: { companyId, name: 'SES-V-01' }, select: { id: true } })) return
  const warehouse = await client.warehouse.findFirst({ where: { companyId, code: 'SH' }, select: { id: true } })
  const catalog = await products(client, companyId)
  const goods = sellable(catalog.rows).filter((row) => row.type === 'product').slice(0, 12)
  if (!warehouse || goods.length === 0) throw new Error('Volume register is missing a shelf.')
  await client.$transaction(async (tx) => {
    await tx.posSession.createMany({
      data: Array.from({ length: 30 }, (_, index) => {
        const opened = volumeDate(0, 1, now)
        opened.setUTCDate(opened.getUTCDate() - (index + 1))
        return {
          companyId,
          warehouseId: warehouse.id,
          name: `SES-V-${pad(index + 1, 2)}`,
          state: 'closed',
          openingCash: 400,
          closingCash: 400,
          difference: 0,
          openedById: userId,
          closedById: userId,
          openedAt: opened,
          closedAt: new Date(opened.getTime() + 9 * 60 * 60_000),
        }
      }),
    })
    const sessions = await tx.posSession.findMany({
      where: { companyId, name: { startsWith: 'SES-V-' } },
      select: { id: true, name: true, openedAt: true },
      orderBy: { name: 'asc' },
    })
    const orders = sessions.flatMap((session, sessionIndex) => [0, 1].map((slot) => {
      const product = goods[(sessionIndex + slot) % goods.length]!
      const price = money(1, product.listPrice)
      return {
        companyId,
        warehouseId: warehouse.id,
        sessionId: session.id,
        name: `POSV-${pad(sessionIndex * 2 + slot + 1, 3)}`,
        state: 'paid',
        amountUntaxed: price.untaxed,
        amountTax: price.tax,
        amountTotal: price.total,
        createdById: userId,
        createdAt: session.openedAt,
        productId: product.id,
        productName: product.name,
        unitPrice: product.listPrice,
        subtotal: price.untaxed,
        taxAmount: price.tax,
      }
    }))
    await tx.posOrder.createMany({
      data: orders.map(({ productId: _productId, productName: _productName, unitPrice: _unitPrice, subtotal: _subtotal, taxAmount: _taxAmount, ...order }) => order),
    })
    const stored = await tx.posOrder.findMany({
      where: { companyId, name: { startsWith: 'POSV-' } },
      select: { id: true, name: true },
    })
    const orderId = new Map(stored.map((row) => [row.name, row.id]))
    await chunks(orders.map((row) => ({
      orderId: orderId.get(row.name) ?? 0,
      productId: row.productId,
      description: row.productName,
      quantity: 1,
      unitPrice: row.unitPrice,
      discount: 0,
      taxRate: 13,
      subtotal: row.subtotal,
      taxAmount: row.taxAmount,
    })).filter((row) => row.orderId > 0), (part) => tx.posOrderLine.createMany({ data: part }))
    await chunks(orders.map((row, index) => ({
      orderId: orderId.get(row.name) ?? 0,
      method: (['cash', 'wechat', 'alipay', 'card'] as const)[index % 4]!,
      direction: 'payment',
      amount: row.amountTotal,
    })).filter((row) => row.orderId > 0), (part) => tx.posPayment.createMany({ data: part }))
  }, transactionOptions)
}

async function seedSite(client: PrismaClient, companyId: number, now: Date) {
  if (await client.campaign.findFirst({ where: { companyId, name: volumeMarker }, select: { id: true } })) return
  const { customers } = await parties(client, companyId)
  const pages = [
    {
      title: 'The workroom',
      slug: 'vol-workroom',
      blocks: [
        { id: 'hero', type: 'hero', title: 'A year on the Jiangbei floor', subtitle: 'Cloth, notebooks, and the people who cut them.', button: 'Visit', href: '/site/jiangbei/vol-workroom' },
        { id: 'copy', type: 'text', text: 'The Suzhou aisle and the Shanghai bench have been busy since last autumn. This page is the public note of that year.' },
      ],
    },
    {
      title: 'Visit the stall',
      slug: 'vol-visit',
      blocks: [
        { id: 'copy', type: 'text', text: 'The weekend stall is on the north side of the market. Ask for Lin if you want the indigo totes.' },
        { id: 'contact', type: 'contact' },
      ],
    },
    {
      title: 'Linen notes',
      slug: 'vol-linen',
      blocks: [
        { id: 'copy', type: 'text', text: 'We keep a short list of what the dye house can turn around in a fortnight.' },
        { id: 'blog', type: 'blog' },
      ],
    },
  ]
  const posts = [
    ['What the autumn stall sold', 'vol-autumn-stall', 'Totes outran notebooks once the weather cooled.'],
    ['A short dye lot', 'vol-short-dye', 'Indigo came up lighter than the swatch. We held the roll.'],
    ['Notebooks for the school term', 'vol-school-term', 'The cloth covers went out in three drops.'],
    ['Suzhou aisle recount', 'vol-suzhou-aisle', 'The second warehouse finally has its own shelf labels.'],
    ['Aprons for the cafe', 'vol-cafe-aprons', 'Straps were short on the first batch. The second was not.'],
    ['Letters from the stall', 'vol-stall-letters', 'Most notes asked for the sand tote in a larger size.'],
  ] as const
  await client.$transaction(async (tx) => {
    await tx.sitePage.createMany({
      data: pages.map((page, index) => ({
        companyId,
        title: page.title,
        slug: page.slug,
        seoTitle: page.title,
        seoDescription: 'Jiangbei Goods Co.',
        state: 'published',
        blocks: page.blocks as unknown as Prisma.InputJsonValue,
        sequence: 20 + index,
      })),
    })
    await tx.blogPost.createMany({
      data: posts.map((post, index) => ({
        companyId,
        title: post[0],
        slug: post[1],
        excerpt: post[2],
        body: `${post[2]} The floor kept the offcuts and the notes from that week.`,
        state: index === 5 ? 'draft' : 'published',
        publishedAt: index === 5 ? null : volumeDate(index, 12, now),
      })),
    })
    await tx.siteSubmission.createMany({
      data: volumeCustomers.slice(0, 12).map((row, index) => ({
        companyId,
        name: row.person,
        email: row.email,
        message: index % 2 === 0 ? 'Can you hold two sand totes for the stall?' : 'Please send the swatch book to the studio.',
        createdAt: volumeDate(index % 6, 9, now),
      })),
    })
    const list = await tx.mailList.create({
      data: { companyId, name: 'Volume buyers', segment: 'customers', tag: 'export' },
    })
    const members = customers.slice(0, 40)
    await tx.mailMember.createMany({
      data: members.map((row, index) => ({
        companyId,
        listId: list.id,
        email: row.email ?? `missing${index}@volume.jiangbei.example`,
        name: volumeCustomers[index]?.person ?? 'Buyer',
        status: index % 11 === 0 ? 'unsubscribed' : 'subscribed',
        contactId: row.id,
      })),
    })
    const blocks = [
      { type: 'heading', text: 'From the Jiangbei bench' },
      { type: 'text', text: 'A short note on what left the workroom this season.' },
      { type: 'button', label: 'See the goods', href: '/site/jiangbei/products' },
    ] as const
    await tx.campaign.createMany({
      data: [
        {
          companyId,
          listId: list.id,
          name: volumeMarker,
          subject: 'What left the bench this spring',
          state: 'sent',
          blocks: blocks as unknown as Prisma.InputJsonValue,
          sentAt: volumeDate(1, 18, now),
          channel: 'simulate',
        },
        {
          companyId,
          listId: list.id,
          name: 'VOL Workshop notes',
          subject: 'The dye house is booking June',
          state: 'sent',
          blocks: blocks as unknown as Prisma.InputJsonValue,
          sentAt: volumeDate(0, 6, now),
          channel: 'simulate',
        },
      ],
    })
    const campaigns = await tx.campaign.findMany({
      where: { companyId, name: { in: [volumeMarker, 'VOL Workshop notes'] } },
      select: { id: true, name: true, subject: true },
    })
    const recipients = campaigns.flatMap((campaign) => members.slice(0, 28).map((member, index) => {
      const opened = index % 3 !== 0
      const clicked = index % 5 === 0
      const sentAt = volumeDate(campaign.name === volumeMarker ? 1 : 0, 18, now)
      return {
        companyId,
        campaignId: campaign.id,
        email: member.email ?? '',
        name: volumeCustomers[index]?.person ?? '',
        subject: campaign.subject,
        variant: 'a',
        token: `${campaign.name === volumeMarker ? 'vol-spring' : 'vol-notes'}-${pad(index + 1, 2)}`,
        status: 'sent',
        openedAt: opened ? new Date(sentAt.getTime() + 5 * 60 * 60_000) : null,
        clickedAt: clicked ? new Date(sentAt.getTime() + 7 * 60 * 60_000) : null,
        openCount: opened ? 1 + (index % 3) : 0,
        clickCount: clicked ? 1 : 0,
        sentAt,
      }
    }))
    await chunks(recipients, (part) => tx.campaignRecipient.createMany({ data: part }))
  }, transactionOptions)
}
