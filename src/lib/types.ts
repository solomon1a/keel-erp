import type { Role } from '../../shared/roles.ts'

export type User = {
  id: number
  name: string
  email: string
  role: Role
  displayCurrency?: string | null
  company: { id: number; name: string; city: string; currency: string; defaultTaxRate: number }
}

export type DeskUser = {
  id: number
  name: string
  email: string
  role: Role
  createdAt: string
}

export type Country = { id: number; name: string; code: string }
export type Tax = { id: number; name: string; rate: number; isDefault: boolean }

export type Contact = {
  id: number
  name: string
  email: string | null
  phone: string | null
  isCompany: boolean
  isCustomer: boolean
  isSupplier: boolean
  isEmployee: boolean
  street: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  notes: string | null
  parentId: number | null
  countryId: number | null
  parent: { id: number; name: string } | null
  country: { id: number; name: string } | null
  children?: Array<{ id: number; name: string; email: string | null; phone: string | null }>
  orders?: Array<{ id: number; name: string; state: string; amountTotal: number; dateOrder: string }>
  purchaseOrders?: Array<{ id: number; name: string; state: string; amountTotal: number; dateOrder: string }>
  createdAt: string
  updatedAt: string
  createdBy?: { name: string } | null
  updatedBy?: { name: string } | null
  salePriceListId?: number | null
  purchasePriceListId?: number | null
  paymentTermId?: number | null
  fiscalPositionId?: number | null
  _count?: { children: number; orders: number }
}

export type WarehouseLocation = {
  id: number
  name: string
  type: string
  isDefault: boolean
}

export type Warehouse = {
  id: number
  name: string
  code: string
  isDefault: boolean
  locations: WarehouseLocation[]
}

export type Product = {
  id: number
  name: string
  sku: string
  type: string
  kind: string
  listPrice: number
  costPrice: number
  purchasable: boolean
  websitePublished?: boolean
  tracking: string
  barcode: string | null
  categoryId: number | null
  description: string | null
  active: boolean
  onHand?: number
}

export type OrderLine = {
  id?: number
  productId: number
  description: string
  quantity: number
  unitPrice: number
  discount: number
  taxId: number | null
  subtotal: number
  taxAmount: number
  qtyDelivered?: number
  qtyInvoiced?: number
  product?: { id: number; name: string; sku: string; type: string }
  tax?: { id: number; name: string; rate: number } | null
}

export type StockMove = {
  id: number
  quantity: number
  state: string
  reference: string
  lotName?: string | null
  date: string
  product: { name: string; sku: string }
  locationFrom: { name: string; type: string }
  locationTo: { name: string; type: string }
}

export type PurchaseLine = {
  id?: number
  productId: number
  description: string
  quantity: number
  unitCost: number
  taxId: number | null
  subtotal: number
  taxAmount: number
  product?: { id: number; name: string; sku: string; type: string; kind?: string }
  tax?: { id: number; name: string; rate: number } | null
}

export type PurchaseOrder = {
  id: number
  name: string
  state: string
  vendorId: number
  warehouseId?: number | null
  warehouse?: { id: number; name: string; code: string } | null
  dateOrder: string
  amountUntaxed: number
  amountTax: number
  amountTotal: number
  vendor: { id: number; name: string; email?: string | null; city?: string | null }
  lines?: PurchaseLine[]
  moves?: StockMove[]
}

export type BomLine = {
  id?: number
  productId: number
  quantity: number
  lossPercent?: number
  product?: { id: number; name: string; sku: string; costPrice: number; kind: string; type: string; purchasable?: boolean }
}

export type BillOfMaterials = {
  id: number
  productId: number
  yieldQty: number
  version?: number
  active?: boolean
  notes: string | null
  material?: number
  operating?: number
  byproduct?: number
  unitCost: number
  product: { id: number; name: string; sku: string; kind: string; costPrice: number; type: string }
  lines: BomLine[]
  operations?: Array<{ id: number; sequence: number; name: string; hours: number; lossPercent: number; workstation: { id: number; name: string; hourRate: number } }>
  byproducts?: Array<{ id: number; quantity: number; product: { id: number; name: string; sku: string; costPrice: number } }>
  orders?: Array<{ id: number; name: string; state: string }>
}

