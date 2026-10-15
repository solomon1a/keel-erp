import type { Role } from '../../shared/roles.ts'

export type User = {
  id: number
  name: string
  email: string
  role: Role
  company: { id: number; name: string; city: string }
}

export type DeskUser = {
  id: number
  name: string
  email: string
  role: Role
  createdAt: string
}

export type Country = { id: number; name: string; code: string }
export type Tax = { id: number; name: string; rate: number }

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
  listPrice: number
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
  locationFrom: { name: string }
  locationTo: { name: string }
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
