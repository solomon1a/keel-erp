const hits = new Map<string, number[]>()
const windowMs = 60 * 60 * 1000
const maxHits = 5

export function clientKey(forwardedFor: string | undefined) {
  const forwarded = forwardedFor?.split(',')[0]?.trim()
  if (!forwarded) return 'local'
  return forwarded.slice(0, 80)
}

export function signupAllowed(key: string, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs)
  if (recent.length >= maxHits) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  return true
}

/** Test helper: fill the bucket so the next signup from this key is refused. */
export function primeSignupLimit(key: string, count: number, now = Date.now()) {
  hits.set(
    key,
    Array.from({ length: count }, () => now),
  )
}
