type Entry = { at: number; value: unknown }

const store = new Map<string, Entry>()

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  if (process.env.VITEST) return load()
  const hit = store.get(key)
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T
  const value = await load()
  store.set(key, { at: Date.now(), value })
  return value
}
