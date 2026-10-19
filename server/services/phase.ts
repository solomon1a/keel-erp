import { randomBytes } from 'node:crypto'
import { roundMoney } from '../../src/domain/money.ts'
import { scheduleInstalments, isOverdue } from '../../shared/payment-terms.ts'
import { asTaxKind, computeTaxes, mapTaxes, type EngineTax } from '../../shared/tax-engine.ts'
import { prisma, transactionOptions } from '../db.ts'
import { AppError } from '../errors.ts'
import { sendMail } from './mailer.ts'
import { sendCampaign } from './marketing.ts'
import { simplePdf } from './pdf.ts'
import { nextName } from './accounting.ts'
import { rowsToXlsx, xlsxToRows } from './sheet.ts'

const byteLimit = 1_500_000

export async function listCompanyTaxes(companyId: number) {
  const [taxes, groups, positions] = await Promise.all([
    prisma.companyTax.findMany({ where: { companyId }, orderBy: { sequence: 'asc' } }),
    prisma.taxGroup.findMany({ where: { companyId }, include: { lines: { include: { tax: true }, orderBy: { sequence: 'asc' } } }, orderBy: { name: 'asc' } }),
    prisma.fiscalPosition.findMany({ where: { companyId }, include: { maps: true }, orderBy: { name: 'asc' } }),
  ])
  return { taxes, groups, positions }
}

export async function previewTax(
  companyId: number,
  input: { base: number; quantity: number; groupId: number; positionId?: number | null },
) {
  const group = await prisma.taxGroup.findFirst({
    where: { id: input.groupId, companyId },
    include: { lines: { include: { tax: true }, orderBy: { sequence: 'asc' } } },
  })
  if (!group) throw new AppError(404, 'Tax group not found.')
  const active = group.lines.filter((line) => line.tax.active).map((line) => engineTax(line.tax))
  if (!input.positionId) return computeTaxes(input.base, input.quantity, active)
  const position = await prisma.fiscalPosition.findFirst({
    where: { id: input.positionId, companyId },
    include: { maps: true },
  })
  if (!position) throw new AppError(404, 'Fiscal position not found.')
  const pool = await prisma.companyTax.findMany({ where: { companyId, active: true } })
  const maps = position.maps.map((row) => ({ taxId: row.taxId, replacementId: row.replacementId }))
  const groupIds = new Set(group.lines.map((line) => line.taxId))
  const replacements = new Set(
    position.maps.flatMap((map) => (groupIds.has(map.taxId) && map.replacementId ? [map.replacementId] : [])),
  )
  const taxes = mapTaxes(pool.map(engineTax), maps).filter((tax) => groupIds.has(tax.id) || replacements.has(tax.id))
  return computeTaxes(input.base, input.quantity, taxes)
}

function engineTax(tax: { id: number; name: string; kind: string; amount: number; priceInclude: boolean; compound: boolean; withholding: boolean; sequence: number }): EngineTax {
  return {
    id: tax.id,
    name: tax.name,
    kind: asTaxKind(tax.kind),
    amount: tax.amount,
    priceInclude: tax.priceInclude,
    compound: tax.compound,
    withholding: tax.withholding,
    sequence: tax.sequence,
  }
}

export async function taxReport(companyId: number) {
  const taxes = await prisma.companyTax.findMany({ where: { companyId }, orderBy: { sequence: 'asc' } })
  const rows = await prisma.documentTax.findMany({ where: { companyId } })
  return taxes.map((tax) => {
    const mine = rows.filter((row) => row.taxId === tax.id)
    const added = roundMoney(mine.filter((row) => !row.withheld).reduce((sum, row) => sum + row.amount, 0))
    const withheld = roundMoney(mine.filter((row) => row.withheld).reduce((sum, row) => sum + row.amount, 0))
    return { id: tax.id, code: tax.code, name: tax.name, added, withheld, documents: mine.length }
  })
}

export async function listTerms(companyId: number) {
  return prisma.paymentTerm.findMany({ where: { companyId }, include: { lines: { orderBy: { sequence: 'asc' } } }, orderBy: { name: 'asc' } })
}

