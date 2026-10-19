/** Open Jiangbei demo tickets. Offsets are from the moment the clock is applied. */
const hour = 3_600_000

export const demoOpenClocks: Record<string, { createdOffsetMs: number; deadlineOffsetMs: number }> = {
  HD0001: { createdOffsetMs: -11 * hour, deadlineOffsetMs: -3 * hour },
  HD0002: { createdOffsetMs: -18 * hour, deadlineOffsetMs: 6 * hour },
  HD0003: { createdOffsetMs: -(4 * hour - 40 * 60_000), deadlineOffsetMs: 40 * 60_000 },
  HD0007: { createdOffsetMs: -30 * hour, deadlineOffsetMs: -6 * hour },
  HD0008: { createdOffsetMs: -52 * hour, deadlineOffsetMs: 20 * hour },
  HD0009: { createdOffsetMs: -26 * hour, deadlineOffsetMs: -2 * hour },
}

const week = 7 * 24 * hour

export function demoTicketTimes(number: string, now = new Date()) {
  const clock = demoOpenClocks[number]
  if (!clock) return null
  return {
    createdAt: new Date(now.getTime() + clock.createdOffsetMs),
    slaDeadline: new Date(now.getTime() + clock.deadlineOffsetMs),
  }
}

/** A stored clock is stale when it would show a multi-day countdown or a ticket opened weeks ago. */
export function demoClockStale(createdAt: Date, deadline: Date | null, now = new Date()) {
  if (!deadline) return true
  const span = deadline.getTime() - now.getTime()
  const age = now.getTime() - createdAt.getTime()
  return span > week || span < -week || age > 14 * 24 * hour
}
