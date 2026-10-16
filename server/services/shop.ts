import { randomBytes } from 'node:crypto'
import { lineAmounts, sumLines } from '../../src/domain/money.ts'
import type { ShopCheckoutInput } from '../../shared/schemas.ts'
import { prisma, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { applyQuant, companyLocations, onHand, roundQty, warehouseStockLocation } from './stock.ts'

const orderInclude = {
  customer: { select: { id: true, name: true, email: true, city: true } },
  company: { select: { currency: true } },
  warehouse: { select: { id: true, name: true, code: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
    },
  },
} as const

async function nextOrderName(tx: Tx) {
  const sequence = await tx.sequence.update({
    where: { name: 'sales.order' },
    data: { next: { increment: 1 } },
  })
  return `SO${String(sequence.next).padStart(4, '0')}`
}

export async function shopCatalog() {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findFirst({ orderBy: { id: 'asc' } })
    if (!company) throw new AppError(500, 'The shop is not set up yet.')
    const source = await warehouseStockLocation(tx, company.id, company.onlineWarehouseId)
    const products = await tx.product.findMany({
      where: { companyId: company.id, active: true, websitePublished: true },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    })
    const quants = await tx.stockQuant.findMany({
      where: { locationId: source.location.id, productId: { in: products.map((product) => product.id) } },
    })
    const onHandByProduct = new Map(quants.map((quant) => [quant.productId, quant.quantity]))
    const categories = new Map<number, string>()
    for (const product of products) {
      if (product.category) categories.set(product.category.id, product.category.name)
    }
    return {
      company: { name: company.name, city: company.city, currency: company.currency, taxRate: company.defaultTaxRate },
      warehouse: { id: source.warehouse.id, name: source.warehouse.name, code: source.warehouse.code },
      categories: [...categories.entries()].map(([id, name]) => ({ id, name })),
      products: products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        description: product.description,
        listPrice: product.listPrice,
        barcode: product.barcode,
        categoryId: product.categoryId,
        categoryName: product.category?.name ?? null,
        onHand: onHandByProduct.get(product.id) ?? 0,
      })),
    }
  })
}

export async function shopProduct(productId: number) {
  const catalog = await shopCatalog()
  const product = catalog.products.find((row) => row.id === productId)
  if (!product) throw new AppError(404, 'That product is not on the shop.')
  return { ...catalog, product }
}

async function customerContact(
  tx: Tx,
  companyId: number,
  shopCustomerId: number | null,
  input: ShopCheckoutInput,
) {
  if (shopCustomerId) {
    const account = await tx.shopCustomer.findFirst({ where: { id: shopCustomerId, companyId } })
    if (!account) throw new AppError(401, 'Sign in again to check out.')
    return tx.contact.update({
      where: { id: account.contactId },
      data: {
        name: input.name,
        phone: input.phone,
        street: input.street,
        city: input.city,
        isCustomer: true,
      },
    })
  }
  const existing = await tx.contact.findFirst({
    where: { companyId, email: input.email },
    orderBy: { id: 'asc' },
  })
  if (existing) {
    return tx.contact.update({
      where: { id: existing.id },
      data: {
        name: input.name,
        phone: input.phone,
        street: input.street,
        city: input.city,
        isCustomer: true,
      },
    })
  }
  return tx.contact.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      street: input.street,
      city: input.city,
      isCustomer: true,
      companyId,
    },
  })
}

export async function checkoutShop(input: ShopCheckoutInput, shopCustomerId: number | null) {
  return prisma.$transaction(async (tx) => {
    const company = await tx.company.findFirst({ orderBy: { id: 'asc' } })
    if (!company) throw new AppError(500, 'The shop is not set up yet.')
    const tax = await tx.tax.findFirst({ where: { isDefault: true } })
    const taxRate = tax?.rate ?? company.defaultTaxRate
    const products = await tx.product.findMany({
      where: {
        companyId: company.id,
        active: true,
        websitePublished: true,
        id: { in: input.lines.map((line) => line.productId) },
      },
    })
    const productById = new Map(products.map((product) => [product.id, product]))
    const lines = input.lines.map((line, index) => {
      const product = productById.get(line.productId)
      if (!product) throw new AppError(400, `Line ${index + 1} is not for sale on the shop.`)
      const amounts = lineAmounts({
        quantity: line.quantity,
        unitPrice: product.listPrice,
        discount: 0,
        taxRate,
      })
      return {
        product,
        quantity: roundQty(line.quantity),
        unitPrice: product.listPrice,
        subtotal: amounts.subtotal,
        taxAmount: amounts.taxAmount,
        taxId: tax?.id ?? null,
      }
    })
    const source = await warehouseStockLocation(tx, company.id, company.onlineWarehouseId)
    const locations = await companyLocations(tx, company.id)
    const needed = new Map<number, { name: string; quantity: number }>()
    for (const line of lines) {
      if (line.product.type !== 'product') continue
      const current = needed.get(line.product.id)
      needed.set(line.product.id, {
        name: line.product.name,
        quantity: roundQty((current?.quantity ?? 0) + line.quantity),
      })
    }
    for (const [productId, need] of needed) {
      const available = await onHand(tx, productId, source.location.id)
      if (available + 0.0001 < need.quantity) {
        throw new AppError(409, `${need.name} has ${available} on hand and this order needs ${need.quantity}.`)
      }
    }
    const contact = await customerContact(tx, company.id, shopCustomerId, input)
    const totals = sumLines(lines)
    const order = await tx.salesOrder.create({
      data: {
        name: await nextOrderName(tx),
        state: 'done',
        origin: 'shop',
        paymentMethod: input.paymentMethod,
        paymentState: 'recorded',
        publicToken: randomBytes(18).toString('base64url'),
        customerId: contact.id,
        warehouseId: source.warehouse.id,
        companyId: company.id,
        dateOrder: new Date(),
        ...totals,
        lines: {
          create: lines.map((line) => ({
            productId: line.product.id,
            description: line.product.name,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discount: 0,
            taxId: line.taxId,
            subtotal: line.subtotal,
            taxAmount: line.taxAmount,
          })),
        },
      },
    })
    for (const line of lines) {
      if (line.product.type !== 'product') continue
      await applyQuant(tx, line.product.id, source.location.id, -line.quantity)
      await applyQuant(tx, line.product.id, locations.customer.id, line.quantity)
      await tx.stockMove.create({
        data: {
          productId: line.product.id,
          locationFromId: source.location.id,
          locationToId: locations.customer.id,
          quantity: line.quantity,
          state: 'done',
          reference: order.name,
          orderId: order.id,
          date: new Date(),
        },
      })
    }
    return tx.salesOrder.findFirstOrThrow({ where: { id: order.id }, include: orderInclude })
  })
}

export async function shopOrderByToken(token: string) {
  const order = await prisma.salesOrder.findFirst({
    where: { publicToken: token, origin: 'shop' },
    include: orderInclude,
  })
  if (!order) throw new AppError(404, 'Order not found.')
  return order
}

export async function shopOrdersForCustomer(customerId: number) {
  const account = await prisma.shopCustomer.findUnique({ where: { id: customerId } })
  if (!account) throw new AppError(401, 'Sign in again.')
  return prisma.salesOrder.findMany({
    where: { companyId: account.companyId, customerId: account.contactId, origin: 'shop' },
    include: orderInclude,
    orderBy: { id: 'desc' },
  })
}