export async function invoiceTerms(companyId: number, invoiceId: number) {
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, companyId },
    include: { instalments: { orderBy: { sequence: 'asc' } }, paymentTerm: true, followUps: { include: { level: true } } },
  })
  if (!invoice) throw new AppError(404, 'Invoice not found.')
  return {
    dueDate: invoice.dueDate,
    overdue: isOverdue(invoice.dueDate, invoice.residual),
    term: invoice.paymentTerm?.name ?? null,
    instalments: invoice.instalments,
    followUps: invoice.followUps,
  }
}

export async function runRecurring(companyId: number, today = new Date()) {
  const due = await prisma.recurringInvoice.findMany({
    where: { companyId, active: true, nextDate: { lte: today } },
  })
  const created: number[] = []
  for (const row of due) {
    const invoice = await prisma.$transaction(async (tx) => {
      const subtotal = roundMoney(row.quantity * row.unitPrice)
      const taxAmount = roundMoney(subtotal * (row.taxRate / 100))
      const total = roundMoney(subtotal + taxAmount)
      const draft = await tx.invoice.create({
        data: {
          name: await nextName(tx, `account.out.${companyId}`, 'INV'),
          moveType: 'out_invoice',
          state: 'draft',
          partnerId: row.partnerId,
          companyId,
          invoiceDate: today,
          recurringId: row.id,
          amountUntaxed: subtotal,
          amountTax: taxAmount,
          amountTotal: total,
          residual: total,
          lines: {
            create: [{
              description: row.description,
              quantity: row.quantity,
              unitPrice: row.unitPrice,
              discount: 0,
              taxRate: row.taxRate,
              subtotal,
              taxAmount,
            }],
          },
        },
      })
      const next = new Date(row.nextDate)
      next.setUTCDate(next.getUTCDate() + row.intervalDays)
      await tx.recurringInvoice.update({ where: { id: row.id }, data: { nextDate: next } })
      return draft
    }, transactionOptions)
    created.push(invoice.id)
  }
  return created
}

const documentModels = ['sale.order', 'purchase.order', 'account.move', 'quotation'] as const
type DocumentModel = (typeof documentModels)[number]

function documentModel(value: string): DocumentModel {
  switch (value) {
    case 'sale.order':
    case 'purchase.order':
    case 'account.move':
    case 'quotation':
      return value
    default:
      throw new AppError(400, 'That document cannot be mailed.')
  }
}

export async function sendDocument(companyId: number, modelName: string, recordId: number, origin: string, note: string) {
  const model = documentModel(modelName)
  const document = await loadDocument(companyId, model, recordId)
  const pdf = simplePdf([document.title, document.partner, ...document.lines, `Total ${document.total}`, note].filter(Boolean))
  const subject = document.title
  const link = `${origin}${document.path}`
  const text = `${document.title}\n${document.partner}\n${document.lines.join('\n')}\nTotal ${document.total}\n${note}\n${link}`
  if (!document.email) throw new AppError(400, 'This partner has no email address.')
  const result = await sendMail({
    to: document.email,
    subject,
    text,
    attachments: [{ filename: `${document.filename}.pdf`, content: pdf, contentType: 'application/pdf' }],
  })
  const channel = result.channel === 'log' ? 'simulate' : result.channel
  const log = await prisma.mailLog.create({
    data: { companyId, model, recordId, to: document.email, subject, body: text, channel },
  })
  return { ...log, simulated: channel === 'simulate', link }
}

export async function documentMail(companyId: number, modelName: string, recordId: number) {
  const model = documentModel(modelName)
  return prisma.mailLog.findMany({ where: { companyId, model, recordId }, orderBy: { id: 'desc' } })
}

