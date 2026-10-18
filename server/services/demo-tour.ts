import { Prisma } from '@prisma/client'
import { roundMoney } from '../../src/domain/money.ts'
import { demoStepIds, type DemoRunStatus, type DemoRunView, type DemoStepId, type DemoTourState } from '../../shared/demo-tour.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import type { SessionUser } from '../auth.ts'
import { invoiceFromSales, postInvoice, profitAndLoss } from './accounting.ts'
import { applyLine, importMapped, statementDetail } from './bank.ts'
import { createLead } from './crm.ts'
import { logJobTime, recordWastage } from './floor.ts'
import { confirmManufacturing, createManufacturing, produceManufacturing, startManufacturing } from './manufacturing.ts'
import { confirmOrder, deliverOrder } from './orders.ts'
import { addTask, addTimesheet, approveTimesheet, createProject, invoiceProject, profitability } from './projects.ts'
import { confirmPurchase, createPurchase, receivePurchase } from './purchases.ts'
import { createPoint, prepareQualityChecks, recordCheck, resolveAlert } from './quality.ts'
import { orderFromQuotation } from './trade.ts'

type RunRow = {
  id: number
  companyId: number
  step: number
  status: string
  serial: number
  leadId: number | null
  quotationId: number | null
  salesOrderId: number | null
  purchaseOrderId: number | null
  manufacturingOrderId: number | null
  invoiceId: number | null
  contactId: number | null
  finishedId: number | null
  componentId: number | null
  qualityPointId: number | null
  statementId: number | null
  projectId: number | null
  projectInvoiceId: number | null
  note: string | null
  snapshot: Prisma.JsonValue
}

type Snapshot = {
  costs: Array<{ id: number; costPrice: number }>
  quants: Array<{ productId: number; locationId: number; quantity: number }>
  layers: Array<{ id: number; remaining: number; value: number; unitCost: number }>
  quantity: number
  materialId: number | null
  materialName: string
  productName: string
  withOperations: boolean
}

const emptySnapshot = (): Snapshot => ({
  costs: [],
  quants: [],
  layers: [],
  quantity: 1,
  materialId: null,
  materialName: '',
  productName: '',
  withOperations: false,
})

function asSnapshot(value: Prisma.JsonValue): Snapshot {
  const base = emptySnapshot()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base
  const row = value as Partial<Snapshot>
  return {
    costs: Array.isArray(row.costs) ? row.costs : [],
    quants: Array.isArray(row.quants) ? row.quants : [],
    layers: Array.isArray(row.layers) ? row.layers : [],
    quantity: typeof row.quantity === 'number' && row.quantity > 0 ? row.quantity : 1,
    materialId: typeof row.materialId === 'number' ? row.materialId : null,
    materialName: typeof row.materialName === 'string' ? row.materialName : '',
    productName: typeof row.productName === 'string' ? row.productName : '',
    withOperations: row.withOperations === true,
  }
}

function numberIds(values: Array<number | null | undefined>) {
  return [...new Set(values.filter((value): value is number => typeof value === 'number' && value > 0))]
}

function stepOf(step: number): DemoStepId {
  const id = demoStepIds[step]
  if (!id) throw new AppError(400, 'That step is not part of the demo.')
  return id
}

function statusOf(status: string): DemoRunStatus {
  switch (status) {
    case 'active':
    case 'done':
    case 'skipped':
      return status
    default:
      return 'active'
  }
}

async function tourAvailable(companyId: number) {
  const [bom, customer, supplier] = await Promise.all([
    prisma.billOfMaterials.findFirst({ where: { companyId, active: true }, select: { id: true } }),
    prisma.contact.findFirst({ where: { companyId, isCustomer: true }, select: { id: true } }),
    prisma.contact.findFirst({ where: { companyId, isSupplier: true }, select: { id: true } }),
  ])
  return Boolean(bom && customer && supplier)
}

function viewOf(run: RunRow): DemoRunView {
  const story = asSnapshot(run.snapshot)
  return {
    id: run.id,
    step: run.step,
    status: statusOf(run.status),
    serial: run.serial,
    leadId: run.leadId,
    quotationId: run.quotationId,
    salesOrderId: run.salesOrderId,
    purchaseOrderId: run.purchaseOrderId,
    manufacturingOrderId: run.manufacturingOrderId,
    invoiceId: run.invoiceId,
    finishedId: run.finishedId,
    componentId: run.componentId,
    statementId: run.statementId,
    projectId: run.projectId,
    note: run.note,
    productName: story.productName,
    materialName: story.materialName,
    quantity: story.quantity,
  }
}

async function latestRun(companyId: number) {
  return prisma.demoRun.findFirst({ where: { companyId }, orderBy: { id: 'desc' } })
}

export async function demoTourState(companyId: number): Promise<DemoTourState> {
  const [available, run] = await Promise.all([tourAvailable(companyId), latestRun(companyId)])
  return { available, steps: demoStepIds, run: run ? viewOf(run) : null }
}

