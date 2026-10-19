import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { verifyResendSignature } from '../server/services/inbound-signature.ts'

const key = Buffer.from('keel-test-secret')
const secret = `whsec_${key.toString('base64')}`
const payload = '{"from":"a@b.example","subject":"Hi","text":"Hello"}'
const now = Date.parse('2026-10-19T04:00:00.000Z')
const stamp = String(Math.floor(now / 1000))

function sign(body: string, id = 'msg_1', timestamp = stamp) {
  return createHmac('sha256', key).update(`${id}.${timestamp}.${body}`).digest('base64')
}

describe('Resend inbound signatures', () => {
  it('accepts a fresh v1 signature and rejects a stale, empty, or altered one', () => {
    const headers = { id: 'msg_1', timestamp: stamp, signature: `v1,${sign(payload)}` }
    expect(verifyResendSignature(payload, headers, secret, now)).toBe(true)
    expect(verifyResendSignature(payload, headers, secret, now + 6 * 60 * 1000)).toBe(false)
    expect(verifyResendSignature(`${payload} `, headers, secret, now)).toBe(false)
    expect(verifyResendSignature(payload, { ...headers, signature: 'v1,not-the-signature' }, secret, now)).toBe(false)
    expect(verifyResendSignature(payload, { id: 'msg_1', timestamp: stamp, signature: '' }, secret, now)).toBe(false)
  })
})
