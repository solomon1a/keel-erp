import type { Translate } from './locale.tsx'

export function orderStateLabel(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('state.draft')
    case 'sent':
      return t('state.sent')
    case 'sale':
      return t('state.sale')
    case 'done':
      return t('state.done')
    case 'cancel':
      return t('state.cancel')
    default:
      return state
  }
}

export function purchaseStateLabel(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('poState.draft')
    case 'sent':
      return t('poState.sent')
    case 'purchase':
      return t('poState.purchase')
    case 'done':
      return t('poState.done')
    case 'cancel':
      return t('poState.cancel')
    default:
      return state
  }
}

export function manufacturingStateLabel(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('moState.draft')
    case 'confirmed':
      return t('moState.confirmed')
    case 'progress':
      return t('moState.progress')
    case 'done':
      return t('moState.done')
    case 'cancel':
      return t('moState.cancel')
    default:
      return state
  }
}

export function productKindLabel(kind: string, t: Translate) {
  switch (kind) {
    case 'finished':
      return t('kind.finished')
    case 'raw':
      return t('kind.raw')
    default:
      return kind
  }
}

export function transferStateLabel(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('trState.draft')
    case 'ready':
      return t('trState.ready')
    case 'done':
      return t('trState.done')
    case 'cancel':
      return t('trState.cancel')
    default:
      return state
  }
}

export function posSessionLabel(state: string, t: Translate) {
  switch (state) {
    case 'open':
      return t('pos.stateOpen')
    case 'closed':
      return t('pos.stateClosed')
    default:
      return state
  }
}

export function posOrderLabel(state: string, t: Translate) {
  switch (state) {
    case 'paid':
      return t('pos.statePaid')
    case 'partial':
      return t('pos.statePartial')
    case 'refunded':
      return t('pos.stateRefunded')
    default:
      return state
  }
}

export function payMethodLabel(method: string, t: Translate) {
  switch (method) {
    case 'cash':
      return t('pos.methodCash')
    case 'card':
      return t('pos.methodCard')
    case 'wechat':
      return t('pos.methodWechat')
    case 'alipay':
      return t('pos.methodAlipay')
    default:
      return method
  }
}

export function moveStateLabel(state: string, t: Translate) {
  switch (state) {
    case 'draft':
      return t('move.draft')
    case 'done':
      return t('move.done')
    case 'cancel':
      return t('move.cancel')
    default:
      return state
  }
}

export function locationLabel(type: string | undefined, fallback: string, t: Translate) {
  switch (type) {
    case 'internal':
      return fallback
    case 'customer':
      return t('loc.customer')
    case 'supplier':
      return t('loc.supplier')
    case 'inventory':
      return t('loc.inventory')
    case 'production':
      return t('loc.production')
    default:
      return fallback
  }
}

export function countryLabel(code: string, fallback: string, t: Translate) {
  switch (code) {
    case 'CN':
      return t('country.CN')
    case 'US':
      return t('country.US')
    case 'CA':
      return t('country.CA')
    case 'GB':
      return t('country.GB')
    case 'DE':
      return t('country.DE')
    case 'JP':
      return t('country.JP')
    case 'MX':
      return t('country.MX')
    default:
      return fallback
  }
}

export function singleTaxRate(rates: Array<number | null | undefined>) {
  const present = [...new Set(rates.filter((rate): rate is number => typeof rate === 'number'))]
  return present.length === 1 ? present[0] : null
}