async function loadDocument(companyId: number, model: DocumentModel, recordId: number) {
  switch (model) {
    case 'sale.order': {
      const row = await prisma.salesOrder.findFirst({
        where: { id: recordId, companyId },
        include: { customer: true, lines: true },
      })
      if (!row) throw new AppError(404, 'Order not found.')
      return packed(row.name, row.customer.name, row.customer.email, row.lines.map((line) => `${line.description} x ${line.quantity}`), row.amountTotal, `/orders/${row.id}/print`, 'sale.order')
    }
    case 'purchase.order': {
      const row = await prisma.purchaseOrder.findFirst({
        where: { id: recordId, companyId },
        include: { vendor: true, lines: true },
      })
      if (!row) throw new AppError(404, 'Purchase order not found.')
      return packed(row.name, row.vendor.name, row.vendor.email, row.lines.map((line) => `${line.description} x ${line.quantity}`), row.amountTotal, `/purchases/${row.id}/print`, 'purchase.order')
    }
    case 'account.move': {
      const row = await prisma.invoice.findFirst({
        where: { id: recordId, companyId },
        include: { partner: true, lines: true },
      })
      if (!row) throw new AppError(404, 'Invoice not found.')
      return packed(row.name, row.partner.name, row.partner.email, row.lines.map((line) => `${line.description} x ${line.quantity}`), row.amountTotal, `/accounting/${row.id}/print`, row.moveType.startsWith('in') ? 'bill' : 'invoice')
    }
    case 'quotation': {
      const row = await prisma.quotation.findFirst({
        where: { id: recordId, companyId },
        include: { customer: true, lines: true },
      })
      if (!row) throw new AppError(404, 'Quotation not found.')
      const total = roundMoney(row.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0))
      return packed(row.name, row.customer.name, row.customer.email, row.lines.map((line) => `${line.description} x ${line.quantity}`), total, `/orders/${row.salesOrderId ?? ''}/print`, 'quotation')
    }
    default: {
      const unexpected: never = model
      throw new AppError(400, unexpected)
    }
  }
}

function packed(name: string, partner: string, email: string | null, lines: string[], total: number, path: string, filename: string) {
  return { title: name, partner, email, lines, total, path, filename: `${filename}-${name}`.replace(/\s+/g, '-') }
}

export async function listFiles(companyId: number, model: string, recordId: number) {
  return prisma.fileBlob.findMany({
    where: { companyId, model, recordId },
    select: { id: true, name: true, mime: true, size: true, url: true, createdAt: true },
    orderBy: { id: 'desc' },
  })
}

export async function saveFile(companyId: number, model: string, recordId: number, name: string, mime: string, bytes: Buffer) {
  if (!name.trim()) throw new AppError(400, 'Name the file.')
  if (bytes.length === 0) throw new AppError(400, 'That file is empty.')
  if (bytes.length > byteLimit) throw new AppError(400, 'That file is larger than 1.5 MB.')
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim()
  let url: string | null = null
  let stored: Buffer | null = bytes
  if (token) {
    const pathname = `keel/${companyId}/${model}/${recordId}/${Date.now()}-${name.replace(/[^\w.\-]+/g, '_')}`
    const response = await fetch(`https://blob.vercel-storage.com/${pathname}`, {
      method: 'PUT',
      headers: {
        authorization: `Bearer ${token}`,
        'x-content-type': mime || 'application/octet-stream',
        'x-api-version': '7',
      },
      body: new Uint8Array(bytes),
    })
    if (!response.ok) throw new AppError(502, 'The file store did not accept that upload.')
    const body = await response.json() as { url?: string }
    url = body.url ?? null
    stored = null
  }
  return prisma.fileBlob.create({
    data: { companyId, model, recordId, name: name.trim(), mime: mime || 'application/octet-stream', size: bytes.length, bytes: stored ? new Uint8Array(stored) : null, url },
    select: { id: true, name: true, mime: true, size: true, url: true, createdAt: true },
  })
}

export async function readFile(companyId: number, fileId: number) {
  const file = await prisma.fileBlob.findFirst({ where: { id: fileId, companyId } })
  if (!file) throw new AppError(404, 'File not found.')
  if (file.url) return { name: file.name, mime: file.mime, url: file.url, bytes: null as Buffer | null }
  return { name: file.name, mime: file.mime, url: null, bytes: file.bytes ? Buffer.from(file.bytes) : Buffer.alloc(0) }
}

export async function removeFile(companyId: number, fileId: number) {
  const file = await prisma.fileBlob.findFirst({ where: { id: fileId, companyId } })
  if (!file) throw new AppError(404, 'File not found.')
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim()
  if (file.url && token) {
    await fetch(file.url, { method: 'DELETE', headers: { authorization: `Bearer ${token}` } }).catch(() => undefined)
  }
  await prisma.fileBlob.delete({ where: { id: file.id } })
  return { ok: true }
}