async function requireActive(companyId: number) {
  const run = await prisma.demoRun.findFirst({ where: { companyId, status: 'active' }, orderBy: { id: 'desc' } })
  if (!run) throw new AppError(404, 'Start the guided demo first.')
  return run
}

async function purchasableMaterial(companyId: number, productId: number, seen = new Set<number>()): Promise<{ id: number; name: string; costPrice: number } | null> {
  if (seen.has(productId)) return null
  seen.add(productId)
  const bom = await prisma.billOfMaterials.findFirst({
    where: { companyId, productId, active: true },
    orderBy: { version: 'desc' },
    include: { lines: { include: { product: true }, orderBy: { id: 'asc' } } },
  })
  if (!bom) return null
  for (const line of bom.lines) {
    if (line.product.purchasable && line.product.type === 'product' && line.product.active) {
      return { id: line.product.id, name: line.product.name, costPrice: line.product.costPrice }
    }
  }
  for (const line of bom.lines) {
    const found = await purchasableMaterial(companyId, line.productId, seen)
    if (found) return found
  }
  return null
}

async function collectProducts(companyId: number, productId: number, into: Set<number>, depth = 0) {
  if (into.has(productId) || depth > 6) return
  into.add(productId)
  const bom = await prisma.billOfMaterials.findFirst({
    where: { companyId, productId, active: true },
    orderBy: { version: 'desc' },
    include: { lines: true, byproducts: true },
  })
  if (!bom) return
  for (const line of bom.lines) await collectProducts(companyId, line.productId, into, depth + 1)
  for (const side of bom.byproducts) into.add(side.productId)
}

async function pickStory(companyId: number) {
  const apron = await prisma.product.findFirst({
    where: { companyId, sku: { endsWith: '-APRON' }, boms: { some: { active: true } } },
  })
  const tote = apron
    ? null
    : await prisma.product.findFirst({ where: { companyId, name: 'Canvas tote', boms: { some: { active: true } } } })
  const other = apron || tote
    ? null
    : await prisma.product.findFirst({ where: { companyId, boms: { some: { active: true } } }, orderBy: { id: 'asc' } })
  const product = apron ?? tote ?? other
  if (!product) return null
  const bom = await prisma.billOfMaterials.findFirst({
    where: { companyId, productId: product.id, active: true },
    orderBy: { version: 'desc' },
    include: { lines: { include: { product: true }, orderBy: { id: 'asc' } }, operations: { select: { id: true } } },
  })
  if (!bom || bom.lines.length === 0) return null
  const material = await purchasableMaterial(companyId, product.id)
  const component = bom.lines[0]?.product
  if (!component) return null
  return {
    product,
    component,
    material,
    quantity: bom.operations.length > 0 ? 1 : 2,
    withOperations: bom.operations.length > 0,
  }
}

async function takeSnapshot(companyId: number, productIds: number[]): Promise<Pick<Snapshot, 'costs' | 'quants' | 'layers'>> {
  if (productIds.length === 0) return { costs: [], quants: [], layers: [] }
  const [products, quants, layers] = await Promise.all([
    prisma.product.findMany({ where: { companyId, id: { in: productIds } }, select: { id: true, costPrice: true } }),
    prisma.stockQuant.findMany({ where: { productId: { in: productIds } }, select: { productId: true, locationId: true, quantity: true } }),
    prisma.valuationLayer.findMany({
      where: { companyId, productId: { in: productIds } },
      select: { id: true, remaining: true, value: true, unitCost: true },
    }),
  ])
  return {
    costs: products.map((product) => ({ id: product.id, costPrice: product.costPrice })),
    quants,
    layers,
  }
}

async function companyTaxId(companyId: number, rate: number) {
  const tax = await prisma.tax.findFirst({ where: { rate }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] })
  if (tax) return tax.id
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { defaultTaxRate: true } })
  if (!company || company.defaultTaxRate === rate) return null
  const fallback = await prisma.tax.findFirst({ where: { rate: company.defaultTaxRate }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }] })
  return fallback?.id ?? null
}

