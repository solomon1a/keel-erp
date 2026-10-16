import { seedDeskForCompany } from '../../prisma/seed-desk.ts'
import { signupCountries } from '../../shared/schemas.ts'
import { hashPassword } from '../auth.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'

export type SignupCountry = (typeof signupCountries)[number]

export type CountryPreset = {
  currency: string
  taxRate: number
  taxName: string
  city: string
  locale: 'en' | 'zh'
}

const books = [
  ['1001', 'Cash', 'asset'],
  ['1002', 'Bank', 'asset'],
  ['1122', 'Accounts receivable', 'asset'],
  ['1405', 'Inventory', 'asset'],
  ['2202', 'Accounts payable', 'liability'],
  ['222101', 'Output tax', 'liability'],
  ['222102', 'Input tax', 'liability'],
  ['6001', 'Sales', 'income'],
  ['6401', 'Cost of sales', 'expense'],
] as const

const journals = [
  ['SAL', 'Sales'],
  ['PUR', 'Purchases'],
  ['BNK', 'Bank'],
  ['GEN', 'General'],
] as const

export function presetForCountry(country: SignupCountry): CountryPreset {
  switch (country) {
    case 'CN':
      return { currency: 'CNY', taxRate: 13, taxName: 'China VAT 13%', city: 'Shanghai', locale: 'zh' }
    case 'GB':
      return { currency: 'GBP', taxRate: 20, taxName: 'VAT', city: 'London', locale: 'en' }
    case 'US':
      return { currency: 'USD', taxRate: 8.875, taxName: 'NY Sales Tax', city: 'New York', locale: 'en' }
    case 'PK':
      return { currency: 'PKR', taxRate: 18, taxName: 'Sales tax 18%', city: 'Karachi', locale: 'en' }
    case 'OTHER':
      return { currency: 'EUR', taxRate: 0, taxName: 'No tax', city: '', locale: 'en' }
    default: {
      const unexpected: never = country
      throw new AppError(400, `Unknown country ${unexpected}.`)
    }
  }
}

async function ensureTax(tx: Tx, name: string, rate: number) {
  const existing = await tx.tax.findFirst({ where: { name } })
  if (existing) return existing
  return tx.tax.create({ data: { name, rate, isDefault: false } })
}

async function openBooks(tx: Tx, companyId: number) {
  await tx.account.createMany({
    data: books.map(([code, name, type]) => ({ code, name, type, companyId })),
  })
  await tx.journal.createMany({
    data: journals.map(([code, name]) => ({ code, name, companyId })),
  })
  await tx.sequence.createMany({
    data: [
      { name: `account.out.${companyId}`, next: 0 },
      { name: `account.in.${companyId}`, next: 0 },
      { name: `account.out_refund.${companyId}`, next: 0 },
      { name: `account.in_refund.${companyId}`, next: 0 },
      { name: `account.entry.${companyId}`, next: 0 },
    ],
    skipDuplicates: true,
  })
}

export async function provisionCompany(input: {
  companyName: string
  country: SignupCountry
  name: string
  email: string
  password: string
  loadSample: boolean
}) {
  const preset = presetForCountry(input.country)
  const passwordHash = await hashPassword(input.password)
  const taken = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
  if (taken) throw new AppError(409, 'That email is already used.')

  return prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        name: input.companyName,
        city: preset.city,
        currency: preset.currency,
        defaultTaxRate: preset.taxRate,
        countryCode: input.country,
      },
    })
    const admin = await tx.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: 'admin',
        passwordHash,
        companyId: company.id,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        companyId: true,
        company: { select: { id: true, name: true, city: true, currency: true, defaultTaxRate: true, countryCode: true } },
      },
    })
    const warehouse = await tx.warehouse.create({
      data: { name: 'Main warehouse', code: 'MAIN', isDefault: true, companyId: company.id },
    })
    await tx.company.update({ where: { id: company.id }, data: { onlineWarehouseId: warehouse.id } })
    await tx.stockLocation.createMany({
      data: [
        { name: 'Customers', type: 'customer', companyId: company.id },
        { name: 'Vendors', type: 'supplier', companyId: company.id },
        { name: 'Adjustments', type: 'inventory', companyId: company.id },
      ],
    })
    await tx.stockLocation.create({
      data: { name: 'Stock', type: 'internal', isDefault: true, warehouseId: warehouse.id, companyId: company.id },
    })
    await openBooks(tx, company.id)
    if (input.loadSample) await loadSample(tx, company.id, admin.id, preset)
    await seedDeskForCompany(tx, company.id)
    return { user: admin, locale: preset.locale }
  }, { maxWait: 20000, timeout: 120000 })
}

async function loadSample(tx: Tx, companyId: number, userId: number, preset: CountryPreset) {
  const tax = await ensureTax(tx, preset.taxName, preset.taxRate)
  const shelf = await tx.stockLocation.findFirstOrThrow({
    where: { companyId, type: 'internal', isDefault: true },
  })
  const product = await tx.product.create({
    data: {
      name: 'Sample notebook',
      sku: 'SAMPLE-NB',
      type: 'product',
      kind: 'finished',
      listPrice: 18,
      costPrice: 6,
      purchasable: true,
      companyId,
      description: 'A starter product so the sales list is not empty.',
    },
  })
  await tx.stockQuant.create({ data: { productId: product.id, locationId: shelf.id, quantity: 24 } })
  const customer = await tx.contact.create({
    data: {
      name: 'Sample Customer',
      email: 'customer@sample.invalid',
      isCompany: true,
      isCustomer: true,
      city: preset.city || null,
      companyId,
      createdById: userId,
      updatedById: userId,
    },
  })
  await tx.contact.create({
    data: {
      name: 'Sample Vendor',
      email: 'vendor@sample.invalid',
      isCompany: true,
      isSupplier: true,
      city: preset.city || null,
      companyId,
      createdById: userId,
      updatedById: userId,
    },
  })
  const taxAmount = Math.round((18 * (preset.taxRate / 100) + Number.EPSILON) * 100) / 100
  const total = Math.round((18 + taxAmount + Number.EPSILON) * 100) / 100
  await tx.salesOrder.create({
    data: {
      name: 'QT0001',
      state: 'draft',
      customerId: customer.id,
      warehouseId: shelf.warehouseId,
      companyId,
      dateOrder: new Date(),
      amountUntaxed: 18,
      amountTax: taxAmount,
      amountTotal: total,
      createdById: userId,
      lines: {
        create: [{
          productId: product.id,
          description: product.name,
          quantity: 1,
          unitPrice: 18,
          discount: 0,
          taxId: tax.id,
          subtotal: 18,
          taxAmount,
        }],
      },
    },
  })
  await tx.lead.create({
    data: {
      name: 'First conversation',
      contactName: 'Sample Customer',
      email: 'customer@sample.invalid',
      expectedRevenue: 180,
      stage: 'new',
      companyId,
      userId,
    },
  })
}