export type ManufacturingLine = {
  id: number
  productId: number
  quantity: number
  consumed: number
  onHand?: number
  product: { id: number; name: string; sku: string; costPrice: number; purchasable: boolean; kind: string }
}

export type ManufacturingOrder = {
  id: number
  name: string
  state: string
  productId: number
  bomId: number
  quantity: number
  quantityDone: number
  sourceWarehouseId?: number | null
  destWarehouseId?: number | null
  sourceWarehouse?: { id: number; name: string; code: string } | null
  destWarehouse?: { id: number; name: string; code: string } | null
  wipWarehouse?: { id: number; name: string; code: string } | null
  scrapWarehouse?: { id: number; name: string; code: string } | null
  purpose?: string
  transferred?: boolean
  quantityRejected?: number
  operatingAbsorbed?: number
  subcontractState?: string | null
  salesOrder?: { id: number; name: string; state: string } | null
  materialRequest?: { id: number; name: string; state: string } | null
  supplier?: { id: number; name: string } | null
  product: { id: number; name: string; sku: string; kind?: string; costPrice?: number }
  bom?: { id: number; yieldQty: number; version?: number; notes: string | null }
  lines?: ManufacturingLine[]
  moves?: StockMove[]
  jobCards?: Array<{
    id: number
    name: string
    operationName: string
    status: string
    plannedQty: number
    completedQty: number
    processLoss: number
    rejectedQty: number
    workstation?: { id: number; name: string; hourRate: number } | null
    logs: Array<{ id: number; operatorName: string; minutes: number; note: string | null; startedAt?: string | null; endedAt?: string | null }>
  }>
  wastage?: Array<{ id: number; quantity: number; reason: string; kind: string; cost: number }>
}

export type PosPayment = {
  id?: number
  method: string
  direction: string
  amount: number
  tendered: number | null
  change: number | null
}

export type PosLine = {
  id: number
  productId: number
  description: string
  quantity: number
  refundedQty: number
  unitPrice: number
  discount: number
  taxRate: number
  subtotal: number
  taxAmount: number
  product?: { id: number; name: string; sku: string; barcode: string | null }
}

export type PosOrder = {
  id: number
  name: string
  state: string
  sessionId: number
  warehouseId: number
  customerId: number | null
  amountUntaxed: number
  amountTax: number
  amountTotal: number
  amountRefunded: number
  createdAt: string
  customer: { id: number; name: string } | null
  warehouse?: { id: number; name: string; code: string }
  session?: { id: number; name: string; state?: string }
  lines?: PosLine[]
  payments?: PosPayment[]
  createdBy?: { id: number; name: string }
}

export type PosSummary = {
  orderCount: number
  salesTotal: number
  refundTotal: number
  net: number
  expectedCash: number
  payments: Record<string, number>
  refunds: Record<string, number>
}

export type PosSession = {
  id: number
  name: string
  state: string
  warehouseId: number
  openingCash: number
  closingCash: number | null
  difference: number | null
  note: string | null
  openedAt: string
  closedAt: string | null
  warehouse: { id: number; name: string; code: string }
  openedBy?: { name: string }
  closedBy?: { name: string } | null
  summary: PosSummary
}

export type PosCatalog = {
  warehouse: { id: number; name: string; code: string }
  location: { id: number; name: string }
  categories: Array<{ id: number; name: string }>
  products: Array<{
    id: number
    name: string
    sku: string
    barcode: string | null
    listPrice: number
    categoryId: number | null
    categoryName: string | null
    onHand: number
  }>
}

export type SalesOrder = {
  id: number
  name: string
  state: string
  customerId: number
  warehouseId?: number | null
  warehouse?: { id: number; name: string; code: string } | null
  dateOrder: string
  validityDate: string | null
  amountUntaxed: number
  amountTax: number
  amountTotal: number
  origin?: string
  paymentMethod?: string | null
  paymentState?: string | null
  customer: { id: number; name: string; email?: string | null; city?: string | null }
  lines?: OrderLine[]
  moves?: StockMove[]
}