export async function startDemo(actor: SessionUser, restart: boolean) {
  if (!(await tourAvailable(actor.companyId))) {
    throw new AppError(409, 'This company has no sample bill, customer, and supplier to walk through.')
  }
  if (restart) await resetDemoData(actor.companyId)
  else {
    const active = await prisma.demoRun.findFirst({ where: { companyId: actor.companyId, status: 'active' } })
    if (active) return demoTourState(actor.companyId)
  }
  const story = await pickStory(actor.companyId)
  if (!story) throw new AppError(409, 'This company has no sample bill, customer, and supplier to walk through.')
  const customer = await prisma.contact.findFirst({
    where: { companyId: actor.companyId, isCustomer: true, creditLimit: { lte: 0 } },
    orderBy: { id: 'asc' },
  }) ?? await prisma.contact.findFirst({
    where: { companyId: actor.companyId, isCustomer: true },
    orderBy: { id: 'asc' },
  })
  if (!customer) throw new AppError(409, 'This company has no sample bill, customer, and supplier to walk through.')
  const productIds = new Set<number>()
  await collectProducts(actor.companyId, story.product.id, productIds)
  const stock = await takeSnapshot(actor.companyId, [...productIds])
  const max = await prisma.demoRun.aggregate({ where: { companyId: actor.companyId }, _max: { serial: true } })
  const snapshot: Snapshot = {
    ...stock,
    quantity: story.quantity,
    materialId: story.material?.id ?? null,
    materialName: story.material?.name ?? '',
    productName: story.product.name,
    withOperations: story.withOperations,
  }
  await prisma.demoRun.create({
    data: {
      companyId: actor.companyId,
      userId: actor.id,
      serial: (max._max.serial ?? 0) + 1,
      contactId: customer.id,
      finishedId: story.product.id,
      componentId: story.component.id,
      snapshot: snapshot as unknown as Prisma.InputJsonValue,
    },
  })
  return demoTourState(actor.companyId)
}

async function remember(runId: number, data: Prisma.DemoRunUpdateInput) {
  return prisma.demoRun.update({ where: { id: runId }, data })
}

async function actLead(actor: SessionUser, run: RunRow) {
  if (!run.finishedId || !run.contactId) throw new AppError(409, 'Start the guided demo first.')
  const story = asSnapshot(run.snapshot)
  const customer = await prisma.contact.findFirst({ where: { id: run.contactId, companyId: actor.companyId } })
  const product = await prisma.product.findFirst({ where: { id: run.finishedId, companyId: actor.companyId } })
  if (!customer || !product) throw new AppError(409, 'The demo customer or product is no longer in this company.')
  let leadId = run.leadId
  if (!leadId) {
    const lead = await createLead(actor.companyId, actor.id, {
      name: `August showroom ${run.serial}`,
      contactName: customer.name,
      email: null,
      phone: null,
      expectedRevenue: product.listPrice * story.quantity,
    })
    leadId = lead.id
    await remember(run.id, { leadId })
  }
  let quotationId = run.quotationId
  if (!quotationId) {
    const taxId = await companyTaxId(actor.companyId, actor.company.defaultTaxRate)
    const quote = await prisma.quotation.create({
      data: {
        companyId: actor.companyId,
        name: `GD${run.serial}`,
        customerId: customer.id,
        state: 'draft',
        lines: {
          create: [{
            productId: product.id,
            description: product.name,
            quantity: story.quantity,
            unitPrice: product.listPrice,
            discount: 0,
            taxId,
          }],
        },
      },
    })
    quotationId = quote.id
    await remember(run.id, { quotationId })
  }
  let salesOrderId = run.salesOrderId
  if (!salesOrderId) {
    const order = await orderFromQuotation(actor.companyId, actor.id, quotationId)
    salesOrderId = order.id
    await remember(run.id, { salesOrderId })
    await prisma.lead.update({
      where: { id: leadId },
      data: { stage: 'won', contactId: customer.id, orderId: order.id },
    })
  }
  const order = await prisma.salesOrder.findFirst({ where: { id: salesOrderId, companyId: actor.companyId }, select: { name: true } })
  const quote = await prisma.quotation.findFirst({ where: { id: quotationId, companyId: actor.companyId }, select: { name: true } })
  await remember(run.id, { note: `Quotation ${quote?.name ?? ''} is sales order ${order?.name ?? ''}.` })
  return false
}

async function actConfirm(actor: SessionUser, run: RunRow) {
  if (!run.salesOrderId) throw new AppError(409, 'Create the quotation first.')
  const order = await prisma.salesOrder.findFirst({ where: { id: run.salesOrderId, companyId: actor.companyId } })
  if (!order) throw new AppError(404, 'Order not found.')
  if (order.state === 'sale' || order.state === 'done') {
    await remember(run.id, { note: `${order.name} is already confirmed.` })
    return false
  }
  try {
    await confirmOrder(actor.companyId, order.id)
    await remember(run.id, { note: `${order.name} is confirmed. The shelf already had enough.` })
    return false
  } catch (error) {
    if (error instanceof AppError && error.status === 409) {
      await remember(run.id, { note: error.message })
      return true
    }
    throw error
  }
}

