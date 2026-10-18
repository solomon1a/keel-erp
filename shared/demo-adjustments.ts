import { roundMoney } from '../src/domain/money.ts'
import { depreciationSchedule, type DepreciationMethod } from './depreciation.ts'

export const jiangbeiDepreciationAsOf = '2026-04-30'

export const jiangbeiAssets = [
  {
    name: 'Cutting table',
    method: 'straight_line' as DepreciationMethod,
    cost: 12000,
    salvage: 1200,
    months: 60,
    start: '2026-01-31',
  },
  {
    name: 'Shop counter',
    method: 'declining' as DepreciationMethod,
    cost: 4800,
    salvage: 0,
    months: 36,
    start: '2026-02-28',
  },
] as const

export function jiangbeiDepreciationTotal(asOf = jiangbeiDepreciationAsOf) {
  let total = 0
  for (const asset of jiangbeiAssets) {
    for (const slot of depreciationSchedule(asset)) {
      if (slot.date <= asOf) total = roundMoney(total + slot.amount)
    }
  }
  return total
}

/** A partial dye subcontract already on the Jiangbei books. Fee is capitalized; profit is unchanged. */
export const jiangbeiSubcontractBooks = {
  order: 'SC-DYE-1',
  componentSku: 'DYE-GREIGE',
  finishedSku: 'DYE-ROLL',
  vendor: 'Suhang Weaving',
  ordered: 4,
  sent: 6,
  received: 2,
  perUnit: 2,
  componentCost: 8,
  feeEach: 10,
  fee: 20,
  tax: 2.6,
  payable: 22.6,
  assetIncrease: 20,
  liabilityIncrease: 20,
  inputVat: 2.6,
} as const
