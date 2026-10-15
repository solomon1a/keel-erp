import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../server/auth.ts'

const prisma = new PrismaClient()

export const demoPasswords = {
  maya: 'keel-maya-desk',
  jonah: 'keel-jonah-desk',
} as const

export async function seedDatabase(client: PrismaClient = prisma) {
  const company = await client.company.create({
    data: { name: '江北良品', city: '上海', currency: 'CNY', defaultTaxRate: 13 },
  })

  const [mayaHash, jonahHash] = await Promise.all([
    hashPassword(demoPasswords.maya),
    hashPassword(demoPasswords.jonah),
  ])
  const maya = await client.user.create({
    data: {
      name: 'Maya Chen',
      email: 'maya@northline.example',
      role: 'admin',
      passwordHash: mayaHash,
      companyId: company.id,
    },
  })
  await client.user.create({
    data: {
      name: 'Jonah Ellis',
      email: 'jonah@northline.example',
      role: 'user',
      passwordHash: jonahHash,
      companyId: company.id,
    },
  })

  const countries = await Promise.all(
    [
      ['China', 'CN'],
      ['United States', 'US'],
      ['Canada', 'CA'],
      ['United Kingdom', 'GB'],
      ['Germany', 'DE'],
      ['Japan', 'JP'],
      ['Mexico', 'MX'],
    ].map(([name, code]) => client.country.create({ data: { name, code } })),
  )
  const china = countries[0]

  await client.tax.create({ data: { name: '增值税', rate: 13, isDefault: true } })

  await client.stockLocation.createMany({
    data: [
      { name: 'Main stock', type: 'internal', companyId: company.id },
      { name: 'Customers', type: 'customer', companyId: company.id },
      { name: 'Vendors', type: 'supplier', companyId: company.id },
      { name: 'Adjustments', type: 'inventory', companyId: company.id },
    ],
  })
  const internal = await client.stockLocation.findFirstOrThrow({
    where: { companyId: company.id, type: 'internal' },
  })
  const supplier = await client.stockLocation.findFirstOrThrow({
    where: { companyId: company.id, type: 'supplier' },
  })

  const cedar = await client.contact.create({
    data: {
      name: 'Cedar & Co',
      email: 'hello@cedar.example',
      phone: '503-555-0142',
      isCompany: true,
      isCustomer: true,
      street: '18 Morrison Street',
      city: 'Portland',
      state: 'OR',
      postalCode: '97204',
      countryId: china.id,
      companyId: company.id,
      notes: 'Buys field kits for their shop floor.',
      createdById: maya.id,
      updatedById: maya.id,
    },
  })
  await client.contact.create({
    data: {
      name: 'Avery Lang',
      email: 'avery@cedar.example',
      phone: '503-555-0177',
      isCompany: false,
      isCustomer: true,
      parentId: cedar.id,
      city: 'Portland',
      state: 'OR',
      countryId: china.id,
      companyId: company.id,
      createdById: maya.id,
      updatedById: maya.id,
    },
  })
  await client.contact.create({
    data: {
      name: 'Harbor Clinic',
      email: 'purchasing@harborclinic.example',
      phone: '503-555-0190',
      isCompany: true,
      isCustomer: true,
      street: '440 Naito Parkway',
      city: 'Portland',
      state: 'OR',
      postalCode: '97204',
      countryId: china.id,
      companyId: company.id,
      createdById: maya.id,
      updatedById: maya.id,
    },
  })
  await client.contact.create({
    data: {
      name: 'Milo Park',
      email: 'milo.park@example.com',
      phone: '971-555-0118',
      isCompany: false,
      isCustomer: true,
      city: 'Seattle',
      state: 'WA',
      countryId: china.id,
      companyId: company.id,
      notes: 'Orders one-off blankets for client gifts.',
      createdById: maya.id,
      updatedById: maya.id,
    },
  })
  await client.contact.create({
    data: {
      name: 'Brightmill Supply',
      email: 'orders@brightmill.example',
      phone: '206-555-0133',
      isCompany: true,
      isSupplier: true,
      city: 'Seattle',
      state: 'WA',
      countryId: china.id,
      companyId: company.id,
      createdById: maya.id,
      updatedById: maya.id,
    },
  })
  const suhang = await client.contact.create({
    data: {
      name: '苏杭织造',
      email: 'orders@suhang.example',
      phone: '0512-555-0188',
      isCompany: true,
      isSupplier: true,
      street: '吴中区纺织路 18 号',
      city: '苏州',
      countryId: china.id,
      companyId: company.id,
      notes: '帆布与坯布。',
      createdById: maya.id,
      updatedById: maya.id,
    },
  })
  await client.contact.create({
    data: {
      name: '青浦纱线',
      email: 'sales@qingpu-yarn.example',
      phone: '021-555-0166',
      isCompany: true,
      isSupplier: true,
      street: '青浦区盈港路 88 号',
      city: '上海',
      countryId: china.id,
      companyId: company.id,
      notes: '羊毛纱。',
      createdById: maya.id,
      updatedById: maya.id,
    },
  })
  await client.contact.create({
    data: {
      name: 'Lena Ortiz',
      email: 'lena@northline.example',
      isCompany: false,
      isEmployee: true,
      city: 'Portland',
      state: 'OR',
      countryId: china.id,
      companyId: company.id,
      createdById: maya.id,
      updatedById: maya.id,
    },
  })

  const notebook = await client.product.create({
    data: {
      name: 'Field notebook',
      sku: 'NB-01',
      type: 'product',
      kind: 'finished',
      listPrice: 18,
      costPrice: 6,
      purchasable: false,
      description: 'Lined, 160 pages, stitched binding.',
      companyId: company.id,
    },
  })
  const blanket = await client.product.create({
    data: {
      name: 'Wool blanket',
      sku: 'BL-04',
      type: 'product',
      kind: 'finished',
      listPrice: 86,
      costPrice: 42,
      purchasable: false,
      description: 'Charcoal throw, washed wool.',
      companyId: company.id,
    },
  })
  await client.product.create({
    data: {
      name: 'Route planning',
      sku: 'SV-02',
      type: 'service',
      kind: 'finished',
      listPrice: 140,
      costPrice: 0,
      purchasable: false,
      description: 'Half-day planning session for a delivery route.',
      companyId: company.id,
    },
  })
  const tote = await client.product.create({
    data: {
      name: 'Canvas tote',
      sku: 'TO-11',
      type: 'product',
      kind: 'finished',
      listPrice: 24,
      costPrice: 9,
      purchasable: true,
      description: 'Natural canvas, one interior pocket.',
      companyId: company.id,
    },
  })

  const opening = [
    { product: notebook, quantity: 40 },
    { product: blanket, quantity: 12 },
    { product: tote, quantity: 2 },
  ]
  for (const row of opening) {
    await client.stockQuant.create({
      data: { productId: row.product.id, locationId: internal.id, quantity: row.quantity },
    })
    await client.stockMove.create({
      data: {
        productId: row.product.id,
        locationFromId: supplier.id,
        locationToId: internal.id,
        quantity: row.quantity,
        state: 'done',
        reference: 'Opening stock',
        date: new Date('2026-03-02T15:00:00.000Z'),
      },
    })
  }

  const canvas = await client.product.create({
    data: {
      name: '本色帆布',
      sku: 'RM-CV',
      type: 'product',
      kind: 'raw',
      listPrice: 0,
      costPrice: 12,
      purchasable: true,
      description: '坯布，供以后裁成包袋。',
      companyId: company.id,
    },
  })
  const yarn = await client.product.create({
    data: {
      name: '羊毛纱',
      sku: 'RM-YN',
      type: 'product',
      kind: 'raw',
      listPrice: 0,
      costPrice: 40,
      purchasable: true,
      description: '毛毯用纱。',
      companyId: company.id,
    },
  })

  const tax = await client.tax.findFirstOrThrow()
  await client.sequence.create({ data: { name: 'sales.order', next: 1 } })
  await client.sequence.create({ data: { name: 'purchase.order', next: 1 } })
  await client.salesOrder.create({
    data: {
      name: 'SO0001',
      state: 'draft',
      customerId: cedar.id,
      companyId: company.id,
      dateOrder: new Date('2026-04-08T16:30:00.000Z'),
      validityDate: new Date('2026-05-08T00:00:00.000Z'),
      amountUntaxed: 190,
      amountTax: 24.7,
      amountTotal: 214.7,
      createdById: maya.id,
      lines: {
        create: [
          {
            productId: blanket.id,
            description: blanket.name,
            quantity: 2,
            unitPrice: 86,
            discount: 0,
            taxId: tax.id,
            subtotal: 172,
            taxAmount: 22.36,
          },
          {
            productId: notebook.id,
            description: notebook.name,
            quantity: 1,
            unitPrice: 18,
            discount: 0,
            taxId: tax.id,
            subtotal: 18,
            taxAmount: 2.34,
          },
        ],
      },
    },
  })

  await client.purchaseOrder.create({
    data: {
      name: 'PO0001',
      state: 'draft',
      vendorId: suhang.id,
      companyId: company.id,
      dateOrder: new Date('2026-04-10T09:00:00.000Z'),
      amountUntaxed: 2000,
      amountTax: 260,
      amountTotal: 2260,
      createdById: maya.id,
      lines: {
        create: [
          {
            productId: canvas.id,
            description: canvas.name,
            quantity: 100,
            unitCost: 12,
            taxId: tax.id,
            subtotal: 1200,
            taxAmount: 156,
          },
          {
            productId: yarn.id,
            description: yarn.name,
            quantity: 20,
            unitCost: 40,
            taxId: tax.id,
            subtotal: 800,
            taxAmount: 104,
          },
        ],
      },
    },
  })
}

if (process.argv[1]?.endsWith('seed.ts')) {
  await seedDatabase()
  await prisma.$disconnect()
}
