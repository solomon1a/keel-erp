import { randomBytes } from 'node:crypto'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { hashPassword, hashSessionToken, passwordMatches, sessionCookieSecure } from './auth.ts'
import { prisma } from './db.ts'
import { AppError } from './errors.ts'

const sessionSeconds = 60 * 60 * 24 * 14

export const shopCookieName = 'keel_shop'

export type ShopAccount = {
  id: number
  name: string
  email: string
  phone: string | null
  contactId: number
  companyId: number
}

export function readShopToken(c: Context) {
  return getCookie(c, shopCookieName)
}

export function writeShopCookie(c: Context, token: string) {
  setCookie(c, shopCookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: sessionSeconds,
    secure: sessionCookieSecure(),
  })
}

export function clearShopCookie(c: Context) {
  deleteCookie(c, shopCookieName, { path: '/', secure: sessionCookieSecure() })
}

export async function shopAccountFromToken(token: string | undefined): Promise<ShopAccount | null> {
  if (!token) return null
  const session = await prisma.shopSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      customer: { select: { id: true, name: true, email: true, phone: true, contactId: true, companyId: true } },
    },
  })
  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.shopSession.delete({ where: { id: session.id } })
    return null
  }
  return session.customer
}

export async function openShopSession(customerId: number) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000)
  await prisma.shopSession.create({
    data: { tokenHash: hashSessionToken(token), customerId, expiresAt },
  })
  return token
}

export async function closeShopSession(token: string | undefined) {
  if (!token) return
  await prisma.shopSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } })
}

export async function registerShopAccount(input: {
  name: string
  email: string
  password: string
  phone: string | null
}) {
  const company = await prisma.company.findFirst({ orderBy: { id: 'asc' } })
  if (!company) throw new AppError(500, 'The shop is not set up yet.')
  const existing = await prisma.shopCustomer.findUnique({
    where: { companyId_email: { companyId: company.id, email: input.email } },
  })
  if (existing) throw new AppError(409, 'An account with that email already exists.')
  const contact = await prisma.contact.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      isCustomer: true,
      city: company.city,
      companyId: company.id,
    },
  })
  const customer = await prisma.shopCustomer.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash: await hashPassword(input.password),
      contactId: contact.id,
      companyId: company.id,
    },
  })
  const token = await openShopSession(customer.id)
  return { token, account: toAccount(customer) }
}

export async function loginShopAccount(email: string, password: string) {
  const company = await prisma.company.findFirst({ orderBy: { id: 'asc' } })
  const customer = company
    ? await prisma.shopCustomer.findFirst({ where: { email, companyId: company.id } })
    : null
  const matches = await passwordMatches(password, customer?.passwordHash ?? null)
  if (!customer || !matches) throw new AppError(401, 'Email or password is wrong.')
  const token = await openShopSession(customer.id)
  return { token, account: toAccount(customer) }
}

function toAccount(customer: ShopAccount): ShopAccount {
  return {
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    contactId: customer.contactId,
    companyId: customer.companyId,
  }
}
