import { roundMoney } from '../src/domain/money.ts'

export type TaxKind = 'percent' | 'fixed'

export type EngineTax = {
  id: number
  name: string
  kind: TaxKind
  amount: number
  priceInclude: boolean
  compound: boolean
  withholding: boolean
  sequence: number
}

export type TaxSlice = {
  taxId: number
  name: string
  base: number
  amount: number
  withheld: boolean
}

export type TaxResult = {
  net: number
  added: number
  withheld: number
  total: number
  slices: TaxSlice[]
}

function kindOf(value: string): TaxKind {
  switch (value) {
    case 'percent':
    case 'fixed':
      return value
    default:
      return 'percent'
  }
}

export function asTaxKind(value: string): TaxKind {
  return kindOf(value)
}

/**
 * Country-neutral tax on one base.
 * Exclusive percent adds to the base. Inclusive percent is pulled out of a gross price.
 * A compound tax uses the running total (tax on tax). Withholding is recorded and
 * subtracted from the amount due; it is not added to the goods total.
 */
export function computeTaxes(base: number, quantity: number, taxes: EngineTax[]): TaxResult {
  const ordered = [...taxes].sort((a, b) => a.sequence - b.sequence || a.id - b.id)
  const slices: TaxSlice[] = []
  let added = 0
  let withheld = 0
  let net = roundMoney(base)
  for (const tax of ordered) {
    const running = tax.compound ? roundMoney(net + added) : net
    let amount = 0
    let sliceBase = running
    switch (tax.kind) {
      case 'percent':
        if (tax.priceInclude && !tax.compound) {
          const gross = roundMoney(base)
          amount = roundMoney(gross - gross / (1 + tax.amount / 100))
          sliceBase = roundMoney(gross - amount)
          net = sliceBase
        } else {
          amount = roundMoney(running * (tax.amount / 100))
        }
        break
      case 'fixed':
        amount = roundMoney(tax.amount * (quantity > 0 ? quantity : 1))
        break
      default: {
        const unexpected: never = tax.kind
        throw new Error(unexpected)
      }
    }
    if (tax.withholding) withheld = roundMoney(withheld + amount)
    else added = roundMoney(added + amount)
    slices.push({ taxId: tax.id, name: tax.name, base: sliceBase, amount, withheld: tax.withholding })
  }
  return {
    net,
    added,
    withheld,
    total: roundMoney(net + added - withheld),
    slices,
  }
}

export function mapTaxes(taxes: EngineTax[], maps: Array<{ taxId: number; replacementId: number | null }>): EngineTax[] {
  const byId = new Map(taxes.map((tax) => [tax.id, tax]))
  const next: EngineTax[] = []
  for (const tax of taxes) {
    const map = maps.find((row) => row.taxId === tax.id)
    if (!map) {
      next.push(tax)
      continue
    }
    if (map.replacementId == null) continue
    const replacement = byId.get(map.replacementId)
    if (replacement) next.push(replacement)
  }
  return next
}

export { kindOf }