async function actPurchase(actor: SessionUser, run: RunRow) {
  const story = asSnapshot(run.snapshot)
  if (!story.materialId) throw new AppError(409, 'This bill has no purchasable material.')
  const material = await prisma.product.findFirst({ where: { id: story.materialId, companyId: actor.companyId } })
  if (!material) throw new AppError(409, 'This bill has no purchasable material.')
  const supplier = await prisma.contact.findFirst({
    where: { companyId: actor.companyId, isSupplier: true },
    orderBy: { id: 'asc' },
  })
  if (!supplier) throw new AppError(409, 'This company has no supplier.')
  let purchaseId = run.purchaseOrderId
  if (!purchaseId) {
    const taxId = await companyTaxId(actor.companyId, actor.company.defaultTaxRate)
    const created = await createPurchase(actor.companyId, actor.id, {
      vendorId: supplier.id,
      lines: [{ productId: material.id, quantity: 4, unitCost: material.costPrice, taxId }],
    })
    purchaseId = created.id
    await remember(run.id, { purchaseOrderId: purchaseId })
  }
  let purchase = await prisma.purchaseOrder.findFirst({ where: { id: purchaseId, companyId: actor.companyId } })
  if (!purchase) throw new AppError(404, 'Purchase order not found.')
  if (purchase.state === 'draft' || purchase.state === 'sent') {
    await confirmPurchase(actor.companyId, purchase.id)
    purchase = await prisma.purchaseOrder.findFirstOrThrow({ where: { id: purchase.id } })
  }
  let pointId = run.qualityPointId
  if (!pointId) {
    const named = `Guided demo ${material.name}`
    const existing = await prisma.qualityPoint.findFirst({ where: { companyId: actor.companyId, productId: material.id, name: named } })
    const point = existing ?? await createPoint(actor.companyId, { name: named, productId: material.id, trigger: 'receipt', checkType: 'pass_fail' })
    pointId = point.id
    await remember(run.id, { qualityPointId: pointId })
  }
  if (purchase.state === 'purchase') {
    try {
      await receivePurchase(actor.companyId, purchase.id, {})
      purchase = await prisma.purchaseOrder.findFirstOrThrow({ where: { id: purchase.id } })
    } catch (error) {
      if (error instanceof AppError && error.status === 409 && error.message.includes('quality check')) {
        await remember(run.id, { note: error.message })
        return true
      }
      throw error
    }
  }
  await remember(run.id, { note: purchase.state === 'done' ? `Received 4 ${material.name} on ${purchase.name}.` : `${purchase.name} is waiting on the quality check.` })
  return purchase.state !== 'done'
}

async function actMake(actor: SessionUser, run: RunRow) {
  const story = asSnapshot(run.snapshot)
  if (!run.finishedId || !run.salesOrderId) throw new AppError(409, 'Create the sales order before making the goods.')
  let moId = run.manufacturingOrderId
  if (!moId) {
    const created = await createManufacturing(actor.companyId, actor.id, {
      productId: run.finishedId,
      quantity: story.quantity,
      purpose: 'order',
      salesOrderId: run.salesOrderId,
    })
    moId = created.id
    await remember(run.id, { manufacturingOrderId: moId })
  }
  let order = await prisma.manufacturingOrder.findFirst({ where: { id: moId, companyId: actor.companyId } })
  if (!order) throw new AppError(404, 'Manufacturing order not found.')
  if (order.state === 'draft') {
    await confirmManufacturing(actor.companyId, order.id)
    order = await prisma.manufacturingOrder.findFirstOrThrow({ where: { id: order.id } })
  }
  if (order.state === 'confirmed' || order.state === 'stopped') {
    await startManufacturing(actor.companyId, order.id)
    order = await prisma.manufacturingOrder.findFirstOrThrow({ where: { id: order.id } })
  }
  if (story.withOperations) {
    const card = await prisma.jobCard.findFirst({
      where: { companyId: actor.companyId, orderId: order.id },
      orderBy: { sequence: 'asc' },
      include: { logs: true },
    })
    if (card && card.logs.length === 0 && card.status !== 'done') {
      await logJobTime(actor.companyId, card.id, { operatorName: actor.name, minutes: 30, note: null })
    }
  } else if (order.state === 'progress' && order.quantityDone < 0.0001) {
    await produceManufacturing(actor.companyId, order.id, { quantity: 1 })
  }
  await remember(run.id, { note: `${order.name} is in process${story.withOperations ? `, with 30 minutes logged for ${actor.name}` : ''}.` })
  return false
}

async function actWastage(actor: SessionUser, run: RunRow) {
  if (!run.manufacturingOrderId || !run.componentId) throw new AppError(409, 'Start the manufacturing order before recording wastage.')
  const order = await prisma.manufacturingOrder.findFirst({ where: { id: run.manufacturingOrderId, companyId: actor.companyId } })
  if (!order) throw new AppError(404, 'Manufacturing order not found.')
  const existing = await prisma.wastageEntry.findFirst({
    where: { companyId: actor.companyId, orderId: order.id, reason: 'Guided demo fray' },
  })
  if (!existing) {
    if (order.state !== 'progress' && order.state !== 'stopped') {
      throw new AppError(409, 'Start the manufacturing order before recording wastage.')
    }
    await recordWastage(actor.companyId, order.id, {
      productId: run.componentId,
      quantity: 0.1,
      reason: 'Guided demo fray',
      kind: 'process_loss',
    })
  }
  const fresh = await prisma.manufacturingOrder.findFirstOrThrow({ where: { id: order.id } })
  if (fresh.state === 'progress') await produceManufacturing(actor.companyId, fresh.id, {})
  await remember(run.id, { note: `Recorded process loss on ${order.name} and finished the goods.` })
  return false
}

