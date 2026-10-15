import { createHmac, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { parseRole, type Role } from '../shared/roles.ts'
import { prisma } from './db.ts'
import { AppError } from './errors.ts'

const passwordCost = 10
const sessionSeconds = 60 * 60 * 24 * 14
const dummyHash = bcrypt.hashSync('keel-missing-account', passwordCost)

export const sessionCookieName = 'keel_session'

export type SessionUser = {
  id: number
  name: string
  email: string
  role: Role
  companyId: number
  company: { id: number; name: string; city: string; currency: string; defaultTaxRate: number }
}

export type AppEnv = {
  Variables: {
    user: SessionUser
  }
}

const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  companyId: true,
  company: { select: { id: true, name: true, city: true, currency: true, defaultTaxRate: true } },
} as const

export function hashPassword(password: string) {
  return bcrypt.hash(password, passwordCost)
}

export async function passwordMatches(password: string, passwordHash: string | null) {
  const match = await bcrypt.compare(password, passwordHash ?? dummyHash)
  return Boolean(passwordHash) && match
}

export function requireAdmin(user: SessionUser) {
  if (user.role !== 'admin') {
    throw new AppError(403, 'Only an admin can do that.')
  }
}

const devSessionSecret = 'keel-dev-session-secret'

function sessionSecret() {
  const secret = process.env.SESSION_SECRET
  if (secret && secret.length >= 16) return secret
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL === '1') {
    throw new AppError(500, 'SESSION_SECRET is not set.')
  }
  return devSessionSecret
}

function tokenHash(token: string) {
  return createHmac('sha256', sessionSecret()).update(token).digest('hex')
}

export function hashSessionToken(token: string) {
  return tokenHash(token)
}

export function sessionCookieSecure() {
  return cookieIsSecure()
}

function cookieIsSecure() {
  return process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'
}

function toSessionUser(row: {
  id: number
  name: string
  email: string
  role: string
  companyId: number
  company: { id: number; name: string; city: string; currency: string; defaultTaxRate: number }
}): SessionUser {
  const role = parseRole(row.role)
  if (!role) throw new AppError(500, 'This account has an unknown role.')
  return { ...row, role }
}

export async function openSession(userId: number) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + sessionSeconds * 1000)
  await prisma.session.create({
    data: { tokenHash: tokenHash(token), userId, expiresAt },
  })
  return { token, maxAge: sessionSeconds }
}

export async function userFromToken(token: string | undefined) {
  if (!token) return null
  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { select: userSelect } },
  })
  if (!session) return null
  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.session.delete({ where: { id: session.id } })
    return null
  }
  return toSessionUser(session.user)
}

export async function closeSession(token: string | undefined) {
  if (!token) return
  await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } })
}

export async function closeUserSessions(userId: number) {
  await prisma.session.deleteMany({ where: { userId } })
}

export function readSessionToken(c: Context) {
  return getCookie(c, sessionCookieName)
}

export function writeSessionCookie(c: Context, token: string, maxAge: number) {
  setCookie(c, sessionCookieName, token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge,
    // Secure only on HTTPS. Local `npm run dev` stays http://127.0.0.1.
    secure: cookieIsSecure(),
  })
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, sessionCookieName, { path: '/', secure: cookieIsSecure() })
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
    select: { ...userSelect, passwordHash: true },
  })
}
