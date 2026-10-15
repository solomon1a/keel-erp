import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../server/auth.ts'

const prisma = new PrismaClient()

export const demoPasswords = {
  maya: 'keel-maya-desk',
  jonah: 'keel-jonah-desk',
  lin: 'keel-lin-shop',
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

  const shanghai = await client.warehouse.create({
    data: { name: '上海仓', code: 'SH', isDefault: true, companyId: company.id },
  })
  await client.company.update({
    where: { id: company.id },
    data: { onlineWarehouseId: shanghai.id, taxId: '91310000KEEL00001X', address: '上海市江北路 88 号' },
  })
  const shenzhen = await client.warehouse.create({
    data: { name: '深圳门店', code: 'SZ', isDefault: false, companyId: company.id },
  })
  await client.stockLocation.createMany({
    data: [
      { name: 'Customers', type: 'customer', companyId: company.id },
      { name: 'Vendors', type: 'supplier', companyId: company.id },
      { name: 'Adjustments', type: 'inventory', companyId: company.id },
      { name: 'Production', type: 'production', companyId: company.id },
    ],
  })
  const internal = await client.stockLocation.create({
    data: { name: '主库', type: 'internal', isDefault: true, warehouseId: shanghai.id, companyId: company.id },
  })
  await client.stockLocation.create({
    data: { name: '成品区', type: 'internal', isDefault: false, warehouseId: shanghai.id, companyId: company.id },
  })
  const shop = await client.stockLocation.create({
    data: { name: '店面', type: 'internal', isDefault: true, warehouseId: shenzhen.id, companyId: company.id },
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

  const stationery = await client.productCategory.create({
    data: { name: '文具', companyId: company.id },
  })
  const home = await client.productCategory.create({
    data: { name: '家居', companyId: company.id },
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
      barcode: '6901000000018',
      websitePublished: true,
      categoryId: stationery.id,
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
      barcode: '6901000000025',
      websitePublished: true,
      categoryId: home.id,
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
      barcode: '6901000000032',
      websitePublished: true,
      categoryId: home.id,
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
      tracking: 'lot',
      companyId: company.id,
    },
  })

  const tax = await client.tax.findFirstOrThrow()
  await client.sequence.create({ data: { name: 'sales.order', next: 2 } })
  await client.sequence.create({ data: { name: 'purchase.order', next: 1 } })
  await client.sequence.create({ data: { name: 'manufacturing.order', next: 1 } })
  await client.sequence.create({ data: { name: 'stock.transfer', next: 1 } })
  await client.sequence.create({ data: { name: 'pos.session', next: 1 } })
  await client.sequence.create({ data: { name: 'pos.order', next: 1 } })
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
      warehouseId: shanghai.id,
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
      warehouseId: shanghai.id,
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

  const toteBom = await client.billOfMaterials.create({
    data: {
      productId: tote.id,
      companyId: company.id,
      yieldQty: 1,
      notes: '一只帆布包：包身用本色帆布，提手用羊毛纱。',
      lines: {
        create: [
          { productId: canvas.id, quantity: 1.5 },
          { productId: yarn.id, quantity: 0.15 },
        ],
      },
    },
  })

  await client.manufacturingOrder.create({
    data: {
      name: 'MO0001',
      state: 'draft',
      productId: tote.id,
      bomId: toteBom.id,
      companyId: company.id,
      quantity: 4,
      sourceWarehouseId: shanghai.id,
      destWarehouseId: shanghai.id,
      createdById: maya.id,
      lines: {
        create: [
          { productId: canvas.id, quantity: 6 },
          { productId: yarn.id, quantity: 0.6 },
        ],
      },
    },
  })

  await client.reorderRule.create({
    data: {
      productId: tote.id,
      warehouseId: shanghai.id,
      companyId: company.id,
      minQty: 5,
      maxQty: 12,
    },
  })

  await client.stockTransfer.create({
    data: {
      name: 'INT0001',
      state: 'draft',
      companyId: company.id,
      locationFromId: internal.id,
      locationToId: shop.id,
      createdById: maya.id,
      lines: {
        create: [{ productId: notebook.id, quantity: 2 }],
      },
    },
  })

  const customers = await client.stockLocation.findFirstOrThrow({
    where: { companyId: company.id, type: 'customer' },
  })
  const shopStock = [
    { product: notebook, quantity: 8 },
    { product: blanket, quantity: 4 },
    { product: tote, quantity: 3 },
  ]
  for (const row of shopStock) {
    await client.stockQuant.create({
      data: { productId: row.product.id, locationId: shop.id, quantity: row.quantity },
    })
    await client.stockMove.create({
      data: {
        productId: row.product.id,
        locationFromId: supplier.id,
        locationToId: shop.id,
        quantity: row.quantity,
        state: 'done',
        reference: 'Shop opening',
        date: new Date('2026-04-01T02:00:00.000Z'),
      },
    })
  }

  const register = await client.posSession.create({
    data: {
      name: 'SES0001',
      state: 'open',
      warehouseId: shenzhen.id,
      companyId: company.id,
      openingCash: 200,
      openedById: maya.id,
      openedAt: new Date(Date.now() - 60 * 60 * 1000),
    },
  })
  const soldAt = new Date()
  const sale = await client.posOrder.create({
    data: {
      name: 'POS0001',
      state: 'paid',
      sessionId: register.id,
      companyId: company.id,
      warehouseId: shenzhen.id,
      customerId: null,
      amountUntaxed: 18,
      amountTax: 2.34,
      amountTotal: 20.34,
      createdById: maya.id,
      createdAt: soldAt,
      lines: {
        create: [{
          productId: notebook.id,
          description: notebook.name,
          quantity: 1,
          unitPrice: 18,
          discount: 0,
          taxRate: 13,
          subtotal: 18,
          taxAmount: 2.34,
        }],
      },
      payments: {
        create: [{ method: 'cash', direction: 'payment', amount: 20.34, tendered: 50, change: 29.66 }],
      },
    },
  })
  await client.stockQuant.update({
    where: { productId_locationId: { productId: notebook.id, locationId: shop.id } },
    data: { quantity: 7 },
  })
  await client.stockMove.create({
    data: {
      productId: notebook.id,
      locationFromId: shop.id,
      locationToId: customers.id,
      quantity: 1,
      state: 'done',
      reference: sale.name,
      posOrderId: sale.id,
      date: soldAt,
    },
  })

  const lin = await client.contact.create({
    data: {
      name: '林晓',
      email: 'lin@northline.example',
      phone: '13800001111',
      isCompany: false,
      isCustomer: true,
      street: '江北路 18 号',
      city: '上海',
      taxId: '91310000LINX000018',
      countryId: china.id,
      companyId: company.id,
      createdById: maya.id,
      updatedById: maya.id,
    },
  })
  await client.shopCustomer.create({
    data: {
      name: '林晓',
      email: 'lin@northline.example',
      passwordHash: await hashPassword(demoPasswords.lin),
      phone: '13800001111',
      contactId: lin.id,
      companyId: company.id,
    },
  })
  const webSale = await client.salesOrder.create({
    data: {
      name: 'SO0002',
      state: 'done',
      origin: 'shop',
      paymentMethod: 'wechat',
      paymentState: 'recorded',
      publicToken: 'shop-demo-blanket',
      customerId: lin.id,
      warehouseId: shanghai.id,
      companyId: company.id,
      dateOrder: new Date('2026-04-12T08:00:00.000Z'),
      amountUntaxed: 86,
      amountTax: 11.18,
      amountTotal: 97.18,
      lines: {
        create: [{
          productId: blanket.id,
          description: blanket.name,
          quantity: 1,
          unitPrice: 86,
          discount: 0,
          taxId: tax.id,
          subtotal: 86,
          taxAmount: 11.18,
        }],
      },
    },
  })
  await client.stockQuant.update({
    where: { productId_locationId: { productId: blanket.id, locationId: internal.id } },
    data: { quantity: 11 },
  })
  await client.stockMove.create({
    data: {
      productId: blanket.id,
      locationFromId: internal.id,
      locationToId: customers.id,
      quantity: 1,
      state: 'done',
      reference: webSale.name,
      orderId: webSale.id,
      date: new Date('2026-04-12T08:00:00.000Z'),
    },
  })

  const books = [
    ['1001', '库存现金', 'asset'],
    ['1002', '银行存款', 'asset'],
    ['1122', '应收账款', 'asset'],
    ['1405', '库存商品', 'asset'],
    ['2202', '应付账款', 'liability'],
    ['222101', '应交税费-销项税额', 'liability'],
    ['222102', '应交税费-进项税额', 'liability'],
    ['6001', '主营业务收入', 'income'],
    ['6401', '主营业务成本', 'expense'],
  ] as const
  await client.account.createMany({
    data: books.map(([code, name, type]) => ({ code, name, type, companyId: company.id })),
  })
  const accountRows = await client.account.findMany({ where: { companyId: company.id } })
  const accountByCode = new Map(accountRows.map((row) => [row.code, row]))
  await client.journal.createMany({
    data: [
      { code: 'SAL', name: '销售', companyId: company.id },
      { code: 'PUR', name: '采购', companyId: company.id },
      { code: 'BNK', name: '银行', companyId: company.id },
      { code: 'GEN', name: '杂项', companyId: company.id },
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
  const shopInvoice = await client.invoice.create({
    data: {
      name: 'INV0001',
      moveType: 'out_invoice',
      state: 'posted',
      partnerId: lin.id,
      companyId: company.id,
      invoiceDate: new Date('2026-04-12T08:00:00.000Z'),
      salesOrderId: webSale.id,
      amountUntaxed: 86,
      amountTax: 11.18,
      amountTotal: 97.18,
      residual: 97.18,
      buyerName: '林晓',
      buyerTaxId: '91310000LINX000018',
      buyerAddress: '上海市江北路 18 号',
      fapiaoType: 'electronic',
      fapiaoNumber: '26312000000000000001',
      fapiaoStatus: 'ready',
      lines: {
        create: [{
          description: blanket.name,
          quantity: 1,
          unitPrice: 86,
          taxRate: 13,
          subtotal: 86,
          taxAmount: 11.18,
        }],
      },
    },
  })
  await client.journalEntry.create({
    data: {
      name: 'JE0001',
      journalId: salesJournal.id,
      invoiceId: shopInvoice.id,
      date: new Date('2026-04-12T08:00:00.000Z'),
      companyId: company.id,
      lines: {
        create: [
          { accountId: accountByCode.get('1122')!.id, partnerId: lin.id, label: 'INV0001', debit: 97.18, credit: 0 },
          { accountId: accountByCode.get('6001')!.id, partnerId: lin.id, label: 'INV0001', debit: 0, credit: 86 },
          { accountId: accountByCode.get('222101')!.id, partnerId: lin.id, label: 'INV0001', debit: 0, credit: 11.18 },
        ],
      },
    },
  })
}

if (process.argv[1]?.endsWith('seed.ts')) {
  await seedDatabase()
  await prisma.$disconnect()
}