async function actDeliver(actor: SessionUser, run: RunRow) {
  if (!run.salesOrderId) throw new AppError(409, 'Create the sales order first.')
  let order = await prisma.salesOrder.findFirst({ where: { id: run.salesOrderId, companyId: actor.companyId } })
  if (!order) throw new AppError(404, 'Order not found.')
  if (order.state === 'draft' || order.state === 'sent') {
    await confirmOrder(actor.companyId, order.id)
    order = await prisma.salesOrder.findFirstOrThrow({ where: { id: order.id } })
  }
  if (order.state === 'sale') {
    await deliverOrder(actor.companyId, order.id)
    order = await prisma.salesOrder.findFirstOrThrow({ where: { id: order.id } })
  }
  if (order.state !== 'done') throw new AppError(409, `${order.name} is not ready to invoice.`)
  let invoiceId = run.invoiceId
  if (!invoiceId) {
    const created = await invoiceFromSales(actor.companyId, order.id)
    invoiceId = created.id
    await remember(run.id, { invoiceId })
  }
  let invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId: actor.companyId } })
  if (!invoice) throw new AppError(404, 'Invoice not found.')
  if (invoice.state === 'draft') invoice = await postInvoice(actor.companyId, invoice.id)
  await remember(run.id, { note: `Delivered ${order.name} and posted ${invoice.name}. The bank step matches the receipt.` })
  return false
}

async function actQuality(actor: SessionUser, run: RunRow) {
  if (!run.purchaseOrderId || !run.qualityPointId) throw new AppError(409, 'Order the cloth before the inspection.')
  const material = asSnapshot(run.snapshot).materialName || 'The material'
  let purchase = await prisma.purchaseOrder.findFirst({ where: { id: run.purchaseOrderId, companyId: actor.companyId } })
  if (!purchase) throw new AppError(404, 'Purchase order not found.')
  await prepareQualityChecks(actor.companyId, { trigger: 'receipt', productIds: [], purchaseOrderId: purchase.id })
  let check = await prisma.qualityCheck.findFirst({
    where: { companyId: actor.companyId, purchaseOrderId: purchase.id, pointId: run.qualityPointId },
    include: { alert: true },
  })
  if (!check) throw new AppError(409, 'The quality check has not been raised yet.')
  if (check.status === 'pending') {
    await recordCheck(actor.companyId, check.id, { status: 'fail', notes: 'Guided demo hold' })
    const failed = await prisma.qualityCheck.findFirst({ where: { id: check.id }, include: { alert: true } })
    if (failed?.alert && failed.alert.status === 'open') await resolveAlert(actor.companyId, failed.alert.id, 'rework')
    check = await prisma.qualityCheck.findFirstOrThrow({ where: { id: check.id }, include: { alert: true } })
  }
  if (check.status === 'pending') await recordCheck(actor.companyId, check.id, { status: 'pass', notes: 'Guided demo pass' })
  if (purchase.state === 'purchase') {
    await receivePurchase(actor.companyId, purchase.id, {})
    purchase = await prisma.purchaseOrder.findFirstOrThrow({ where: { id: purchase.id } })
  }
  await remember(run.id, { note: `${material} failed, sat in quarantine, then came back. The check passed and ${purchase.name} is received.` })
  return false
}

async function bankBook(companyId: number) {
  const account = await prisma.account.findFirst({ where: { companyId, code: '1002' } })
  if (!account) return 0
  const lines = await prisma.journalItem.findMany({ where: { accountId: account.id }, select: { debit: true, credit: true } })
  return roundMoney(lines.reduce((sum, line) => sum + line.debit - line.credit, 0))
}

async function actBank(actor: SessionUser, run: RunRow) {
  if (!run.invoiceId) throw new AppError(409, 'Deliver and invoice before matching the bank line.')
  const invoice = await prisma.invoice.findFirst({
    where: { id: run.invoiceId, companyId: actor.companyId },
    include: { partner: { select: { name: true } } },
  })
  if (!invoice) throw new AppError(404, 'Invoice not found.')
  let statementId = run.statementId
  if (!statementId) {
    const account = await prisma.bankAccount.findFirst({ where: { companyId: actor.companyId }, orderBy: { id: 'asc' } })
    const amount = roundMoney(invoice.residual > 0.001 ? invoice.residual : invoice.amountTotal)
    const day = new Date().toISOString().slice(0, 10)
    const csv = `date,description,amount,reference\n${day},${invoice.partner.name} ${invoice.name},${amount},${invoice.name}\n`
    const statement = await importMapped(actor.companyId, `GD${run.serial} bank`, {
      csv,
      mapping: { date: 'date', description: 'description', amount: 'amount', reference: 'reference' },
      bankAccountId: account?.id ?? null,
      openingBalance: await bankBook(actor.companyId),
    })
    statementId = statement.id
    await remember(run.id, { statementId })
  }
  const line = await prisma.bankStatementLine.findFirst({ where: { statementId, companyId: actor.companyId }, orderBy: { id: 'asc' } })
  if (!line) throw new AppError(404, 'Statement line not found.')
  const open = roundMoney(Math.abs(line.amount) - line.reconciled)
  if (open > 0.001) {
    const fresh = await prisma.invoice.findFirstOrThrow({ where: { id: invoice.id } })
    if (fresh.residual > 0.001) await applyLine(actor.companyId, line.id, { kind: 'invoice', invoiceId: fresh.id, amount: Math.min(open, fresh.residual) })
    else await applyLine(actor.companyId, line.id, { kind: 'payment', invoiceId: fresh.id, amount: open })
  }
  const detail = await statementDetail(actor.companyId, statementId)
  await remember(run.id, { note: `Matched ${invoice.name}. Statement versus book is ${detail.difference}.` })
  return false
}

