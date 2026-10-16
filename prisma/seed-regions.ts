import type { PrismaClient } from '@prisma/client'
import { roundMoney } from '../src/domain/money.ts'
import { hashPassword } from '../server/auth.ts'

type Region = {
  companyName: string
  city: string
  currency: string
  taxRate: number
  taxName: string
  taxId: string
  address: string
  adminName: string
  adminEmail: string
  adminPassword: string
  shopName: string
  shopEmail: string
  shopPassword: string
  shopPhone: string
  shopStreet: string
  countryCode: string
  warehouseName: string
  warehouseCode: string
  shelfName: string
  customerName: string
  customerEmail: string
  vendorName: string
  vendorEmail: string
  productName: string
  productSku: string
  productPrice: number
  barcode: string
  categoryName: string
  leadName: string
  leadContact: string
  leadEmail: string
  leadRevenue: number
  leadStage: string
  activity: string
  departmentName: string
  employeeName: string
  employeeJob: string
  otherDepartment: string
  otherEmployee: string
  otherJob: string
  publicToken: string
}

const harbour: Region = {
  companyName: 'Harbour & Line',
  city: 'London',
  currency: 'GBP',
  taxRate: 20,
  taxName: 'VAT',
  taxId: 'GB123456789',
  address: '14 Rivington Street, London EC2A 3DU',
  adminName: 'Amira Shah',
  adminEmail: 'amira@harbourline.example',
  adminPassword: 'keel-amira-desk',
  shopName: 'Priya Nair',
  shopEmail: 'priya@harbourline.example',
  shopPassword: 'keel-priya-shop',
  shopPhone: '020 7946 0101',
  shopStreet: '8 Columbia Road',
  countryCode: 'GB',
  warehouseName: 'Shoreditch stores',
  warehouseCode: 'LDN',
  shelfName: 'Floor',
  customerName: 'Moss & Grey',
  customerEmail: 'hello@mossgrey.example',
  vendorName: 'Pennine Mill',
  vendorEmail: 'buying@pennine.example',
  productName: 'Wool throw',
  productSku: 'HT-01',
  productPrice: 48,
  barcode: '5012345678900',
  categoryName: 'Home',
  leadName: 'Spring market — wool throw',
  leadContact: 'Helen Crowe',
  leadEmail: 'helen@crowe.example',
  leadRevenue: 960,
  leadStage: 'qualified',
  activity: 'Send the show price list',
  departmentName: 'Studio',
  employeeName: 'Noah Blake',
  employeeJob: 'Buyer',
  otherDepartment: 'Floor',
  otherEmployee: 'Imani Cole',
  otherJob: 'Store lead',
  publicToken: 'uk-demo-throw',
}

const hudson: Region = {
  companyName: 'Hudson Yard Goods',
  city: 'New York',
  currency: 'USD',
  taxRate: 8.875,
  taxName: 'NY Sales Tax',
  taxId: '12-3456789',
  address: '450 West 33rd Street, New York, NY 10001',
  adminName: 'Jordan Hale',
  adminEmail: 'jordan@hudsonyard.example',
  adminPassword: 'keel-jordan-desk',
  shopName: 'Sam Ortiz',
  shopEmail: 'sam@hudsonyard.example',
  shopPassword: 'keel-sam-shop',
  shopPhone: '212-555-0148',
  shopStreet: '120 10th Avenue',
  countryCode: 'US',
  warehouseName: 'Hudson warehouse',
  warehouseCode: 'NY',
  shelfName: 'Aisle',
  customerName: 'Cedar & Lobby',
  customerEmail: 'orders@cedarlobby.example',
  vendorName: 'Hudson Canvas Co',
  vendorEmail: 'mill@hudsoncanvas.example',
  productName: 'Canvas tote',
  productSku: 'HY-11',
  productPrice: 28,
  barcode: '012345678905',
  categoryName: 'Bags',
  leadName: 'Lobby gift sets',
  leadContact: 'Dana Ruiz',
  leadEmail: 'dana@ruiz.example',
  leadRevenue: 1400,
  leadStage: 'proposition',
  activity: 'Confirm the lobby delivery date',
  departmentName: 'Sales',
  employeeName: 'Chris Adelman',
  employeeJob: 'Account lead',
  otherDepartment: 'Floor',
  otherEmployee: 'Riley Cho',
  otherJob: 'Receiver',
  publicToken: 'us-demo-tote',
}

async function ensureCountry(client: PrismaClient, code: string, name: string) {
  return client.country.upsert({
    where: { code },
    update: { name },
    create: { name, code },
  })
}

async function ensureTax(client: PrismaClient, name: string, rate: number) {
  const existing = await client.tax.findFirst({ where: { name } })
  if (existing) return existing
  return client.tax.create({ data: { name, rate, isDefault: false } })
}

