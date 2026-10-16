import type { PrismaClient } from '@prisma/client'
import { roundMoney } from '../src/domain/money.ts'
import type { Tx } from '../server/db.ts'
import { ensurePayrollAccounts, estimatePayslip } from '../server/services/payroll.ts'

const admins = ['maya@northline.example', 'amira@harbourline.example', 'jordan@hudsonyard.example'] as const

const customerNames = [
  'North Glass', 'Paper & Pine', 'Lumen Studio', 'Field Office', 'Marlow Books', 'Atlas Hotel',
  'Kindred Cafe', 'Orchard School', 'Blue Ferry', 'Copper Lane', 'Sunday Market', 'West Archive',
  'Little Lantern', 'Harbor Press', 'Elm Apothecary', 'Quiet Room', 'Bright Parcel', 'Oak & Thread',
]

const vendorNames = [
  'River Mill', 'South Cloth', 'Peak Boxes', 'Inland Ink', 'Harbor Thread', 'Metro Paper',
  'North Dye', 'Cedar Board', 'Fable Trim', 'Union Carton', 'Glasshouse Yarn', 'East Binding',
]

const staff = [
  ['Mina Cole', 'Buyer'],
  ['Owen Price', 'Warehouse'],
  ['Sara Iqbal', 'Accounts'],
  ['Theo Marsh', 'Sales'],
  ['Uma Shah', 'Designer'],
  ['Victor Lang', 'Receiver'],
  ['Wen Li', 'Stylist'],
  ['Yves Moreau', 'Support'],
] as const

const saleStates = ['draft', 'sent', 'sale', 'done', 'cancel'] as const
const purchaseStates = ['draft', 'sent', 'purchase', 'done', 'cancel'] as const
const moStates = ['draft', 'confirmed', 'progress', 'done', 'cancel'] as const

const leads = [
  ['North window bid', 'new', 500],
  ['Pop-up weekend', 'new', 500],
  ['Hotel amenity kit', 'qualified', 600],
  ['Seasonal catalogue', 'proposition', 700],
  ['Trade show follow-up', 'proposition', 700],
  ['Airport kiosk', 'won', 900],
  ['Museum shop pass', 'lost', 200],
] as const

function taxNameFor(currency: string) {
  switch (currency) {
    case 'CNY':
      return 'China VAT 13%'
    case 'GBP':
      return 'VAT'
    case 'USD':
      return 'NY Sales Tax'
    default:
      return 'No tax'
  }
}

