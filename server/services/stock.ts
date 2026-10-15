import type { Tx } from '../db.ts'
import { AppError } from '../errors.ts'

export function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export async function companyLocations(tx: Tx, companyId: number) {
  const rows = await tx.stockLocation.findMany({ where: { companyId } })
  const internal = rows.find((row) => row.type === 'internal')
  const customer = rows.find((row) => row.type === 'customer')
  const supplier = rows.find((row) => row.type === 'supplier')
  const adjustment = rows.find((row) => row.type === 'inventory')
  const production = rows.find((row) => row.type === 'production')
  if (!internal || !customer || !supplier || !adjustment || !production) {
    throw new AppError(500, 'Stock locations are not set up for this company.')
  }
  return { internal, customer, supplier, adjustment, production }
}

export async function onHand(tx: Tx, productId: number, locationId: number): Promise<number> {
  const quant = await tx.stockQuant.findUnique({
    where: { productId_locationId: { productId, locationId } },
  })
  return quant?.quantity ?? 0
}

export async function applyQuant(tx: Tx, productId: number, locationId: number, delta: number) {
  const location = await tx.stockLocation.findUniqueOrThrow({ where: { id: locationId } })
  const existing = await tx.stockQuant.findUnique({
    where: { productId_locationId: { productId, locationId } },
  })
  const next = roundQty((existing?.quantity ?? 0) + delta)
  if (location.type === 'internal' && next < -0.0001) {
    const product = await tx.product.findUnique({ where: { id: productId } })
    throw new AppError(409, `${product?.name ?? 'This product'} does not have enough on the shelf.`)
  }
  if (existing) {
    await tx.stockQuant.update({ where: { id: existing.id }, data: { quantity: next } })
  } else if (next !== 0) {
    await tx.stockQuant.create({ data: { productId, locationId, quantity: next } })
  }
}