async function actProject(actor: SessionUser, run: RunRow) {
  if (!run.contactId) throw new AppError(409, 'Start the guided demo first.')
  let projectId = run.projectId
  if (!projectId) {
    const project = await createProject(actor.companyId, {
      name: `Showroom visit ${run.serial}`,
      partnerId: run.contactId,
      billingType: 'time',
      hourlyRate: 120,
    })
    projectId = project.id
    await remember(run.id, { projectId })
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: actor.companyId },
    include: { tasks: true, stages: { orderBy: { sequence: 'asc' } }, timesheets: true },
  })
  if (!project) throw new AppError(404, 'Project not found.')
  let task = project.tasks[0]
  if (!task) {
    const employee = await prisma.employee.findFirst({ where: { companyId: actor.companyId }, orderBy: { id: 'asc' } })
    const updated = await addTask(actor.companyId, project.id, {
      name: 'Walk the floor',
      stageId: project.stages[0]?.id,
      assigneeId: employee?.id ?? null,
      startDate: '2026-10-18',
      endDate: '2026-10-18',
    })
    task = updated.tasks[0]
  }
  if (!task) throw new AppError(409, 'The project needs a task.')
  if (project.timesheets.length === 0) {
    const employee = await prisma.employee.findFirst({ where: { companyId: actor.companyId }, orderBy: { id: 'asc' } })
    if (!employee) throw new AppError(409, 'This company has no employee to log time.')
    const withSheet = await addTimesheet(actor.companyId, project.id, {
      taskId: task.id,
      employeeId: employee.id,
      workDate: '2026-10-18',
      hours: 2,
      description: 'Guided demo visit',
    })
    const sheet = withSheet.timesheets.find((row) => row.state === 'draft')
    if (sheet) await approveTimesheet(actor.companyId, sheet.id)
  }
  await remember(run.id, { note: `${project.name} has an approved timesheet. Skip ahead, or invoice it next.` })
  return false
}

async function actBill(actor: SessionUser, run: RunRow) {
  if (!run.projectId) throw new AppError(409, 'Create the service project first.')
  let invoiceId = run.projectInvoiceId
  if (!invoiceId) {
    const invoice = await invoiceProject(actor.companyId, run.projectId)
    invoiceId = invoice.id
    await remember(run.id, { projectInvoiceId: invoiceId })
  }
  const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, companyId: actor.companyId } })
  await remember(run.id, { note: `Invoiced the visit on ${invoice?.name ?? ''}. The timesheet is marked invoiced.` })
  return false
}

async function actProfit(actor: SessionUser, run: RunRow) {
  if (!run.projectId) throw new AppError(409, 'Create the service project first.')
  const profit = await profitability(actor.companyId, run.projectId)
  await remember(run.id, { note: `Project revenue ${profit.revenue}, cost ${profit.timesheetCost}, profit ${profit.profit}.` })
  return false
}

async function actBooks(actor: SessionUser, run: RunRow, dashboard: boolean) {
  const pnl = await profitAndLoss(actor.companyId)
  const note = dashboard
    ? `The overview includes this order. Profit is ${pnl.profit}.`
    : `Profit is ${pnl.profit}.`
  await remember(run.id, { note })
  return false
}

async function perform(step: DemoStepId, actor: SessionUser, run: RunRow) {
  switch (step) {
    case 'lead':
      return actLead(actor, run)
    case 'confirm':
      return actConfirm(actor, run)
    case 'purchase':
      return actPurchase(actor, run)
    case 'quality':
      return actQuality(actor, run)
    case 'make':
      return actMake(actor, run)
    case 'wastage':
      return actWastage(actor, run)
    case 'deliver':
      return actDeliver(actor, run)
    case 'bank':
      return actBank(actor, run)
    case 'books':
      return actBooks(actor, run, false)
    case 'dashboard':
      return actBooks(actor, run, true)
    case 'project':
      return actProject(actor, run)
    case 'bill':
      return actBill(actor, run)
    case 'profit':
      return actProfit(actor, run)
    default: {
      const unexpected: never = step
      throw new AppError(400, unexpected)
    }
  }
}

