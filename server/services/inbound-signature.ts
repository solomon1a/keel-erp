import { createHmac, timingSafeEqual } from 'node:crypto'

const toleranceMs = 5 * 60 * 1000

export function verifyResendSignature(
  payload: string,
  headers: { id?: string | null; timestamp?: string | null; signature?: string | null },
  secret: string,
  now = Date.now(),
) {
  const id = headers.id?.trim()
  const timestamp = headers.timestamp?.trim()
  const signature = headers.signature?.trim()
  if (!id || !timestamp || !signature || !secret.trim()) return false
  const seconds = Number(timestamp)
  if (!Number.isFinite(seconds)) return false
  if (Math.abs(now - seconds * 1000) > toleranceMs) return false
  const raw = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const key = Buffer.from(raw, 'base64')
  if (key.length === 0) return false
  const expected = createHmac('sha256', key).update(`${id}.${timestamp}.${payload}`).digest('base64')
  const expectedBuf = Buffer.from(expected)
  return signature.split(' ').some((part) => {
    const value = part.startsWith('v1,') ? part.slice(3) : part
    const got = Buffer.from(value)
    if (got.length !== expectedBuf.length) return false
    return timingSafeEqual(got, expectedBuf)
  })
}
