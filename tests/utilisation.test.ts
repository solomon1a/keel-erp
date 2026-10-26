import { describe, expect, it } from 'vitest'
import { stationUtilisation } from '../src/domain/utilisation.ts'

const stitchDays = [
  ['2025-12-10', 265],
  ['2026-02-10', 295],
  ['2026-04-10', 250],
  ['2026-06-10', 280],
  ['2026-08-10', 310],
  ['2026-10-10', 265],
] as const

describe('work center utilisation', () => {
  it('schedules one shift per logged day instead of one day for the whole history', () => {
    const logs = stitchDays.map(([day, minutes]) => ({
      minutes,
      startedAt: new Date(`${day}T00:00:00.000Z`),
    }))
    const logged = logs.reduce((sum, log) => sum + log.minutes, 0)
    const oneDay = Math.round((logged / 480) * 1000) / 10
    expect(logged).toBe(1665)
    expect(oneDay).toBe(346.9)

    const measured = stationUtilisation(8, logs)
    expect(measured).toMatchObject({ loggedMinutes: 1665, scheduledMinutes: 2880, utilisation: 57.8 })
    expect(measured.utilisation).toBeGreaterThanOrEqual(40)
    expect(measured.utilisation).toBeLessThanOrEqual(95)
  })

  it('keeps several logs on the same shift against that one shift', () => {
    const logs = [40, 70, 100, 55].map((minutes) => ({
      minutes,
      startedAt: new Date('2026-08-10T00:00:00.000Z'),
    }))
    expect(stationUtilisation(8, logs)).toMatchObject({
      loggedMinutes: 265,
      scheduledMinutes: 480,
      utilisation: 55.2,
    })
  })

  it('counts an undated log as one shift and ignores an open clock with no minutes', () => {
    expect(stationUtilisation(8, [
      { minutes: 400, startedAt: null },
      { minutes: 0, startedAt: new Date('2026-10-26T01:07:12.936Z') },
    ])).toMatchObject({ loggedMinutes: 400, scheduledMinutes: 480, utilisation: 83.3 })

    expect(stationUtilisation(6, [
      { minutes: 300, startedAt: new Date('2026-10-25T17:32:01.640Z') },
    ])).toMatchObject({ loggedMinutes: 300, scheduledMinutes: 360, utilisation: 83.3 })

    expect(stationUtilisation(8, [
      { minutes: 30 },
      { minutes: 360, startedAt: new Date('2026-10-25T15:32:01.695Z') },
    ])).toMatchObject({ loggedMinutes: 390, scheduledMinutes: 480, utilisation: 81.3 })
  })

  it('reports nothing scheduled when no time has been logged', () => {
    expect(stationUtilisation(8, [])).toEqual({ scheduledMinutes: 0, loggedMinutes: 0, utilisation: 0 })
    expect(stationUtilisation(8, [{ minutes: 0, startedAt: new Date('2026-10-10T00:00:00.000Z') }])).toEqual({
      scheduledMinutes: 0,
      loggedMinutes: 0,
      utilisation: 0,
    })
  })
})
