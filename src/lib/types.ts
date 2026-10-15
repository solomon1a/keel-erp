import type { Role } from '../../shared/roles.ts'

export type User = {
  id: number
  name: string
  email: string
  role: Role
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
  _count?: { children: number; orders: number }
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
  product?: { id: number; name: string; sku: string; type: string }
  tax?: { id: number; name: string; rate: number } | null
}

export type StockMove = {
  id: number
  quantity: number
  state: string
  reference: string
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
  product?: { id: number; name: string; sku: string; costPrice: number; kind: string; type: string; purchasable?: boolean }
}

export type BillOfMaterials = {
  id: number
  productId: number
  yieldQty: number
  notes: string | null
  unitCost: number
  product: { id: number; name: string; sku: string; kind: string; costPrice: number; type: string }
  lines: BomLine[]
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
  product: { id: number; name: string; sku: string; kind?: string; costPrice?: number }
  bom?: { id: number; yieldQty: number; notes: string | null }
  lines?: ManufacturingLine[]
  moves?: StockMove[]
}

export type SalesOrder = {
  id: number
  name: string
  state: string
  customerId: number
  dateOrder: string
  validityDate: string | null
  amountUntaxed: number
  amountTax: number
  amountTotal: number
  customer: { id: number; name: string; email?: string | null; city?: string | null }
  lines?: OrderLine[]
  moves?: StockMove[]
}
