export type CartLine = {
  productId: number
  name: string
  unitPrice: number
  quantity: number
}

const storageKey = 'keel_shop_cart'

export function readCart(): CartLine[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) ?? '[]') as CartLine[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter((line) => line && line.productId && line.quantity > 0)
  } catch {
    return []
  }
}

export function writeCart(lines: CartLine[]) {
  localStorage.setItem(storageKey, JSON.stringify(lines))
  window.dispatchEvent(new Event('keel-cart'))
}

export function addToCart(line: CartLine) {
  const lines = readCart()
  const existing = lines.find((row) => row.productId === line.productId)
  if (existing) existing.quantity += line.quantity
  else lines.push(line)
  writeCart(lines)
}

export function cartCount(lines: CartLine[]) {
  return lines.reduce((sum, line) => sum + line.quantity, 0)
}
