import { describe, expect, it } from 'vitest'
import { demoClockStale, demoTicketTimes } from '../server/services/demo-sla.ts'
import { slaClockParts } from '../src/lib/sla-clock.ts'

const hour = 3_600_000

describe('SLA clock', () => {
  it('formats a few hours, a day-plus, and an overdue ticket without a raw hour dump', () => {
    expect(slaClockParts(6 * hour + 12 * 60_000)).toEqual({ tone: 'left', style: 'hours', hours: 6, minutes: 12 })
    expect(slaClockParts(40 * 60_000)).toEqual({ tone: 'left', style: 'hours', hours: 0, minutes: 40 })
    expect(slaClockParts(48 * hour)).toEqual({ tone: 'left', style: 'hours', hours: 48, minutes: 0 })
    expect(slaClockParts(49 * hour + 30 * 60_000)).toEqual({ tone: 'left', style: 'days', days: 2, hours: 1 })
    expect(slaClockParts(-(3 * hour + 5 * 60_000))).toEqual({ tone: 'overdue', hours: 3, minutes: 5 })
    expect(slaClockParts(-(200 * hour))).toEqual({ tone: 'overdue', hours: 200, minutes: 0 })
  })

  it('treats 2020 and 2099 deadlines as stale and keeps a same-day window fresh', () => {
    const now = new Date('2026-10-19T04:00:00.000Z')
    expect(demoClockStale(now, new Date('2099-01-01T00:00:00.000Z'), now)).toBe(true)
    expect(demoClockStale(now, new Date('2020-01-01T00:00:00.000Z'), now)).toBe(true)
    expect(demoClockStale(new Date(now.getTime() - 18 * hour), new Date(now.getTime() + 6 * hour), now)).toBe(false)
    const fresh = demoTicketTimes('HD0003', now)
    expect(fresh).toBeTruthy()
    expect((fresh?.slaDeadline.getTime() ?? 0) - now.getTime()).toBe(40 * 60_000)
  })
})