export async function runJobs(today = new Date()) {
  const companies = await prisma.company.findMany({ select: { id: true } })
  let campaigns = 0
  let reminders = 0
  let recurring = 0
  for (const company of companies) {
    const scheduled = await prisma.campaign.findMany({
      where: { companyId: company.id, state: 'scheduled', scheduledAt: { lte: today } },
    })
    for (const campaign of scheduled) {
      try {
        await sendCampaign(company.id, campaign.id, process.env.APP_ORIGIN || 'http://127.0.0.1:43123')
        campaigns += 1
      } catch (error) {
        if (!(error instanceof AppError)) throw error
      }
    }
    reminders += await remindCompany(company.id, today)
    recurring += (await runRecurring(company.id, today)).length
  }
  return { campaigns, reminders, recurring }
}

async function remindCompany(companyId: number, today: Date) {
  const levels = await prisma.followUpLevel.findMany({ where: { companyId }, orderBy: { sequence: 'asc' } })
  const invoices = await prisma.invoice.findMany({
    where: { companyId, state: 'posted', residual: { gt: 0.001 }, dueDate: { not: null } },
    include: { partner: true, followUps: true },
  })
  let sent = 0
  for (const invoice of invoices) {
    if (!invoice.dueDate || !isOverdue(invoice.dueDate, invoice.residual, today) || !invoice.partner.email) continue
    const late = Math.floor((today.getTime() - invoice.dueDate.getTime()) / 86_400_000)
    for (const level of levels) {
      if (late < level.daysOverdue) continue
      if (invoice.followUps.some((log) => log.levelId === level.id)) continue
      const text = `${invoice.name} is ${late} days past due. ${level.name}. Balance ${invoice.residual}.`
      const result = await sendMail({ to: invoice.partner.email, subject: `${level.name}: ${invoice.name}`, text })
      const channel = result.channel === 'log' ? 'simulate' : result.channel
      await prisma.followUpLog.create({ data: { companyId, invoiceId: invoice.id, levelId: level.id, channel } })
      await prisma.mailLog.create({
        data: { companyId, model: 'account.move', recordId: invoice.id, to: invoice.partner.email, subject: `${level.name}: ${invoice.name}`, body: text, channel },
      })
      sent += 1
    }
  }
  return sent
}

export function parseCsv(text: string) {
  const rows: string[][] = []
  let cell = ''
  let row: string[] = []
  let quoted = false
  const source = text.replace(/^\uFEFF/, '')
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"'
        index += 1
      } else if (char === '"') quoted = false
      else cell += char
      continue
    }
    if (char === '"') quoted = true
    else if (char === ',') {
      row.push(cell.trim())
      cell = ''
    } else if (char === '\n') {
      row.push(cell.trim())
      rows.push(row)
      row = []
      cell = ''
    } else if (char !== '\r') cell += char
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell.trim())
    rows.push(row)
  }
  return rows.filter((line) => line.some((value) => value.length > 0))
}

const importFields: Record<string, string[]> = {
  contacts: ['name', 'email', 'phone', 'city', 'customer', 'supplier'],
  products: ['name', 'sku', 'type', 'listPrice', 'costPrice'],
  'sales-orders': ['customer', 'product', 'quantity', 'unitPrice'],
  invoices: ['customer', 'description', 'quantity', 'unitPrice', 'taxRate'],
  vendors: ['name', 'email', 'phone', 'city'],
  stock: ['sku', 'location', 'quantity'],
  employees: ['name', 'email', 'department'],
  accounts: ['code', 'name', 'type'],
}

export function importKinds() {
  return Object.keys(importFields)
}

export function previewImport(kind: string, text: string, mapping: Record<string, string>) {
  const fields = importFields[kind]
  if (!fields) throw new AppError(400, 'That import is not available.')
  const table = parseCsv(text)
  const header = table[0] ?? []
  const columns = header.map((name, index) => ({ index, header: name, field: mapping[name] || guessField(name, fields) }))
  const errors: Array<{ row: number; message: string }> = []
  const rows = table.slice(1).map((cells, index) => {
    const record: Record<string, string> = {}
    for (const column of columns) {
      if (!column.field) continue
      record[column.field] = cells[column.index] ?? ''
    }
    const message = validateRow(kind, record)
    if (message) errors.push({ row: index + 2, message })
    return record
  })
  return { columns, rows, errors, fields }
}

function guessField(header: string, fields: string[]) {
  const key = header.toLowerCase().replace(/[\s_-]+/g, '')
  return fields.find((field) => field.toLowerCase() === key) ?? ''
}

