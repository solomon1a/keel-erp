import type { Tx } from '../db.ts'
import { AppError } from '../errors.ts'

export function roundQty(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export async function resolveWarehouseId(tx: Tx, companyId: number, warehouseId?: number | null) {
  if (warehouseId) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, companyId } })
    if (!warehouse) throw new AppError(400, 'Choose a warehouse.')
    return warehouse.id
  }
  const main = await tx.warehouse.findFirst({ where: { companyId, isDefault: true } })
  if (!main) throw new AppError(500, 'No default warehouse is set up.')
  return main.id
}

export async function warehouseStockLocation(tx: Tx, companyId: number, warehouseId?: number | null) {
  const id = await resolveWarehouseId(tx, companyId, warehouseId)
  const warehouse = await tx.warehouse.findFirstOrThrow({ where: { id } })
  const locations = await tx.stockLocation.findMany({
    where: { warehouseId: id, type: 'internal' },
    orderBy: { id: 'asc' },
  })
  const location = locations.find((row) => row.isDefault) ?? locations[0]
  if (!location) throw new AppError(400, `${warehouse.name} has no stock location.`)
  return { warehouse, location }
}

export async function companyLocations(tx: Tx, companyId: number) {
  const rows = await tx.stockLocation.findMany({ where: { companyId, warehouseId: null } })
  const customer = rows.find((row) => row.type === 'customer')
  const supplier = rows.find((row) => row.type === 'supplier')
  const adjustment = rows.find((row) => row.type === 'inventory')
  const production = rows.find((row) => row.type === 'production')
  const { location: internal } = await warehouseStockLocation(tx, companyId, null)
  if (!customer || !supplier || !adjustment || !production) {
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

export async function onHandInWarehouse(tx: Tx, productId: number, warehouseId: number): Promise<number> {
  const quants = await tx.stockQuant.findMany({
    where: { productId, location: { warehouseId, type: 'internal' } },
  })
  return roundQty(quants.reduce((sum, quant) => sum + quant.quantity, 0))
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
