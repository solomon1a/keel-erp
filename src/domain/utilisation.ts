function roundMinutes(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000
}

export type UtilisationLog = {
  minutes: number
  startedAt?: Date | string | null
}

/**
 * Work-center utilisation for a report.
 * Scheduled minutes are one shift (capacity hours) for each distinct day that has logged time.
 * Comparing the whole history with a single shift treats six days of stitch time as 346.9% of one day.
 * OEE stays on one scheduled day; this ratio does not.
 */
export function stationUtilisation(capacityHours: number, logs: UtilisationLog[]) {
  let logged = 0
  const days = new Set<string>()
  for (const log of logs) {
    const minutes = Number.isFinite(log.minutes) ? Math.max(0, log.minutes) : 0
    logged += minutes
    if (minutes <= 0 || log.startedAt == null) continue
    const started = log.startedAt instanceof Date ? log.startedAt : new Date(log.startedAt)
    if (Number.isNaN(started.getTime())) continue
    days.add(started.toISOString().slice(0, 10))
  }
  logged = roundMinutes(logged)
  const daily = roundMinutes(Math.max(0, capacityHours) * 60)
  const shifts = days.size > 0 ? days.size : logged > 0 ? 1 : 0
  const scheduled = roundMinutes(shifts * daily)
  const utilisation = scheduled > 0 ? Math.round((logged / scheduled) * 1000) / 10 : 0
  return { scheduledMinutes: scheduled, loggedMinutes: logged, utilisation }
}