const accountTypes = ['asset', 'liability', 'equity', 'income', 'expense']

function validateRow(kind: string, row: Record<string, string>) {
  switch (kind) {
    case 'contacts':
    case 'vendors':
      return row.name ? '' : 'Name is required.'
    case 'products':
      if (!row.name || !row.sku) return 'Name and SKU are required.'
      if (row.listPrice && Number.isNaN(Number(row.listPrice))) return 'List price must be a number.'
      return ''
    case 'sales-orders':
      if (!row.customer || !row.product) return 'Customer and product are required.'
      if (!Number(row.quantity)) return 'Quantity must be greater than zero.'
      return ''
    case 'invoices':
      if (!row.customer || !row.description) return 'Customer and description are required.'
      return ''
    case 'stock':
      if (!row.sku) return 'SKU is required.'
      if (Number.isNaN(Number(row.quantity))) return 'Quantity must be a number.'
      return ''
    case 'employees':
      return row.name ? '' : 'Name is required.'
    case 'accounts':
      if (!row.code || !row.name) return 'Code and name are required.'
      if (row.type && !accountTypes.includes(row.type)) return 'Type must be asset, liability, equity, income, or expense.'
      return ''
    default:
      return 'That import is not available.'
  }
}

export async function commitImport(companyId: number, kind: string, rows: Array<Record<string, string>>) {
  const preview = { errors: rows.map((row, index) => ({ row: index + 2, message: validateRow(kind, row) })).filter((row) => row.message) }
  if (preview.errors.length > 0) throw new AppError(400, 'Fix the rows before importing.', { errors: preview.errors })
  let saved = 0
  for (const row of rows) {
    await writeRow(companyId, kind, row)
    saved += 1
  }
  return { saved }
}

async function writeRow(companyId: number, kind: string, row: Record<string, string>) {
  switch (kind) {
    case 'contacts':
      await prisma.contact.create({
        data: {
          companyId,
          name: row.name ?? '',
          email: row.email || null,
          phone: row.phone || null,
          city: row.city || null,
          isCustomer: truthy(row.customer),
          isSupplier: truthy(row.supplier),
        },
      })
      return
    case 'vendors':
      await prisma.contact.create({
        data: { companyId, name: row.name ?? '', email: row.email || null, phone: row.phone || null, city: row.city || null, isSupplier: true },
      })
      return
    case 'products':
      await prisma.product.create({
        data: {
          companyId,
          name: row.name ?? '',
          sku: row.sku ?? '',
          type: row.type === 'service' ? 'service' : 'product',
          listPrice: Number(row.listPrice) || 0,
          costPrice: Number(row.costPrice) || 0,
        },
      })
      return
    case 'sales-orders': {
      const customer = await prisma.contact.findFirst({ where: { companyId, name: row.customer, isCustomer: true } })
      const product = await prisma.product.findFirst({ where: { companyId, OR: [{ sku: row.product }, { name: row.product }] } })
      if (!customer || !product) throw new AppError(400, `Could not match ${row.customer} / ${row.product}.`)
      const quantity = Number(row.quantity)
      const unitPrice = Number(row.unitPrice) || product.listPrice
      const subtotal = roundMoney(quantity * unitPrice)
      await prisma.salesOrder.create({
        data: {
          companyId,
          customerId: customer.id,
          name: `IMP${randomBytes(4).toString('hex')}`,
          state: 'draft',
          dateOrder: new Date(),
          amountUntaxed: subtotal,
          amountTax: 0,
          amountTotal: subtotal,
          lines: { create: [{ productId: product.id, description: product.name, quantity, unitPrice, discount: 0, subtotal, taxAmount: 0 }] },
        },
      })
      return
    }
    case 'invoices': {
      const customer = await prisma.contact.findFirst({ where: { companyId, name: row.customer, isCustomer: true } })
      if (!customer) throw new AppError(400, `Could not match customer ${row.customer}.`)
      const quantity = Number(row.quantity) || 1
      const unitPrice = Number(row.unitPrice) || 0
      const taxRate = Number(row.taxRate) || 0
      const subtotal = roundMoney(quantity * unitPrice)
      const taxAmount = roundMoney(subtotal * (taxRate / 100))
      await prisma.$transaction(async (tx) => {
        await tx.invoice.create({
          data: {
            companyId,
            partnerId: customer.id,
            name: await nextName(tx, `account.out.${companyId}`, 'INV'),
            moveType: 'out_invoice',
            state: 'draft',
            invoiceDate: new Date(),
            amountUntaxed: subtotal,
            amountTax: taxAmount,
            amountTotal: roundMoney(subtotal + taxAmount),
            residual: roundMoney(subtotal + taxAmount),
            lines: { create: [{ description: row.description ?? '', quantity, unitPrice, taxRate, subtotal, taxAmount }] },
          },
        })
      }, transactionOptions)
      return
    }
    case 'stock': {
      const product = await prisma.product.findFirst({ where: { companyId, sku: row.sku } })
      const location = await prisma.stockLocation.findFirst({
        where: { companyId, name: row.location || undefined, type: 'internal' },
        orderBy: { id: 'asc' },
      })
      if (!product || !location) throw new AppError(400, `Could not match ${row.sku}.`)
      await prisma.stockQuant.upsert({
        where: { productId_locationId: { productId: product.id, locationId: location.id } },
        update: { quantity: Number(row.quantity) || 0 },
        create: { productId: product.id, locationId: location.id, quantity: Number(row.quantity) || 0 },
      })
      return
    }
    case 'employees': {
      let department = row.department
        ? await prisma.department.findFirst({ where: { companyId, name: row.department } })
        : null
      if (row.department && !department) department = await prisma.department.create({ data: { companyId, name: row.department } })
      await prisma.employee.create({
        data: {
          companyId,
          name: row.name ?? '',
          email: row.email || null,
          ...(department ? { departmentId: department.id } : {}),
        },
      })
      return
    }
    case 'accounts':
      await prisma.account.create({ data: { companyId, code: row.code ?? '', name: row.name ?? '', type: row.type || 'asset' } })
      return
    default:
      throw new AppError(400, 'That import is not available.')
  }
}