export async function actDemo(actor: SessionUser, step: number) {
  const run = await requireActive(actor.companyId)
  const blocked = await perform(stepOf(step), actor, run)
  const state = await demoTourState(actor.companyId)
  return { ...state, blocked }
}

const statuses = ['active', 'done', 'skipped'] as const

export async function moveDemo(companyId: number, step: number, status?: string) {
  stepOf(step)
  if (status !== undefined && !statuses.includes(status as (typeof statuses)[number])) {
    throw new AppError(400, 'That status is not part of the demo.')
  }
  const run = await requireActive(companyId)
  await remember(run.id, { step, ...(status ? { status } : {}) })
  return demoTourState(companyId)
}

async function restoreSnapshot(tx: Tx, companyId: number, snapshot: Snapshot) {
  for (const cost of snapshot.costs) {
    await tx.product.updateMany({ where: { id: cost.id, companyId }, data: { costPrice: cost.costPrice } })
  }
  const productIds = snapshot.costs.map((cost) => cost.id)
  if (productIds.length > 0) {
    await tx.stockQuant.deleteMany({ where: { productId: { in: productIds } } })
    if (snapshot.quants.length > 0) {
      await tx.stockQuant.createMany({ data: snapshot.quants })
    }
  }
  for (const layer of snapshot.layers) {
    await tx.valuationLayer.updateMany({
      where: { id: layer.id, companyId },
      data: { remaining: layer.remaining, value: layer.value, unitCost: layer.unitCost },
    })
  }
}