async function seedRegion(client: PrismaClient, region: Region) {
  const existing = await client.company.findFirst({ where: { name: region.companyName } })
  if (existing) return

  const country = await ensureCountry(
    client,
    region.countryCode,
    region.countryCode === 'GB' ? 'United Kingdom' : 'United States',
  )
  const tax = await ensureTax(client, region.taxName, region.taxRate)
  const company = await client.company.create({
    data: {
      name: region.companyName,
      city: region.city,
      currency: region.currency,
      defaultTaxRate: region.taxRate,
      taxId: region.taxId,
      address: region.address,
    },
  })
  const admin = await client.user.create({
    data: {
      name: region.adminName,
      email: region.adminEmail,
      role: 'admin',
      passwordHash: await hashPassword(region.adminPassword),
      companyId: company.id,
    },
  })
  const warehouse = await client.warehouse.create({
    data: { name: region.warehouseName, code: region.warehouseCode, isDefault: true, companyId: company.id },
  })
  await client.company.update({ where: { id: company.id }, data: { onlineWarehouseId: warehouse.id } })
  await client.stockLocation.createMany({
    data: [
      { name: 'Customers', type: 'customer', companyId: company.id },
      { name: 'Vendors', type: 'supplier', companyId: company.id },
      { name: 'Adjustments', type: 'inventory', companyId: company.id },
    ],
  })
  const shelf = await client.stockLocation.create({
    data: { name: region.shelfName, type: 'internal', isDefault: true, warehouseId: warehouse.id, companyId: company.id },
  })
  const customers = await client.stockLocation.findFirstOrThrow({ where: { companyId: company.id, type: 'customer' } })
  const category = await client.productCategory.create({
    data: { name: region.categoryName, companyId: company.id },
  })
  const product = await client.product.create({
    data: {
      name: region.productName,
      sku: region.productSku,
      type: 'product',
      kind: 'finished',
      listPrice: region.productPrice,
      costPrice: roundMoney(region.productPrice * 0.4),
      purchasable: true,
      websitePublished: true,
      barcode: region.barcode,
      categoryId: category.id,
      companyId: company.id,
      description: `${region.productName} sold by ${region.companyName}.`,
    },
  })
  await client.stockQuant.create({
    data: { productId: product.id, locationId: shelf.id, quantity: 12 },
  })
  const trade = await client.contact.create({
    data: {
      name: region.customerName,
      email: region.customerEmail,
      isCompany: true,
      isCustomer: true,
      city: region.city,
      countryId: country.id,
      companyId: company.id,
      createdById: admin.id,
      updatedById: admin.id,
    },
  })
  await client.contact.create({
    data: {
      name: region.vendorName,
      email: region.vendorEmail,
      isCompany: true,
      isSupplier: true,
      city: region.city,
      countryId: country.id,
      companyId: company.id,
      createdById: admin.id,
      updatedById: admin.id,
    },
  })
  const shopContact = await client.contact.create({
    data: {
      name: region.shopName,
      email: region.shopEmail,
      phone: region.shopPhone,
      street: region.shopStreet,
      city: region.city,
      isCustomer: true,
      taxId: region.taxId,
      countryId: country.id,
      companyId: company.id,
      createdById: admin.id,
      updatedById: admin.id,
    },
  })
  await client.shopCustomer.create({
    data: {
      name: region.shopName,
      email: region.shopEmail,
      passwordHash: await hashPassword(region.shopPassword),
      phone: region.shopPhone,
      contactId: shopContact.id,
      companyId: company.id,
    },
  })
  const priced = roundMoney(region.productPrice)
  const taxAmount = roundMoney(priced * (region.taxRate / 100))
  const total = roundMoney(priced + taxAmount)
  await client.salesOrder.create({
    data: {
      name: 'SO0001',
      state: 'draft',
      customerId: trade.id,
      warehouseId: warehouse.id,
      companyId: company.id,
      dateOrder: new Date('2026-04-20T10:00:00.000Z'),
      amountUntaxed: priced,
      amountTax: taxAmount,
      amountTotal: total,
      createdById: admin.id,
      lines: {
        create: [{
          productId: product.id,
          description: product.name,
          quantity: 1,
          unitPrice: priced,
          discount: 0,
          taxId: tax.id,
          subtotal: priced,
          taxAmount,
        }],
      },
    },
  })
  const webSale = await client.salesOrder.create({
    data: {
      name: 'SO0002',
      state: 'done',
      origin: 'shop',
      paymentMethod: 'card',
      paymentState: 'recorded',
      publicToken: region.publicToken,
      customerId: shopContact.id,
      warehouseId: warehouse.id,
      companyId: company.id,
      dateOrder: new Date('2026-04-21T15:00:00.000Z'),
      amountUntaxed: priced,
      amountTax: taxAmount,
      amountTotal: total,
      lines: {
        create: [{
          productId: product.id,
          description: product.name,
          quantity: 1,
          unitPrice: priced,
          discount: 0,
          taxId: tax.id,
          subtotal: priced,
          taxAmount,
        }],
      },
    },
  })
  await client.stockQuant.update({
    where: { productId_locationId: { productId: product.id, locationId: shelf.id } },
    data: { quantity: 11 },
  })
  await client.stockMove.create({
    data: {
      productId: product.id,
      locationFromId: shelf.id,
      locationToId: customers.id,
      quantity: 1,
      state: 'done',
      reference: webSale.name,
      orderId: webSale.id,
      date: new Date('2026-04-21T15:00:00.000Z'),
    },
  })
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
  await client.account.createMany({
    data: books.map(([code, name, type]) => ({ code, name, type, companyId: company.id })),
  })
  const accountRows = await client.account.findMany({ where: { companyId: company.id } })
  const accountByCode = new Map(accountRows.map((row) => [row.code, row]))
  await client.journal.createMany({
    data: [
      { code: 'SAL', name: 'Sales', companyId: company.id },
      { code: 'PUR', name: 'Purchases', companyId: company.id },
      { code: 'BNK', name: 'Bank', companyId: company.id },
      { code: 'GEN', name: 'General', companyId: company.id },
    ],
  })
  const salesJournal = await client.journal.findFirstOrThrow({ where: { companyId: company.id, code: 'SAL' } })
  await client.sequence.createMany({
    data: [
      { name: `account.out.${company.id}`, next: 1 },
      { name: `account.in.${company.id}`, next: 0 },
      { name: `account.out_refund.${company.id}`, next: 0 },
      { name: `account.in_refund.${company.id}`, next: 0 },
      { name: `account.entry.${company.id}`, next: 1 },
    ],
  })
  const invoice = await client.invoice.create({
    data: {
      name: 'INV0001',
      moveType: 'out_invoice',
      state: 'posted',
      partnerId: shopContact.id,
      companyId: company.id,
      invoiceDate: new Date('2026-04-21T15:00:00.000Z'),
      salesOrderId: webSale.id,
      amountUntaxed: priced,
      amountTax: taxAmount,
      amountTotal: total,
      residual: total,
      buyerName: region.shopName,
      buyerTaxId: region.taxId,
      buyerAddress: region.address,
      lines: {
        create: [{
          description: product.name,
          quantity: 1,
          unitPrice: priced,
          taxRate: region.taxRate,
          subtotal: priced,
          taxAmount,
        }],
      },
    },
  })
  await client.journalEntry.create({
    data: {
      name: 'JE0001',
      journalId: salesJournal.id,
      invoiceId: invoice.id,
      date: new Date('2026-04-21T15:00:00.000Z'),
      companyId: company.id,
      lines: {
        create: [
          { accountId: accountByCode.get('1122')!.id, partnerId: shopContact.id, label: 'INV0001', debit: total, credit: 0 },
          { accountId: accountByCode.get('6001')!.id, partnerId: shopContact.id, label: 'INV0001', debit: 0, credit: priced },
          { accountId: accountByCode.get('222101')!.id, partnerId: shopContact.id, label: 'INV0001', debit: 0, credit: taxAmount },
        ],
      },
    },
  })
  await client.lead.create({
    data: {
      name: region.leadName,
      contactName: region.leadContact,
      email: region.leadEmail,
      expectedRevenue: region.leadRevenue,
      stage: region.leadStage,
      companyId: company.id,
      userId: admin.id,
      activities: { create: [{ kind: 'call', summary: region.activity, dueOn: new Date('2026-04-22T00:00:00.000Z') }] },
    },
  })
  const studio = await client.department.create({ data: { name: region.departmentName, companyId: company.id } })
  const floor = await client.department.create({ data: { name: region.otherDepartment, companyId: company.id } })
  await client.employee.create({
    data: {
      name: region.employeeName,
      jobTitle: region.employeeJob,
      departmentId: studio.id,
      companyId: company.id,
      attendances: { create: [{ workDate: new Date('2026-04-14T00:00:00.000Z'), status: 'present' }] },
      leaves: {
        create: [{
          kind: 'sick',
          dateFrom: new Date('2026-04-18T00:00:00.000Z'),
          dateTo: new Date('2026-04-18T00:00:00.000Z'),
          state: 'draft',
          reason: 'Unwell',
        }],
      },
    },
  })
  await client.employee.create({
    data: {
      name: region.otherEmployee,
      jobTitle: region.otherJob,
      departmentId: floor.id,
      companyId: company.id,
      leaves: {
        create: [{
          kind: 'annual',
          dateFrom: new Date('2026-05-01T00:00:00.000Z'),
          dateTo: new Date('2026-05-03T00:00:00.000Z'),
          state: 'approved',
          reason: 'Holiday',
        }],
      },
    },
  })
}

export async function seedRegionalCompanies(client: PrismaClient) {
  await seedRegion(client, harbour)
  await seedRegion(client, hudson)
}