function truthy(value: string | undefined) {
  return value === '1' || value?.toLowerCase() === 'yes' || value?.toLowerCase() === 'true'
}

export async function exportTable(companyId: number, kind: string) {
  switch (kind) {
    case 'contacts': {
      const rows = await prisma.contact.findMany({ where: { companyId, isCustomer: true }, orderBy: { name: 'asc' } })
      return [['name', 'email', 'phone', 'city'], ...rows.map((row) => [row.name, row.email ?? '', row.phone ?? '', row.city ?? ''])]
    }
    case 'vendors': {
      const rows = await prisma.contact.findMany({ where: { companyId, isSupplier: true }, orderBy: { name: 'asc' } })
      return [['name', 'email', 'phone', 'city'], ...rows.map((row) => [row.name, row.email ?? '', row.phone ?? '', row.city ?? ''])]
    }
    case 'products': {
      const rows = await prisma.product.findMany({ where: { companyId }, orderBy: { sku: 'asc' } })
      return [['name', 'sku', 'type', 'listPrice', 'costPrice'], ...rows.map((row) => [row.name, row.sku, row.type, String(row.listPrice), String(row.costPrice)])]
    }
    case 'purchase-orders': {
      const rows = await prisma.purchaseOrder.findMany({ where: { companyId }, include: { vendor: true, lines: true }, orderBy: { id: 'desc' }, take: 200 })
      const lines = rows.flatMap((order) => order.lines.map((line) => [order.name, order.vendor.name, line.description, String(line.quantity), String(line.unitCost)]))
      return [['order', 'vendor', 'product', 'quantity', 'unitCost'], ...lines]
    }
    case 'sales-orders': {
      const rows = await prisma.salesOrder.findMany({ where: { companyId }, include: { customer: true, lines: true }, orderBy: { id: 'desc' }, take: 200 })
      const lines = rows.flatMap((order) => order.lines.map((line) => [order.name, order.customer.name, line.description, String(line.quantity), String(line.unitPrice)]))
      return [['order', 'customer', 'product', 'quantity', 'unitPrice'], ...lines]
    }
    case 'invoices': {
      const rows = await prisma.invoice.findMany({ where: { companyId }, include: { partner: true, lines: true }, orderBy: { id: 'desc' }, take: 200 })
      const lines = rows.flatMap((invoice) => invoice.lines.map((line) => [invoice.name, invoice.partner.name, line.description, String(line.quantity), String(line.unitPrice), String(line.taxRate)]))
      return [['invoice', 'customer', 'description', 'quantity', 'unitPrice', 'taxRate'], ...lines]
    }
    case 'stock': {
      const rows = await prisma.stockQuant.findMany({ where: { product: { companyId } }, include: { product: true, location: true }, take: 500 })
      return [['sku', 'location', 'quantity'], ...rows.map((row) => [row.product.sku, row.location.name, String(row.quantity)])]
    }
    case 'employees': {
      const rows = await prisma.employee.findMany({ where: { companyId }, include: { department: true }, orderBy: { name: 'asc' } })
      return [['name', 'email', 'department'], ...rows.map((row) => [row.name, row.email ?? '', row.department?.name ?? ''])]
    }
    case 'accounts': {
      const rows = await prisma.account.findMany({ where: { companyId }, orderBy: { code: 'asc' } })
      return [['code', 'name', 'type'], ...rows.map((row) => [row.code, row.name, row.type])]
    }
    default:
      throw new AppError(400, 'That export is not available.')
  }
}