export async function resetDemoData(companyId: number) {
  const runs = await prisma.demoRun.findMany({ where: { companyId }, orderBy: { id: 'asc' } })
  if (runs.length === 0) return demoTourState(companyId)
  const baseline = asSnapshot(runs[0]?.snapshot ?? null)
  const leadIds = numberIds(runs.map((run) => run.leadId))
  const quoteIds = numberIds(runs.map((run) => run.quotationId))
  const salesIds = numberIds(runs.map((run) => run.salesOrderId))
  const purchaseIds = numberIds(runs.map((run) => run.purchaseOrderId))
  const makingIds = numberIds(runs.map((run) => run.manufacturingOrderId))
  const invoiceIds = numberIds([...runs.map((run) => run.invoiceId), ...runs.map((run) => run.projectInvoiceId)])
  const pointIds = numberIds(runs.map((run) => run.qualityPointId))
  const statementIds = numberIds(runs.map((run) => run.statementId))
  const projectIds = numberIds(runs.map((run) => run.projectId))
  const reworkRefs = runs
    .map((run) => asSnapshot(run.snapshot).materialName)
    .filter((name) => name.length > 0)
    .map((name) => `${name} rework`)

  await prisma.$transaction(async (tx) => {
    const checkIds = new Set<number>()
    if (purchaseIds.length > 0) {
      const onOrders = await tx.qualityCheck.findMany({ where: { companyId, purchaseOrderId: { in: purchaseIds } }, select: { id: true } })
      for (const row of onOrders) checkIds.add(row.id)
    }
    if (pointIds.length > 0) {
      const onPoints = await tx.qualityCheck.findMany({ where: { pointId: { in: pointIds } }, select: { id: true } })
      for (const row of onPoints) checkIds.add(row.id)
    }
    if (checkIds.size > 0) {
      await tx.qualityAlert.deleteMany({ where: { checkId: { in: [...checkIds] } } })
      await tx.qualityCheck.deleteMany({ where: { id: { in: [...checkIds] } } })
    }
    if (pointIds.length > 0) await tx.qualityPoint.deleteMany({ where: { companyId, id: { in: pointIds } } })
    if (reworkRefs.length > 0) {
      const reworkMoves = await tx.stockMove.findMany({ where: { reference: { in: reworkRefs }, product: { companyId } }, select: { id: true } })
      const reworkIds = reworkMoves.map((move) => move.id)
      if (reworkIds.length > 0) {
        await tx.valuationLayer.deleteMany({ where: { companyId, moveId: { in: reworkIds } } })
        await tx.stockLedger.deleteMany({ where: { companyId, moveId: { in: reworkIds } } })
        await tx.stockMove.deleteMany({ where: { id: { in: reworkIds } } })
      }
    }
    if (statementIds.length > 0) await tx.bankStatement.deleteMany({ where: { companyId, id: { in: statementIds } } })
    if (projectIds.length > 0) {
      await tx.timesheet.deleteMany({ where: { companyId, projectId: { in: projectIds } } })
      await tx.projectMilestone.deleteMany({ where: { companyId, projectId: { in: projectIds } } })
      await tx.taskDependency.deleteMany({ where: { companyId, task: { projectId: { in: projectIds } } } })
      await tx.projectTask.deleteMany({ where: { companyId, projectId: { in: projectIds } } })
      await tx.projectStage.deleteMany({ where: { companyId, projectId: { in: projectIds } } })
    }
    const moveWhere: Prisma.StockMoveWhereInput[] = []
    if (salesIds.length > 0) moveWhere.push({ orderId: { in: salesIds } })
    if (purchaseIds.length > 0) moveWhere.push({ purchaseOrderId: { in: purchaseIds } })
    if (makingIds.length > 0) moveWhere.push({ manufacturingOrderId: { in: makingIds } })
    const moves = moveWhere.length === 0
      ? []
      : await tx.stockMove.findMany({ where: { OR: moveWhere }, select: { id: true } })
    const moveIds = moves.map((move) => move.id)

    const sales = salesIds.length ? await tx.salesOrder.findMany({ where: { companyId, id: { in: salesIds } }, select: { name: true } }) : []
    const purchases = purchaseIds.length ? await tx.purchaseOrder.findMany({ where: { companyId, id: { in: purchaseIds } }, select: { name: true } }) : []
    const making = makingIds.length ? await tx.manufacturingOrder.findMany({ where: { companyId, id: { in: makingIds } }, select: { name: true } }) : []
    const invoices = invoiceIds.length ? await tx.invoice.findMany({ where: { companyId, id: { in: invoiceIds } }, select: { name: true } }) : []
    const labels = new Set<string>()
    for (const row of [...sales, ...purchases, ...making, ...invoices]) labels.add(row.name)
    for (const row of making) {
      labels.add(`${row.name} labour`)
      labels.add(`${row.name} process loss`)
      labels.add(`${row.name} by-product`)
      labels.add(`${row.name} scrap`)
      labels.add(`${row.name} WIP`)
    }
    for (const row of purchases) labels.add(`${row.name} quarantine`)
    for (const ref of reworkRefs) labels.add(ref)

    const labelled = labels.size === 0
      ? []
      : await tx.journalItem.findMany({
        where: { label: { in: [...labels] }, entry: { companyId } },
        select: { entryId: true },
      })
    const invoiceEntries = invoiceIds.length === 0
      ? []
      : await tx.journalEntry.findMany({ where: { companyId, invoiceId: { in: invoiceIds } }, select: { id: true } })
    const entryIds = [...new Set([...labelled.map((row) => row.entryId), ...invoiceEntries.map((row) => row.id)])]

    if (moveIds.length > 0) {
      await tx.valuationLayer.deleteMany({ where: { companyId, moveId: { in: moveIds } } })
      await tx.stockLedger.deleteMany({ where: { companyId, moveId: { in: moveIds } } })
    }
    if (entryIds.length > 0) {
      await tx.valuationLayer.updateMany({ where: { companyId, entryId: { in: entryIds } }, data: { entryId: null } })
      await tx.journalEntry.deleteMany({ where: { companyId, id: { in: entryIds } } })
    }
    if (moveIds.length > 0) await tx.stockMove.deleteMany({ where: { id: { in: moveIds } } })

    await restoreSnapshot(tx, companyId, baseline)

    if (salesIds.length > 0) await tx.deliveryNote.deleteMany({ where: { companyId, salesOrderId: { in: salesIds } } })
    if (purchaseIds.length > 0) await tx.purchaseReceipt.deleteMany({ where: { companyId, purchaseOrderId: { in: purchaseIds } } })
    if (invoiceIds.length > 0) {
      await tx.reconcileMatch.deleteMany({ where: { companyId, invoiceId: { in: invoiceIds } } })
      await tx.invoice.deleteMany({ where: { companyId, id: { in: invoiceIds } } })
    }
    if (makingIds.length > 0) {
      await tx.wastageEntry.deleteMany({ where: { companyId, orderId: { in: makingIds } } })
      await tx.manufacturingOrder.deleteMany({ where: { companyId, id: { in: makingIds } } })
    }
    if (quoteIds.length > 0) await tx.quotation.deleteMany({ where: { companyId, id: { in: quoteIds } } })
    if (salesIds.length > 0) await tx.salesOrder.deleteMany({ where: { companyId, id: { in: salesIds } } })
    if (purchaseIds.length > 0) await tx.purchaseOrder.deleteMany({ where: { companyId, id: { in: purchaseIds } } })
    if (leadIds.length > 0) await tx.lead.deleteMany({ where: { companyId, id: { in: leadIds } } })
    if (projectIds.length > 0) await tx.project.deleteMany({ where: { companyId, id: { in: projectIds } } })

    const chatter: Prisma.ChatterMessageWhereInput[] = [
      ...salesIds.map((recordId) => ({ model: 'sale.order', recordId })),
      ...purchaseIds.map((recordId) => ({ model: 'purchase.order', recordId })),
      ...makingIds.map((recordId) => ({ model: 'mrp.order', recordId })),
      ...quoteIds.map((recordId) => ({ model: 'quotation', recordId })),
      ...invoiceIds.map((recordId) => ({ model: 'account.move', recordId })),
    ]
    if (chatter.length > 0) await tx.chatterMessage.deleteMany({ where: { companyId, OR: chatter } })
    await tx.demoRun.deleteMany({ where: { companyId } })
  }, transactionOptions)

  return demoTourState(companyId)
}
