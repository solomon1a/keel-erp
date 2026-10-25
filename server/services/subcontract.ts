import { roundMoney } from '../../src/domain/money.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { assertYearOpen } from './books.ts'
import { readSetting } from './company-settings.ts'
import { accountId, ensureAccounts, postEntry } from './journals.ts'
import { allocateKnown } from './number-series.ts'
import { assertBooksOpen } from './locks.ts'
import { applyQuant, companyLocations, onHand, roundQty } from './stock.ts'
import { valueDoneMove } from './valuation.ts'

const feeAccounts = [
  ['1408', 'Subcontracted goods', 'asset'],
  ['2202', 'Accounts payable', 'liability'],
  ['222102', 'Input VAT', 'liability'],
] as const

async function vendorLocation(tx: Tx, companyId: number, vendorId: number) {
  const existing = await tx.stockLocation.findFirst({ where: { companyId, type: 'subcontract', vendorId } })
  if (existing) return existing
  const vendor = await tx.contact.findFirst({ where: { id: vendorId, companyId } })
  if (!vendor) throw new AppError(404, 'Vendor not found.')
  return tx.stockLocation.create({
    data: {
      companyId,
      vendorId,
      name: `Subcontract · ${vendor.name}`,
      type: 'subcontract',
      warehouseId: null,
    },
  })
}

function parseDay(iso: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new AppError(400, 'Use a date like 2026-04-18.')
  return new Date(`${iso}T00:00:00.000Z`)
}

const orderInclude = {
  vendor: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, sku: true } },
  location: { select: { id: true, name: true } },
  lines: {
    include: { product: { select: { id: true, name: true, sku: true } } },
    orderBy: { id: 'asc' as const },
  },
  receipts: { orderBy: { id: 'asc' as const } },
} as const

type OrderRow = Awaited<ReturnType<typeof loadOrder>>

type Store = Tx | typeof prisma

async function loadOrder(tx: Store, companyId: number, orderId: number) {
  const order = await tx.subcontractOrder.findFirst({ where: { id: orderId, companyId }, include: orderInclude })
  if (!order) throw new AppError(404, 'Subcontract order not found.')
  return order
}

async function present(tx: Store, order: OrderRow) {
  const quants = await tx.stockQuant.findMany({
    where: { locationId: order.locationId, quantity: { gt: 0 } },
    include: { product: { select: { id: true, name: true, sku: true } } },
  })
  return {
    id: order.id,
    name: order.name,
    state: order.state,
    quantity: order.quantity,
    received: order.received,
    fee: order.fee,
    vendor: order.vendor,
    product: order.product,
    location: order.location,
    lines: order.lines.map((line) => ({
      id: line.id,
      productId: line.productId,
      name: line.product.name,
      sku: line.product.sku,
      perUnit: line.perUnit,
      sent: line.sent,
      consumed: line.consumed,
      onHand: quants.find((quant) => quant.productId === line.productId)?.quantity ?? 0,
    })),
    stock: quants.map((quant) => ({
      productId: quant.productId,
      name: quant.product.name,
      sku: quant.product.sku,
      quantity: quant.quantity,
    })),
    receipts: order.receipts.map((receipt) => ({
      id: receipt.id,
      quantity: receipt.quantity,
      componentCost: receipt.componentCost,
      fee: receipt.fee,
      invoiceId: receipt.invoiceId,
      date: receipt.date.toISOString().slice(0, 10),
    })),
  }
}

async function nextOrderName(tx: Tx, companyId: number) {
  return allocateKnown(tx, companyId, 'subcontract.order')
}

export type SubcontractDraft = {
  vendorId: number
  productId: number
  bomId: number
  quantity: number
  fee: number
  name?: string
}

export async function createSubcontractOrder(companyId: number, input: SubcontractDraft) {
  return prisma.$transaction((tx) => createSubcontractOrderTx(tx, companyId, input), transactionOptions)
}

export async function createSubcontractOrderTx(tx: Tx, companyId: number, input: SubcontractDraft) {
  const quantity = roundQty(input.quantity)
  const fee = roundMoney(input.fee)
  if (quantity <= 0) throw new AppError(400, 'Order at least one finished unit.')
  if (fee < 0) throw new AppError(400, 'The service fee cannot be negative.')
  const vendor = await tx.contact.findFirst({ where: { id: input.vendorId, companyId, isSupplier: true } })
  if (!vendor) throw new AppError(400, 'Choose a vendor in this company.')
  const product = await tx.product.findFirst({ where: { id: input.productId, companyId, type: 'product' } })
  if (!product) throw new AppError(400, 'Choose a stocked finished product.')
  const bom = await tx.billOfMaterials.findFirst({
    where: { id: input.bomId, companyId, productId: product.id, active: true },
    include: { lines: true },
  })
  if (!bom || bom.lines.length === 0) throw new AppError(400, 'Choose an active bill of materials for that product.')
  const yieldQty = bom.yieldQty > 0 ? bom.yieldQty : 1
  const location = await vendorLocation(tx, companyId, vendor.id)
  const order = await tx.subcontractOrder.create({
    data: {
      companyId,
      name: input.name?.trim() || (await nextOrderName(tx, companyId)),
      vendorId: vendor.id,
      productId: product.id,
      bomId: bom.id,
      locationId: location.id,
      quantity,
      fee,
      state: 'confirmed',
      lines: {
        create: bom.lines.map((line) => ({
          productId: line.productId,
          perUnit: roundQty(line.quantity / yieldQty),
        })),
      },
    },
  })
  return present(tx, await loadOrder(tx, companyId, order.id))
}

