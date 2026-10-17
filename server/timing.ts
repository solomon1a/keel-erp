import { AsyncLocalStorage } from 'node:async_hooks'

export type QueryTiming = {
  queries: number
  dbMs: number
}

const storage = new AsyncLocalStorage<QueryTiming>()

export function noteQuery(ms: number) {
  const current = storage.getStore()
  if (!current) return
  current.queries += 1
  current.dbMs += ms
}

export function startQueryTiming() {
  const bucket: QueryTiming = { queries: 0, dbMs: 0 }
  return {
    bucket,
    run<T>(task: () => Promise<T>) {
      return storage.run(bucket, task)
    },
  }
}
