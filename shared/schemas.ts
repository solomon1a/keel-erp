import { z } from 'zod'
import { roleValues } from './roles.ts'

const emailSchema = z
  .string()
  .trim()
  .max(160)
  .refine((value) => z.email().safeParse(value).success, 'Enter a valid email')
  .transform((value) => value.toLowerCase())

export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(200)

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(200),
})

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  newPassword: passwordSchema,
})

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(roleValues),
})

export const resetPasswordSchema = z.object({
  password: passwordSchema,
})

export const currencyCodes = ['CNY', 'USD', 'EUR', 'GBP', 'HKD', 'JPY'] as const

export const companySettingsSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  currency: z.enum(currencyCodes),
  defaultTaxRate: z.number().min(0, 'Tax rate cannot be negative').max(100, 'Tax rate cannot exceed 100'),
})

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .transform((value) => (value ? value : null))

export const contactInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z
    .string()
    .trim()
    .max(160)
    .optional()
    .transform((value) => (value ? value : null))
    .refine((value) => value === null || z.email().safeParse(value).success, 'Enter a valid email'),
  phone: optionalText,
  isCompany: z.boolean(),
  isCustomer: z.boolean(),
  isSupplier: z.boolean(),
  isEmployee: z.boolean(),
  street: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  notes: optionalText,
  parentId: z.number().int().positive().nullable(),
  countryId: z.number().int().positive().nullable(),
})

export const productInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  sku: z.string().trim().min(1, 'SKU is required').max(40),
  type: z.enum(['product', 'service']),
  kind: z.enum(['finished', 'raw']),
  tracking: z.enum(['none', 'lot', 'serial']),
  listPrice: z.number().min(0, 'Price cannot be negative'),
  costPrice: z.number().min(0, 'Cost cannot be negative'),
  purchasable: z.boolean(),
  websitePublished: z.boolean().default(false),
  description: optionalText,
  active: z.boolean(),
  barcode: z
    .string()
    .trim()
    .max(32)
    .optional()
    .transform((value) => (value ? value : null)),
  categoryId: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional()
    .transform((value) => value ?? null),
})

export const orderLineSchema = z.object({
  productId: z.number().int().positive('Choose a product'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  unitPrice: z.number().min(0, 'Price cannot be negative'),
  discount: z.number().min(0).max(100),
  taxId: z.number().int().positive().nullable(),
})

const optionalWarehouseId = z.number().int().positive().optional()

export const orderInputSchema = z.object({
  customerId: z.number().int().positive('Choose a customer'),
  warehouseId: optionalWarehouseId,
  validityDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  lines: z.array(orderLineSchema).min(1, 'Add at least one line'),
})

export const purchaseLineSchema = z.object({
  productId: z.number().int().positive('Choose a product'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  unitCost: z.number().min(0, 'Cost cannot be negative'),
  taxId: z.number().int().positive().nullable(),
})

export const purchaseInputSchema = z.object({
  vendorId: z.number().int().positive('Choose a vendor'),
  warehouseId: optionalWarehouseId,
  lines: z.array(purchaseLineSchema).min(1, 'Add at least one line'),
})

export const receivePurchaseSchema = z.object({
  lines: z
    .array(
      z.object({
        moveId: z.number().int().positive(),
        quantity: z.number().positive('Quantity must be greater than zero'),
      }),
    )
    .optional(),
})

export const bomLineSchema = z.object({
  productId: z.number().int().positive('Choose a component'),
  quantity: z.number().positive('Quantity must be greater than zero'),
})

export const bomInputSchema = z.object({
  productId: z.number().int().positive('Choose a finished product'),
  yieldQty: z.number().positive('Yield must be greater than zero'),
  notes: optionalText,
  lines: z.array(bomLineSchema).min(1, 'Add at least one component'),
})

export const manufacturingInputSchema = z.object({
  productId: z.number().int().positive('Choose a product'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  sourceWarehouseId: optionalWarehouseId,
  destWarehouseId: optionalWarehouseId,
})

export const produceSchema = z.object({
  quantity: z.number().positive('Quantity must be greater than zero').optional(),
})

export const stockAdjustSchema = z.object({
  productId: z.number().int().positive(),
  locationId: z.number().int().positive().optional(),
  quantityDelta: z.number().refine((value) => value !== 0, 'Enter a quantity other than zero'),
  note: z.string().trim().min(1, 'Say why the stock changed').max(160),
  lotName: optionalText,
})

export const warehouseInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  code: z.string().trim().min(1, 'Code is required').max(12),
  isDefault: z.boolean().optional(),
})

export const locationInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
})

export const reorderRuleSchema = z.object({
  productId: z.number().int().positive('Choose a product'),
  warehouseId: z.number().int().positive('Choose a warehouse'),
  minQty: z.number().min(0, 'Minimum cannot be negative'),
  maxQty: z.number().positive('Maximum must be greater than zero'),
})