export type SendLine = { productId: number; quantity: number }

export async function sendComponents(companyId: number, orderId: number, lines: SendLine[], date: string) {
  const when = parseDay(date)
  return prisma.$transaction((tx) => sendComponentsTx(tx, companyId, orderId, lines, when), transactionOptions)
}

export async function sendComponentsTx(tx: Tx, companyId: number, orderId: number, lines: SendLine[], when: Date) {
  const resupply = await readSetting(tx, companyId, 'subcontracting', 'resupply', 'yes')
  if (resupply === 'no') throw new AppError(409, 'Component resupply is turned off.')
  const order = await loadOrder(tx, companyId, orderId)
  if (order.state !== 'confirmed' && order.state !== 'progress') {
    throw new AppError(409, 'Components can be sent while the order is open.')
  }
  const wanted = lines.filter((line) => line.quantity > 0)
  if (wanted.length === 0) throw new AppError(400, 'Enter a quantity to send.')
  const places = await companyLocations(tx, companyId)
  for (const row of wanted) {
    const component = order.lines.find((line) => line.productId === row.productId)
    if (!component) throw new AppError(400, 'That product is not on this order.')
    const quantity = roundQty(row.quantity)
    const shelf = await onHand(tx, component.productId, places.internal.id)
    if (shelf + 0.0001 < quantity) {
      throw new AppError(409, `${component.product.name} does not have enough on the shelf.`)
    }
    const move = await tx.stockMove.create({
      data: {
        productId: component.productId,
        locationFromId: places.internal.id,
        locationToId: order.locationId,
        quantity,
        state: 'done',
        reference: `${order.name} send`,
        subcontractOrderId: order.id,
        date: when,
      },
    })
    await applyQuant(tx, component.productId, places.internal.id, -quantity)
    await applyQuant(tx, component.productId, order.locationId, quantity)
    await valueDoneMove(tx, companyId, move.id)
    const layer = await tx.valuationLayer.findFirst({ where: { moveId: move.id } })
    const movedValue = roundMoney(Math.abs(layer?.value ?? 0))
    await tx.subcontractComponent.update({
      where: { id: component.id },
      data: { sent: roundQty(component.sent + quantity), valueSent: roundMoney(component.valueSent + movedValue) },
    })
  }
  await tx.subcontractOrder.update({ where: { id: order.id }, data: { state: 'progress' } })
  return present(tx, await loadOrder(tx, companyId, order.id))
}

export async function receiveFinished(companyId: number, orderId: number, quantity: number, date: string) {
  const when = parseDay(date)
  return prisma.$transaction((tx) => receiveFinishedTx(tx, companyId, orderId, quantity, when), transactionOptions)
}

