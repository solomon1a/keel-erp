import { createHash, randomBytes } from 'node:crypto'
import type { Role } from '../../shared/roles.ts'
import { prisma, transactionOptions, type Tx } from '../db.ts'
import { AppError } from '../errors.ts'
import { ensureMembership } from './access.ts'
import { hashPassword } from '../auth.ts'
import { sendMail, type MailChannel } from './mailer.ts'

const inviteDays = 7

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function asRole(value: string): Role {
  switch (value) {
    case 'admin':
    case 'user':
      return value
    default:
      throw new AppError(500, 'This invite has an unknown role.')
  }
}

export type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired'

export function inviteStatus(row: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): InviteStatus {
  if (row.acceptedAt) return 'accepted'
  if (row.revokedAt) return 'revoked'
  if (row.expiresAt.getTime() <= now.getTime()) return 'expired'
  return 'pending'
}

function present(row: {
  id: number
  email: string
  role: string
  expiresAt: Date
  acceptedAt: Date | null
  revokedAt: Date | null
  createdAt: Date
  invitedBy?: { name: string } | null
}) {
  return {
    id: row.id,
    email: row.email,
    role: asRole(row.role),
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    invitedBy: row.invitedBy?.name ?? null,
    status: inviteStatus(row),
  }
}

async function issue(
  tx: Tx,
  companyId: number,
  invitedById: number,
  email: string,
  role: Role,
) {
  const existing = await tx.user.findUnique({ where: { email } })
  if (existing) throw new AppError(409, 'That email already has an account.')
  await tx.userInvite.updateMany({
    where: { companyId, email, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  })
  const token = randomBytes(32).toString('base64url')
  const invite = await tx.userInvite.create({
    data: {
      companyId,
      email,
      role,
      tokenHash: hashInviteToken(token),
      expiresAt: new Date(Date.now() + inviteDays * 24 * 60 * 60 * 1000),
      invitedById,
    },
    include: { invitedBy: { select: { name: true } }, company: { select: { name: true } } },
  })
  return { invite, token }
}

export async function listInvites(companyId: number) {
  const rows = await prisma.userInvite.findMany({
    where: { companyId },
    include: { invitedBy: { select: { name: true } } },
    orderBy: { id: 'desc' },
  })
  return rows.map(present)
}

export async function createInvite(companyId: number, invitedById: number, email: string, role: Role, origin: string) {
  const { invite, token } = await prisma.$transaction(
    (tx) => issue(tx, companyId, invitedById, email, role),
    transactionOptions,
  )
  const link = `${origin}/invite/${token}`
  const mailed = await deliver(invite.company.name, invite.invitedBy.name, invite.email, asRole(invite.role), link, invite.expiresAt)
  return { ...present(invite), link, ...mailed }
}

export async function resendInvite(companyId: number, inviteId: number, invitedById: number, origin: string) {
  const current = await prisma.userInvite.findFirst({ where: { id: inviteId, companyId } })
  if (!current) throw new AppError(404, 'Invite not found.')
  if (current.acceptedAt) throw new AppError(409, 'That invite was already accepted.')
  return createInvite(companyId, invitedById, current.email, asRole(current.role), origin)
}

export async function revokeInvite(companyId: number, inviteId: number) {
  const current = await prisma.userInvite.findFirst({ where: { id: inviteId, companyId } })
  if (!current) throw new AppError(404, 'Invite not found.')
  if (current.acceptedAt) throw new AppError(409, 'That invite was already accepted.')
  if (!current.revokedAt) {
    await prisma.userInvite.update({ where: { id: current.id }, data: { revokedAt: new Date() } })
  }
  const row = await prisma.userInvite.findFirstOrThrow({
    where: { id: current.id },
    include: { invitedBy: { select: { name: true } } },
  })
  return present(row)
}

export async function previewInvite(token: string) {
  const row = await prisma.userInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    include: { company: { select: { name: true } } },
  })
  if (!row) throw new AppError(404, 'Invite not found.')
  const status = inviteStatus(row)
  return {
    companyName: row.company.name,
    email: row.email,
    role: asRole(row.role),
    status,
    expired: status === 'expired',
    revoked: status === 'revoked',
    accepted: status === 'accepted',
  }
}

export async function acceptInvite(token: string, name: string, password: string) {
  const tokenHash = hashInviteToken(token)
  const userId = await prisma.$transaction(async (tx) => {
    const invite = await tx.userInvite.findUnique({ where: { tokenHash } })
    if (!invite) throw new AppError(404, 'Invite not found.')
    const status = inviteStatus(invite)
    switch (status) {
      case 'accepted':
        throw new AppError(409, 'That invite was already used.')
      case 'revoked':
        throw new AppError(409, 'That invite was revoked.')
      case 'expired':
        throw new AppError(409, 'That invite has expired.')
      case 'pending':
        break
      default: {
        const unexpected: never = status
        throw new AppError(500, unexpected)
      }
    }
    const taken = await tx.user.findUnique({ where: { email: invite.email } })
    if (taken) throw new AppError(409, 'That email already has an account.')
    const user = await tx.user.create({
      data: {
        name,
        email: invite.email,
        passwordHash: await hashPassword(password),
        role: invite.role,
        companyId: invite.companyId,
      },
    })
    await tx.userInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } })
    await ensureMembership(tx, { id: user.id, companyId: user.companyId, role: asRole(user.role) })
    return user.id
  }, transactionOptions)
  return userId
}

async function deliver(
  companyName: string,
  inviter: string,
  email: string,
  role: Role,
  link: string,
  expiresAt: Date,
): Promise<{ emailed: boolean; channel: MailChannel; mailError?: string }> {
  const roleLabel = role === 'admin' ? 'an admin' : 'a user'
  const text = [
    `${inviter} invited you to ${companyName} on Keel as ${roleLabel}.`,
    `Open this link to set your name and password. It expires on ${expiresAt.toISOString().slice(0, 10)}.`,
    '',
    link,
  ].join('\n')
  try {
    return await sendMail({ to: email, subject: `Join ${companyName} on Keel`, text })
  } catch (error) {
    console.error(`KEEL INVITE\n${link}`)
    const mailError = error instanceof Error ? error.message : 'The invite email could not be sent.'
    return { emailed: false, channel: 'log', mailError }
  }
}