export const transferLineSchema = z.object({
  productId: z.number().int().positive('Choose a product'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  lotName: optionalText,
})

export const paymentMethodSchema = z.enum(['cash', 'card', 'wechat', 'alipay'])

export const posPaymentSchema = z.object({
  method: paymentMethodSchema,
  amount: z.number().positive('Amount must be greater than zero'),
  tendered: z.number().min(0, 'Cash received cannot be negative').optional(),
})

export const posSessionOpenSchema = z.object({
  warehouseId: z.number().int().positive('Choose a shop'),
  openingCash: z.number().min(0, 'Opening cash cannot be negative'),
})

export const posSessionCloseSchema = z.object({
  closingCash: z.number().min(0, 'Counted cash cannot be negative'),
  note: optionalText,
})

export const posOrderLineSchema = z.object({
  productId: z.number().int().positive('Choose a product'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  discount: z.number().min(0).max(100).optional(),
})

export const posOrderSchema = z.object({
  sessionId: z.number().int().positive('Open a session first'),
  customerId: z.number().int().positive().nullable().optional(),
  lines: z.array(posOrderLineSchema).min(1, 'Add at least one product'),
  payments: z.array(posPaymentSchema).min(1, 'Add a payment'),
})

export const posRefundLineSchema = z.object({
  lineId: z.number().int().positive(),
  quantity: z.number().positive('Quantity must be greater than zero'),
})

export const posRefundSchema = z.object({
  lines: z.array(posRefundLineSchema).min(1, 'Choose what to refund'),
  payments: z.array(posPaymentSchema).min(1, 'Add a refund payment'),
})

export const transferInputSchema = z.object({
  locationFromId: z.number().int().positive('Choose a source location'),
  locationToId: z.number().int().positive('Choose a destination location'),
  lines: z.array(transferLineSchema).min(1, 'Add at least one line'),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>
export type ContactInput = z.infer<typeof contactInputSchema>
export type ProductInput = z.infer<typeof productInputSchema>
export type OrderInput = z.infer<typeof orderInputSchema>
export type PurchaseInput = z.infer<typeof purchaseInputSchema>
export type ReceivePurchaseInput = z.infer<typeof receivePurchaseSchema>
export type BomInput = z.infer<typeof bomInputSchema>
export type ManufacturingInput = z.infer<typeof manufacturingInputSchema>
export type ProduceInput = z.infer<typeof produceSchema>
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>
export type WarehouseInput = z.infer<typeof warehouseInputSchema>
export type LocationInput = z.infer<typeof locationInputSchema>
export type ReorderRuleInput = z.infer<typeof reorderRuleSchema>
export type TransferInput = z.infer<typeof transferInputSchema>
export type PosSessionOpenInput = z.infer<typeof posSessionOpenSchema>
export type PosSessionCloseInput = z.infer<typeof posSessionCloseSchema>
export type PosOrderInput = z.infer<typeof posOrderSchema>
export type PosRefundInput = z.infer<typeof posRefundSchema>

export const shopPaymentMethods = ['wechat', 'alipay', 'card'] as const

export const shopAccountSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: emailSchema,
  password: passwordSchema,
  phone: optionalText,
})

export const shopCheckoutSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: emailSchema,
  phone: optionalText,
  street: optionalText,
  city: optionalText,
  paymentMethod: z.enum(shopPaymentMethods),
  lines: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().positive('Quantity must be greater than zero').max(999),
      }),
    )
    .min(1, 'Add a product before checkout.')
    .max(40),
})

export type ShopAccountInput = z.infer<typeof shopAccountSchema>
export type ShopCheckoutInput = z.infer<typeof shopCheckoutSchema>

export const fapiaoTypes = ['special', 'general', 'electronic'] as const

export const fapiaoSchema = z.object({
  buyerName: optionalText,
  buyerTaxId: optionalText,
  buyerAddress: optionalText,
  fapiaoNumber: optionalText,
  fapiaoType: z.enum(fapiaoTypes).nullable(),
})

export const invoicePaySchema = z.object({
  amount: z.number().positive('Payment amount must be greater than zero'),
  method: z.enum(['bank', 'cash', 'wechat', 'alipay', 'card']),
})

export type FapiaoInput = z.infer<typeof fapiaoSchema>
export type InvoicePayInput = z.infer<typeof invoicePaySchema>

export const crmStages = ['new', 'qualified', 'proposition', 'won', 'lost'] as const

export const crmLeadSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  contactName: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().max(160).optional().transform((value) => (value ? value : null)),
  phone: optionalText,
  expectedRevenue: z.number().min(0).default(0),
})

export const crmStageSchema = z.object({
  stage: z.enum(crmStages),
})

export const crmActivitySchema = z.object({
  kind: z.enum(['call', 'meeting', 'todo']),
  summary: z.string().trim().min(1, 'Summary is required').max(240),
  dueOn: z.string().trim().max(10).optional().transform((value) => (value ? value : null)),
})

export type CrmLeadInput = z.infer<typeof crmLeadSchema>
export type CrmActivityInput = z.infer<typeof crmActivitySchema>

const dayField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date.')

export const departmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
})

export const employeeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().max(160).optional().transform((value) => (value ? value : null)),
  phone: optionalText,
  jobTitle: optionalText,
  departmentId: z.number().int().positive().nullable(),
  active: z.boolean().default(true),
})

export const attendanceSchema = z.object({
  workDate: dayField,
  status: z.enum(['present', 'absent', 'late']),
  note: optionalText,
})

export const leaveSchema = z.object({
  kind: z.enum(['annual', 'sick', 'personal']),
  dateFrom: dayField,
  dateTo: dayField,
  reason: optionalText,
})

export type DepartmentInput = z.infer<typeof departmentSchema>
export type EmployeeInput = z.infer<typeof employeeSchema>
export type AttendanceInput = z.infer<typeof attendanceSchema>
export type LeaveInput = z.infer<typeof leaveSchema>
