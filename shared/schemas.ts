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

export const currencyCodes = ['CNY', 'USD', 'EUR', 'HKD', 'JPY'] as const

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
  listPrice: z.number().min(0, 'Price cannot be negative'),
  description: optionalText,
  active: z.boolean(),
})

export const orderLineSchema = z.object({
  productId: z.number().int().positive('Choose a product'),
  quantity: z.number().positive('Quantity must be greater than zero'),
  unitPrice: z.number().min(0, 'Price cannot be negative'),
  discount: z.number().min(0).max(100),
  taxId: z.number().int().positive().nullable(),
})

export const orderInputSchema = z.object({
  customerId: z.number().int().positive('Choose a customer'),
  validityDate: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : null)),
  lines: z.array(orderLineSchema).min(1, 'Add at least one line'),
})

export const stockAdjustSchema = z.object({
  productId: z.number().int().positive(),
  quantityDelta: z.number().refine((value) => value !== 0, 'Enter a quantity other than zero'),
  note: z.string().trim().min(1, 'Say why the stock changed').max(160),
})

export type LoginInput = z.infer<typeof loginSchema>
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type CompanySettingsInput = z.infer<typeof companySettingsSchema>
export type ContactInput = z.infer<typeof contactInputSchema>
export type ProductInput = z.infer<typeof productInputSchema>
export type OrderInput = z.infer<typeof orderInputSchema>
export type StockAdjustInput = z.infer<typeof stockAdjustSchema>
