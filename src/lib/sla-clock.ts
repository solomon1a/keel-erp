const hour = 3_600_000
const minute = 60_000

export type SlaClock =
  | { tone: 'left'; style: 'days'; days: number; hours: number }
  | { tone: 'left'; style: 'hours'; hours: number; minutes: number }
  | { tone: 'overdue'; hours: number; minutes: number }

export function slaClockParts(ms: number): SlaClock {
  const totalMinutes = Math.floor(Math.abs(ms) / minute)
  if (ms < 0) {
    return { tone: 'overdue', hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
  }
  if (ms > 48 * hour) {
    const days = Math.floor(totalMinutes / (60 * 24))
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
    return { tone: 'left', style: 'days', days, hours }
  }
  return { tone: 'left', style: 'hours', hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 }
}
