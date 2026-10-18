export {
  convertFromBase,
  defaultRateRows,
  demoRate,
  displayCurrencies,
  formatRate,
  rateFor,
  type RateRow,
} from '../../shared/exchange.ts'

export function displayStorageKey(userId: number) {
  return `keel-display-currency:${userId}`
}

export function readStoredDisplay(userId: number | undefined) {
  if (!userId || typeof localStorage === 'undefined') return null
  try {
    const value = localStorage.getItem(displayStorageKey(userId))
    return value && /^[A-Z]{3}$/.test(value) ? value : null
  } catch {
    return null
  }
}

export function writeStoredDisplay(userId: number, currency: string) {
  try {
    localStorage.setItem(displayStorageKey(userId), currency)
  } catch {
    // A private window can refuse storage. The database preference still applies.
  }
}