export async function exportFile(companyId: number, kind: string, format: 'csv' | 'xlsx') {
  const table = await exportTable(companyId, kind)
  switch (format) {
    case 'csv':
      return { body: Buffer.from(sheet(table[0] ?? [], table.slice(1))), mime: 'text/csv; charset=utf-8', filename: `${kind}.csv` }
    case 'xlsx':
      return { body: rowsToXlsx(table), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${kind}.xlsx` }
    default: {
      const unexpected: never = format
      throw new AppError(400, unexpected)
    }
  }
}

export function tableFromUpload(name: string, bytes: Buffer) {
  const lower = name.toLowerCase()
  if (lower.endsWith('.xlsx')) return xlsxToRows(bytes)
  return parseCsv(bytes.toString('utf8'))
}

function sheet(header: string[], rows: string[][]) {
  const escape = (value: string) => /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
  return [header, ...rows].map((line) => line.map(escape).join(',')).join('\n')
}

export async function listRecurring(companyId: number) {
  return prisma.recurringInvoice.findMany({
    where: { companyId },
    include: { partner: { select: { id: true, name: true } } },
    orderBy: { name: 'asc' },
  })
}

export async function commercialOptions(companyId: number) {
  const [lists, terms, positions] = await Promise.all([
    prisma.priceList.findMany({ where: { companyId }, select: { id: true, name: true, side: true }, orderBy: { name: 'asc' } }),
    listTerms(companyId),
    prisma.fiscalPosition.findMany({ where: { companyId }, orderBy: { name: 'asc' } }),
  ])
  return { lists, terms, positions }
}

export async function assignCommercial(
  companyId: number,
  contactId: number,
  input: { salePriceListId: number | null; purchasePriceListId: number | null; paymentTermId: number | null; fiscalPositionId: number | null },
) {
  const contact = await prisma.contact.findFirst({ where: { id: contactId, companyId } })
  if (!contact) throw new AppError(404, 'Contact not found.')
  if (input.salePriceListId) await assertList(companyId, input.salePriceListId, 'sales')
  if (input.purchasePriceListId) await assertList(companyId, input.purchasePriceListId, 'purchase')
  if (input.paymentTermId) {
    const term = await prisma.paymentTerm.findFirst({ where: { id: input.paymentTermId, companyId } })
    if (!term) throw new AppError(400, 'Choose a payment term from this company.')
  }
  if (input.fiscalPositionId) {
    const position = await prisma.fiscalPosition.findFirst({ where: { id: input.fiscalPositionId, companyId } })
    if (!position) throw new AppError(400, 'Choose a fiscal position from this company.')
  }
  return prisma.contact.update({
    where: { id: contact.id },
    data: input,
    select: { id: true, salePriceListId: true, purchasePriceListId: true, paymentTermId: true, fiscalPositionId: true },
  })
}

async function assertList(companyId: number, id: number, side: string) {
  const list = await prisma.priceList.findFirst({ where: { id, companyId, side } })
  if (!list) throw new AppError(400, 'Choose a price list from this company.')
}

export async function listPriceLists(companyId: number, side: string | null) {
  return prisma.priceList.findMany({
    where: { companyId, ...(side ? { side } : {}) },
    include: {
      items: {
        orderBy: [{ productId: 'asc' }, { minQty: 'asc' }],
        include: { product: { select: { id: true, name: true, sku: true } } },
      },
    },
    orderBy: { name: 'asc' },
  })
}

function priceSide(value: unknown) {
  if (value === 'sales' || value === 'purchase') return value
  throw new AppError(400, 'Choose sales or purchase.')
}

function priceNumbers(minQty: unknown, price: unknown) {
  const qty = Number(minQty)
  const amount = Number(price)
  if (!Number.isFinite(qty) || qty < 0) throw new AppError(400, 'Minimum quantity cannot be negative.')
  if (!Number.isFinite(amount) || amount < 0) throw new AppError(400, 'Price cannot be negative.')
  return { minQty: qty, price: amount }
}

export async function createPriceList(companyId: number, name: unknown, side: unknown) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new AppError(400, 'Name the price list.')
  return prisma.priceList.create({ data: { companyId, name: trimmed, side: priceSide(side) } })
}

async function ownedList(companyId: number, listId: number) {
  const list = await prisma.priceList.findFirst({ where: { id: listId, companyId } })
  if (!list) throw new AppError(404, 'Price list not found.')
  return list
}

export async function addPriceItem(companyId: number, listId: number, productId: unknown, minQty: unknown, price: unknown) {
  const list = await ownedList(companyId, listId)
  const id = Number(productId)
  const product = await prisma.product.findFirst({ where: { id, companyId } })
  if (!product) throw new AppError(400, 'Choose a product from this company.')
  const numbers = priceNumbers(minQty, price)
  return prisma.priceListItem.create({
    data: { priceListId: list.id, productId: product.id, minQty: numbers.minQty, price: numbers.price },
    include: { product: { select: { id: true, name: true, sku: true } } },
  })
}

export async function updatePriceItem(companyId: number, listId: number, itemId: number, minQty: unknown, price: unknown) {
  const item = await prisma.priceListItem.findFirst({ where: { id: itemId, priceList: { id: listId, companyId } } })
  if (!item) throw new AppError(404, 'Price line not found.')
  const numbers = priceNumbers(minQty, price)
  return prisma.priceListItem.update({
    where: { id: item.id },
    data: numbers,
    include: { product: { select: { id: true, name: true, sku: true } } },
  })
}

export async function removePriceItem(companyId: number, listId: number, itemId: number) {
  const item = await prisma.priceListItem.findFirst({ where: { id: itemId, priceList: { id: listId, companyId } } })
  if (!item) throw new AppError(404, 'Price line not found.')
  await prisma.priceListItem.delete({ where: { id: item.id } })
}

function termLines(lines: unknown) {
  if (!Array.isArray(lines) || lines.length === 0) throw new AppError(400, 'Add at least one line.')
  const cleaned = lines.map((line, index) => {
    const row = line as { percent?: unknown; days?: unknown }
    const percent = Math.round(Number(row.percent) * 100) / 100
    const days = Number(row.days)
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) throw new AppError(400, 'Each line is a percent from 1 to 100.')
    if (!Number.isInteger(days) || days < 0) throw new AppError(400, 'Days cannot be negative.')
    return { sequence: index + 1, percent, days }
  })
  const total = Math.round(cleaned.reduce((sum, line) => sum + line.percent, 0) * 100) / 100
  if (total !== 100) throw new AppError(400, 'Payment term lines must add up to 100%.')
  return cleaned
}

export async function savePaymentTerm(companyId: number, name: unknown, lines: unknown, termId?: number) {
  const trimmed = String(name ?? '').trim()
  if (!trimmed) throw new AppError(400, 'Name the payment term.')
  const cleaned = termLines(lines)
  if (termId) {
    const existing = await prisma.paymentTerm.findFirst({ where: { id: termId, companyId } })
    if (!existing) throw new AppError(404, 'Payment term not found.')
    return prisma.$transaction(async (tx) => {
      await tx.paymentTermLine.deleteMany({ where: { termId: existing.id } })
      return tx.paymentTerm.update({
        where: { id: existing.id },
        data: { name: trimmed, lines: { create: cleaned } },
        include: { lines: { orderBy: { sequence: 'asc' } } },
      })
    })
  }
  return prisma.paymentTerm.create({
    data: { companyId, name: trimmed, lines: { create: cleaned } },
    include: { lines: { orderBy: { sequence: 'asc' } } },
  })
}

export { scheduleInstalments }