function taxed(untaxed: number, rate: number) {
  const amountUntaxed = roundMoney(untaxed)
  const amountTax = roundMoney(amountUntaxed * (rate / 100))
  return { amountUntaxed, amountTax, amountTotal: roundMoney(amountUntaxed + amountTax) }
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function accounts(tx: Tx, companyId: number) {
  await ensurePayrollAccounts(tx, companyId)
  const rows = await tx.account.findMany({ where: { companyId } })
  const byCode = new Map(rows.map((row) => [row.code, row.id]))
  const id = (code: string) => {
    const accountId = byCode.get(code)
    if (!accountId) throw new Error(`Account ${code} is missing for company ${companyId}.`)
    return accountId
  }
  return id
}

export async function seedRichDemo(client: PrismaClient) {
  for (const email of admins) {
    const admin = await client.user.findUnique({ where: { email }, include: { company: true } })
    if (!admin) continue
    const marker = await client.salesOrder.findFirst({
      where: { companyId: admin.companyId, name: 'SO1101' },
      select: { id: true },
    })
    if (marker) continue
    await client.$transaction(async (tx) => {
      await fillCompany(tx, admin.id, admin.company)
    }, { maxWait: 20000, timeout: 120000 })
  }
}

async function fillCompany(
  tx: Tx,
  adminId: number,
  company: { id: number; currency: string; defaultTaxRate: number; city: string },
) {
  const companyId = company.id
  const rate = company.defaultTaxRate
  const tax = await tx.tax.findFirst({ where: { name: taxNameFor(company.currency) } })
  const warehouse = await tx.warehouse.findFirst({ where: { companyId, isDefault: true } })
  const shelf = await tx.stockLocation.findFirst({ where: { companyId, type: 'internal', isDefault: true } })
  const supplier = await tx.stockLocation.findFirst({ where: { companyId, type: 'supplier' } })
  const customersLoc = await tx.stockLocation.findFirst({ where: { companyId, type: 'customer' } })
  const department = await tx.department.findFirst({ where: { companyId }, orderBy: { id: 'asc' } })
  if (!warehouse || !shelf || !supplier || !customersLoc || !tax) return

  const swatch = await tx.product.create({
    data: {
      name: 'Showroom swatch',
      sku: 'SW-01',
      type: 'product',
      kind: 'finished',
      listPrice: 40,
      costPrice: 12,
      purchasable: true,
      websitePublished: false,
      companyId,
      description: 'A sample cloth used on quotations and the closed register.',
    },
  })
  await tx.stockQuant.create({ data: { productId: swatch.id, locationId: shelf.id, quantity: 20 } })
  await tx.stockMove.create({
    data: {
      productId: swatch.id,
      locationFromId: supplier.id,
      locationToId: shelf.id,
      quantity: 20,
      state: 'done',
      reference: 'Swatch opening',
      date: new Date('2026-01-06T00:00:00.000Z'),
    },
  })

  const buyers = []
  for (const [index, name] of customerNames.entries()) {
    buyers.push(await tx.contact.create({
      data: {
        name,
        email: `${slug(name)}.${companyId}@buyers.keel`,
        isCompany: true,
        isCustomer: true,
        city: company.city,
        companyId,
        createdById: adminId,
        updatedById: adminId,
        notes: index % 2 === 0 ? 'Asks for a written quotation.' : 'Buys for a shop floor.',
      },
    }))
  }
  const sellers = []
  for (const name of vendorNames) {
    sellers.push(await tx.contact.create({
      data: {
        name,
        email: `${slug(name)}.${companyId}@vendors.keel`,
        isCompany: true,
        isSupplier: true,
        city: company.city,
        companyId,
        createdById: adminId,
        updatedById: adminId,
      },
    }))
  }
  const buyer = buyers[0]
  const seller = sellers[0]
  if (!buyer || !seller) return

  for (let index = 0; index < 18; index += 1) {
    const state = saleStates[index % saleStates.length] ?? 'draft'
    const money = taxed(40 + index * 5, rate)
    const customer = buyers[index % buyers.length] ?? buyer
    await tx.salesOrder.create({
      data: {
        name: `SO${String(1101 + index).padStart(4, '0')}`,
        state,
        customerId: customer.id,
        warehouseId: warehouse.id,
        companyId,
        dateOrder: new Date(Date.UTC(2026, index % 4, 4 + index)),
        amountUntaxed: money.amountUntaxed,
        amountTax: money.amountTax,
        amountTotal: money.amountTotal,
        createdById: adminId,
        lines: {
          create: [{
            productId: swatch.id,
            description: swatch.name,
            quantity: 1,
            unitPrice: money.amountUntaxed,
            discount: 0,
            taxId: tax.id,
            subtotal: money.amountUntaxed,
            taxAmount: money.amountTax,
          }],
        },
      },
    })
  }
  for (let index = 0; index < 3; index += 1) {
    const money = taxed(24, rate)
    const customer = buyers[index + 1] ?? buyer
    await tx.salesOrder.create({
      data: {
        name: `SO${String(1119 + index).padStart(4, '0')}`,
        state: 'done',
        origin: 'shop',
        paymentMethod: index === 0 ? 'card' : index === 1 ? 'wechat' : 'alipay',
        paymentState: 'recorded',
        publicToken: `rich-shop-${companyId}-${index + 1}`,
        customerId: customer.id,
        warehouseId: warehouse.id,
        companyId,
        dateOrder: new Date(Date.UTC(2026, 3, 10 + index)),
        amountUntaxed: money.amountUntaxed,
        amountTax: money.amountTax,
        amountTotal: money.amountTotal,
        createdById: adminId,
        lines: {
          create: [{
            productId: swatch.id,
            description: swatch.name,
            quantity: 1,
            unitPrice: money.amountUntaxed,
            discount: 0,
            taxId: tax.id,
            subtotal: money.amountUntaxed,
            taxAmount: money.amountTax,
          }],
        },
      },
    })
  }

  for (let index = 0; index < 12; index += 1) {
    const state = purchaseStates[index % purchaseStates.length] ?? 'draft'
    const money = taxed(30 + index * 4, rate)
    const vendor = sellers[index % sellers.length] ?? seller
    await tx.purchaseOrder.create({
      data: {
        name: `PO${String(1101 + index).padStart(4, '0')}`,
        state,
        vendorId: vendor.id,
        warehouseId: warehouse.id,
        companyId,
        dateOrder: new Date(Date.UTC(2026, index % 3, 6 + index)),
        amountUntaxed: money.amountUntaxed,
        amountTax: money.amountTax,
        amountTotal: money.amountTotal,
        createdById: adminId,
        lines: {
          create: [{
            productId: swatch.id,
            description: swatch.name,
            quantity: 2,
            unitCost: roundMoney(money.amountUntaxed / 2),
            taxId: tax.id,
            subtotal: money.amountUntaxed,
            taxAmount: money.amountTax,
          }],
        },
      },
    })
  }

  const bom = await tx.billOfMaterials.findFirst({
    where: { companyId },
    include: { lines: true },
  })
  if (bom) {
    for (let index = 0; index < 12; index += 1) {
      const state = moStates[index % moStates.length] ?? 'draft'
      const quantity = 2 + (index % 3)
      await tx.manufacturingOrder.create({
        data: {
          name: `MO${String(1101 + index).padStart(4, '0')}`,
          state,
          productId: bom.productId,
          bomId: bom.id,
          companyId,
          quantity,
          quantityDone: state === 'done' ? quantity : state === 'progress' ? 1 : 0,
          sourceWarehouseId: warehouse.id,
          destWarehouseId: warehouse.id,
          createdById: adminId,
          lines: {
            create: bom.lines.map((line) => ({
              productId: line.productId,
              quantity: roundMoney(line.quantity * quantity),
            })),
          },
        },
      })
    }
  }

  for (const [name, stage, expectedRevenue] of leads) {
    await tx.lead.create({
      data: {
        name,
        contactName: buyer.name,
        email: buyer.email,
        expectedRevenue,
        stage,
        companyId,
        userId: adminId,
      },
    })
  }

  const paid = taxed(200, rate)
  const open = taxed(100, rate)
  const late = taxed(50, rate)
  const bill = taxed(80, rate)
  const accountId = await accounts(tx, companyId)
  const salesJournal = await tx.journal.findFirstOrThrow({ where: { companyId, code: 'SAL' } })
  const bankJournal = await tx.journal.findFirstOrThrow({ where: { companyId, code: 'BNK' } })
  const purchaseJournal = await tx.journal.findFirstOrThrow({ where: { companyId, code: 'PUR' } })
  const generalJournal = await tx.journal.findFirstOrThrow({ where: { companyId, code: 'GEN' } })

  const paidInvoice = await tx.invoice.create({
    data: {
      name: 'INV1101',
      moveType: 'out_invoice',
      state: 'paid',
      partnerId: buyer.id,
      companyId,
      invoiceDate: new Date('2026-02-12T00:00:00.000Z'),
      amountUntaxed: paid.amountUntaxed,
      amountTax: paid.amountTax,
      amountTotal: paid.amountTotal,
      residual: 0,
      lines: { create: [{ description: 'Showroom swatch', quantity: 5, unitPrice: 40, taxRate: rate, subtotal: paid.amountUntaxed, taxAmount: paid.amountTax }] },
      payments: { create: [{ amount: paid.amountTotal, method: 'bank', paidAt: new Date('2026-02-20T00:00:00.000Z') }] },
    },
  })
  await tx.journalEntry.create({
    data: {
      name: 'JE1101',
      journalId: salesJournal.id,
      invoiceId: paidInvoice.id,
      date: paidInvoice.invoiceDate,
      companyId,
      lines: {
        create: [
          { accountId: accountId('1122'), label: 'INV1101', debit: paid.amountTotal, credit: 0 },
          { accountId: accountId('6001'), label: 'INV1101', debit: 0, credit: paid.amountUntaxed },
          { accountId: accountId('222101'), label: 'INV1101', debit: 0, credit: paid.amountTax },
        ],
      },
    },
  })
  await tx.journalEntry.create({
    data: {
      name: 'JE1102',
      journalId: bankJournal.id,
      date: new Date('2026-02-20T00:00:00.000Z'),
      companyId,
      lines: {
        create: [
          { accountId: accountId('1002'), label: 'INV1101', debit: paid.amountTotal, credit: 0 },
          { accountId: accountId('1122'), label: 'INV1101', debit: 0, credit: paid.amountTotal },
        ],
      },
    },
  })
  await tx.invoice.create({
    data: {
      name: 'INV1102',
      moveType: 'out_invoice',
      state: 'posted',
      partnerId: buyer.id,
      companyId,
      invoiceDate: new Date('2026-04-02T00:00:00.000Z'),
      amountUntaxed: open.amountUntaxed,
      amountTax: open.amountTax,
      amountTotal: open.amountTotal,
      residual: open.amountTotal,
      lines: { create: [{ description: 'Showroom swatch', quantity: 1, unitPrice: open.amountUntaxed, taxRate: rate, subtotal: open.amountUntaxed, taxAmount: open.amountTax }] },
    },
  })
  await tx.journalEntry.create({
    data: {
      name: 'JE1103',
      journalId: salesJournal.id,
      date: new Date('2026-04-02T00:00:00.000Z'),
      companyId,
      lines: {
        create: [
          { accountId: accountId('1122'), label: 'INV1102', debit: open.amountTotal, credit: 0 },
          { accountId: accountId('6001'), label: 'INV1102', debit: 0, credit: open.amountUntaxed },
          { accountId: accountId('222101'), label: 'INV1102', debit: 0, credit: open.amountTax },
        ],
      },
    },
  })
  await tx.invoice.create({
    data: {
      name: 'INV1103',
      moveType: 'out_invoice',
      state: 'posted',
      partnerId: buyer.id,
      companyId,
      invoiceDate: new Date('2025-11-15T00:00:00.000Z'),
      amountUntaxed: late.amountUntaxed,
      amountTax: late.amountTax,
      amountTotal: late.amountTotal,
      residual: late.amountTotal,
      lines: { create: [{ description: 'Showroom swatch', quantity: 1, unitPrice: late.amountUntaxed, taxRate: rate, subtotal: late.amountUntaxed, taxAmount: late.amountTax }] },
    },
  })
  await tx.journalEntry.create({
    data: {
      name: 'JE1104',
      journalId: salesJournal.id,
      date: new Date('2025-11-15T00:00:00.000Z'),
      companyId,
      lines: {
        create: [
          { accountId: accountId('1122'), label: 'INV1103', debit: late.amountTotal, credit: 0 },
          { accountId: accountId('6001'), label: 'INV1103', debit: 0, credit: late.amountUntaxed },
          { accountId: accountId('222101'), label: 'INV1103', debit: 0, credit: late.amountTax },
        ],
      },
    },
  })
  await tx.invoice.create({
    data: {
      name: 'BILL1101',
      moveType: 'in_invoice',
      state: 'posted',
      partnerId: seller.id,
      companyId,
      invoiceDate: new Date('2026-03-08T00:00:00.000Z'),
      amountUntaxed: bill.amountUntaxed,
      amountTax: bill.amountTax,
      amountTotal: bill.amountTotal,
      residual: bill.amountTotal,
      lines: { create: [{ description: 'Cloth', quantity: 4, unitPrice: 20, taxRate: rate, subtotal: bill.amountUntaxed, taxAmount: bill.amountTax }] },
    },
  })
  await tx.journalEntry.create({
    data: {
      name: 'JE1105',
      journalId: purchaseJournal.id,
      date: new Date('2026-03-08T00:00:00.000Z'),
      companyId,
      lines: {
        create: [
          { accountId: accountId('1405'), label: 'BILL1101', debit: bill.amountUntaxed, credit: 0 },
          { accountId: accountId('222102'), label: 'BILL1101', debit: bill.amountTax, credit: 0 },
          { accountId: accountId('2202'), label: 'BILL1101', debit: 0, credit: bill.amountTotal },
        ],
      },
    },
  })

  if (department) {
    for (const [name, jobTitle] of staff) {
      await tx.employee.create({
        data: {
          name,
          email: `${slug(name)}.${companyId}@staff.keel`,
          jobTitle,
          departmentId: department.id,
          companyId,
          attendances: { create: [{ workDate: new Date('2026-04-14T00:00:00.000Z'), status: 'present' }] },
        },
      })
    }
  }

  const seededSlip = await tx.payslip.findFirst({
    where: { run: { companyId, name: 'PR0001' } },
    include: { employee: { include: { salary: true } } },
  })
  const gross = seededSlip?.employee.salary?.monthlyGross
  if (seededSlip && gross) {
    const slip = estimatePayslip(company.currency, gross)
    for (const [period, runName, entryName] of [['2026-02', 'PR1102', 'JE1106'], ['2026-03', 'PR1103', 'JE1107']] as const) {
      const entry = await tx.journalEntry.create({
        data: {
          name: entryName,
          journalId: generalJournal.id,
          date: new Date(`${period}-28T00:00:00.000Z`),
          companyId,
          lines: {
            create: [
              { accountId: accountId('6601'), label: runName, debit: slip.gross, credit: 0 },
              { accountId: accountId('2241'), label: runName, debit: 0, credit: slip.net },
              { accountId: accountId('222103'), label: runName, debit: 0, credit: slip.deduction },
            ],
          },
        },
      })
      await tx.payrollRun.create({
        data: {
          name: runName,
          period,
          state: 'posted',
          companyId,
          entryId: entry.id,
          payslips: {
            create: [{
              employeeId: seededSlip.employeeId,
              gross: slip.gross,
              deduction: slip.deduction,
              net: slip.net,
              lines: { create: slip.lines },
            }],
          },
        },
      })
    }
  }

  const claimant = seededSlip?.employeeId
  if (claimant) {
    const amount = 40
    const entry = await tx.journalEntry.create({
      data: {
        name: 'JE1108',
        journalId: bankJournal.id,
        date: new Date('2026-03-18T00:00:00.000Z'),
        companyId,
        lines: {
          create: [
            { accountId: accountId('6602'), label: 'EX1101', debit: amount, credit: 0 },
            { accountId: accountId('1002'), label: 'EX1101', debit: 0, credit: amount },
          ],
        },
      },
    })
    await tx.expenseClaim.create({
      data: {
        name: 'EX1101',
        companyId,
        employeeId: claimant,
        merchant: 'City taxi',
        description: 'Ride to the customer',
        receiptRef: 'taxi-2026-03-18.pdf',
        amount,
        spentOn: new Date('2026-03-18T00:00:00.000Z'),
        state: 'reimbursed',
        entryId: entry.id,
      },
    })
    await tx.expenseClaim.create({
      data: {
        name: 'EX1102',
        companyId,
        employeeId: claimant,
        merchant: 'Stationery shop',
        description: 'Notebooks for the counter',
        receiptRef: 'paper-2026-03-20.pdf',
        amount: 22,
        spentOn: new Date('2026-03-20T00:00:00.000Z'),
        state: 'approved',
      },
    })
    await tx.expenseClaim.create({
      data: {
        name: 'EX1103',
        companyId,
        employeeId: claimant,
        merchant: 'Late dinner',
        description: 'Not a customer visit',
        receiptRef: 'dinner-2026-03-21.pdf',
        amount: 15,
        spentOn: new Date('2026-03-21T00:00:00.000Z'),
        state: 'refused',
      },
    })
  }

  const closed = await tx.posSession.create({
    data: {
      name: 'SES1101',
      state: 'closed',
      warehouseId: warehouse.id,
      companyId,
      openingCash: 50,
      closingCash: 50,
      difference: 0,
      openedById: adminId,
      closedById: adminId,
      openedAt: new Date('2026-03-02T09:00:00.000Z'),
      closedAt: new Date('2026-03-02T18:00:00.000Z'),
    },
  })
  for (const [name, method] of [['POS1101', 'card'], ['POS1102', 'cash']] as const) {
    const money = taxed(40, rate)
    const order = await tx.posOrder.create({
      data: {
        name,
        state: 'paid',
        sessionId: closed.id,
        companyId,
        warehouseId: warehouse.id,
        amountUntaxed: money.amountUntaxed,
        amountTax: money.amountTax,
        amountTotal: money.amountTotal,
        createdById: adminId,
        createdAt: new Date('2026-03-02T12:00:00.000Z'),
        lines: {
          create: [{
            productId: swatch.id,
            description: swatch.name,
            quantity: 1,
            unitPrice: 40,
            discount: 0,
            taxRate: rate,
            subtotal: money.amountUntaxed,
            taxAmount: money.amountTax,
          }],
        },
        payments: { create: [{ method, direction: 'payment', amount: money.amountTotal }] },
      },
    })
    await tx.stockMove.create({
      data: {
        productId: swatch.id,
        locationFromId: shelf.id,
        locationToId: customersLoc.id,
        quantity: 1,
        state: 'done',
        reference: order.name,
        posOrderId: order.id,
        date: order.createdAt,
      },
    })
  }
  await tx.stockQuant.update({
    where: { productId_locationId: { productId: swatch.id, locationId: shelf.id } },
    data: { quantity: 18 },
  })
}