export async function receiveFinishedTx(tx: Tx, companyId: number, orderId: number, rawQty: number, when: Date) {
  const order = await loadOrder(tx, companyId, orderId)
  if (order.state !== 'confirmed' && order.state !== 'progress') {
    throw new AppError(409, 'Finished goods can be received while the order is open.')
  }
  const quantity = roundQty(rawQty)
  if (quantity <= 0) throw new AppError(400, 'Receive at least one finished unit.')
  if (roundQty(order.received + quantity) > order.quantity + 0.0001) {
    throw new AppError(409, 'That receipt is more than the order.')
  }
  const shortages: Array<{ product: string; sku: string; need: number; onHand: number }> = []
  const needs = order.lines.map((line) => {
    const need = roundQty(quantity * line.perUnit)
    return { line, need }
  })
  for (const row of needs) {
    const held = await onHand(tx, row.line.productId, order.locationId)
    if (held + 0.0001 < row.need) {
      shortages.push({ product: row.line.product.name, sku: row.line.product.sku, need: row.need, onHand: held })
    }
  }
  if (shortages.length > 0) {
    throw new AppError(409, 'The subcontractor is short of components.', { shortages })
  }
  const places = await companyLocations(tx, companyId)
  const placeName = await readSetting(tx, companyId, 'subcontracting', 'location', 'Stock')
  let shelf = places.internal
  if (placeName !== 'Stock') {
    const found = await tx.stockLocation.findFirst({ where: { companyId, type: 'internal', name: placeName } })
    if (!found) throw new AppError(400, `Location ${placeName} is not an internal location.`)
    shelf = found
  }
  let componentCost = 0
  for (const row of needs) {
    const available = roundQty(row.line.sent - row.line.consumed)
    const valueLeft = roundMoney(row.line.valueSent - row.line.valueUsed)
    const portion = row.need >= available - 0.0001 ? valueLeft : roundMoney((valueLeft / Math.max(available, 0.001)) * row.need)
    componentCost = roundMoney(componentCost + portion)
    const move = await tx.stockMove.create({
      data: {
        productId: row.line.productId,
        locationFromId: order.locationId,
        locationToId: places.production.id,
        quantity: row.need,
        state: 'done',
        reference: `${order.name} consume`,
        subcontractOrderId: order.id,
        date: when,
      },
    })
    await applyQuant(tx, row.line.productId, order.locationId, -row.need)
    await applyQuant(tx, row.line.productId, places.production.id, row.need)
    await valueDoneMove(tx, companyId, move.id)
    await tx.subcontractComponent.update({
      where: { id: row.line.id },
      data: {
        consumed: roundQty(row.line.consumed + row.need),
        valueUsed: roundMoney(row.line.valueUsed + portion),
      },
    })
  }
  const fee = roundMoney(quantity * order.fee)
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } })
  const tax = roundMoney(fee * (company.defaultTaxRate / 100))
  const total = roundMoney(fee + tax)
  let invoiceId: number | null = null
  if (fee > 0.001 || tax > 0.001) {
    await ensureAccounts(tx, companyId, feeAccounts)
    const map = new Map((await tx.account.findMany({ where: { companyId, code: { in: feeAccounts.map((row) => row[0]) } } })).map((row) => [row.code, row.id]))
    const invoice = await tx.invoice.create({
      data: {
        name: await allocateKnown(tx, companyId, 'account.in'),
        moveType: 'in_invoice',
        state: 'posted',
        partnerId: order.vendorId,
        companyId,
        invoiceDate: when,
        amountUntaxed: fee,
        amountTax: tax,
        amountTotal: total,
        residual: total,
        lines: {
          create: [{
            description: `Subcontract service ${order.name}`,
            quantity,
            unitPrice: order.fee,
            taxRate: company.defaultTaxRate,
            subtotal: fee,
            taxAmount: tax,
          }],
        },
      },
    })
    invoiceId = invoice.id
    await assertBooksOpen(tx, companyId, when, tax > 0.001)
    await assertYearOpen(tx, companyId, when)
    const label = `${order.name} service`
    await postEntry(tx, companyId, when, [
      { accountId: accountId(map, '1408'), debit: fee, credit: 0, label, partnerId: order.vendorId },
      { accountId: accountId(map, '222102'), debit: tax, credit: 0, label, partnerId: order.vendorId },
      { accountId: accountId(map, '2202'), debit: 0, credit: total, label, partnerId: order.vendorId },
    ], invoice.id)
  }
  const incoming = quantity > 0 ? roundMoney((componentCost + fee) / quantity) : 0
  const finished = await tx.stockMove.create({
    data: {
      productId: order.productId,
      locationFromId: order.locationId,
      locationToId: shelf.id,
      quantity,
      state: 'done',
      reference: `${order.name} receive`,
      subcontractOrderId: order.id,
      unitCost: incoming,
      date: when,
    },
  })
  await applyQuant(tx, order.productId, shelf.id, quantity)
  await valueDoneMove(tx, companyId, finished.id)
  const received = roundQty(order.received + quantity)
  await tx.subcontractReceipt.create({
    data: { orderId: order.id, quantity, componentCost, fee, invoiceId, date: when },
  })
  await tx.subcontractOrder.update({
    where: { id: order.id },
    data: { received, state: received + 0.0001 >= order.quantity ? 'done' : 'progress' },
  })
  return present(tx, await loadOrder(tx, companyId, order.id))
}

export async function listSubcontractOrders(companyId: number) {
  const rows = await prisma.subcontractOrder.findMany({
    where: { companyId },
    include: orderInclude,
    orderBy: { id: 'desc' },
  })
  return Promise.all(rows.map((row) => present(prisma, row)))
}

export async function getSubcontractOrder(companyId: number, orderId: number) {
  return present(prisma, await loadOrder(prisma, companyId, orderId))
}

export async function subcontractStock(companyId: number) {
  const locations = await prisma.stockLocation.findMany({
    where: { companyId, type: 'subcontract' },
    include: {
      vendor: { select: { id: true, name: true } },
      quants: { include: { product: { select: { id: true, name: true, sku: true } } } },
    },
    orderBy: { name: 'asc' },
  })
  return locations.map((location) => ({
    id: location.id,
    name: location.name,
    vendor: location.vendor,
    lines: location.quants
      .filter((quant) => Math.abs(quant.quantity) > 0.0001)
      .map((quant) => ({
        productId: quant.productId,
        name: quant.product.name,
        sku: quant.product.sku,
        quantity: quant.quantity,
      })),
  }))
}
