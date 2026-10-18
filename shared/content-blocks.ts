export type MailBlock =
  | { type: 'heading'; text: string }
  | { type: 'text'; text: string }
  | { type: 'image'; url: string; alt: string }
  | { type: 'button'; label: string; href: string }
  | { type: 'columns'; left: string; right: string }
  | { type: 'divider' }
  | { type: 'product'; productId: number }

export type FeatureItem = { title: string; text: string }
export type QuoteItem = { quote: string; name: string }
export type PriceItem = { name: string; price: string; text: string }

export type SiteBlock =
  | { id: string; type: 'hero'; title: string; subtitle: string; button: string; href: string }
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; url: string; alt: string }
  | { id: string; type: 'features'; items: FeatureItem[] }
  | { id: string; type: 'testimonials'; items: QuoteItem[] }
  | { id: string; type: 'pricing'; items: PriceItem[] }
  | { id: string; type: 'cta'; title: string; button: string; href: string }
  | { id: string; type: 'contact' }
  | { id: string; type: 'products' }
  | { id: string; type: 'blog' }

function text(value: unknown) {
  return typeof value === 'string' ? value : ''
}

function numberId(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function asMailBlocks(value: unknown): MailBlock[] {
  if (!Array.isArray(value)) return []
  const blocks: MailBlock[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const block = row as { type?: unknown; text?: unknown; url?: unknown; alt?: unknown; label?: unknown; href?: unknown; left?: unknown; right?: unknown; productId?: unknown }
    switch (block.type) {
      case 'heading':
        blocks.push({ type: 'heading', text: text(block.text) })
        break
      case 'text':
        blocks.push({ type: 'text', text: text(block.text) })
        break
      case 'image':
        blocks.push({ type: 'image', url: text(block.url), alt: text(block.alt) })
        break
      case 'button':
        blocks.push({ type: 'button', label: text(block.label), href: text(block.href) })
        break
      case 'columns':
        blocks.push({ type: 'columns', left: text(block.left), right: text(block.right) })
        break
      case 'divider':
        blocks.push({ type: 'divider' })
        break
      case 'product':
        blocks.push({ type: 'product', productId: numberId(block.productId) })
        break
      default:
        break
    }
  }
  return blocks
}

function items<T>(value: unknown, map: (row: Record<string, unknown>) => T): T[] {
  if (!Array.isArray(value)) return []
  return value.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object').map(map)
}

export function asSiteBlocks(value: unknown): SiteBlock[] {
  if (!Array.isArray(value)) return []
  const blocks: SiteBlock[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const block = row as Record<string, unknown>
    const id = text(block.id) || `b${blocks.length + 1}`
    switch (block.type) {
      case 'hero':
        blocks.push({ id, type: 'hero', title: text(block.title), subtitle: text(block.subtitle), button: text(block.button), href: text(block.href) })
        break
      case 'text':
        blocks.push({ id, type: 'text', text: text(block.text) })
        break
      case 'image':
        blocks.push({ id, type: 'image', url: text(block.url), alt: text(block.alt) })
        break
      case 'features':
        blocks.push({
          id,
          type: 'features',
          items: items(block.items, (item) => ({ title: text(item.title), text: text(item.text) })),
        })
        break
      case 'testimonials':
        blocks.push({
          id,
          type: 'testimonials',
          items: items(block.items, (item) => ({ quote: text(item.quote), name: text(item.name) })),
        })
        break
      case 'pricing':
        blocks.push({
          id,
          type: 'pricing',
          items: items(block.items, (item) => ({ name: text(item.name), price: text(item.price), text: text(item.text) })),
        })
        break
      case 'cta':
        blocks.push({ id, type: 'cta', title: text(block.title), button: text(block.button), href: text(block.href) })
        break
      case 'contact':
        blocks.push({ id, type: 'contact' })
        break
      case 'products':
        blocks.push({ id, type: 'products' })
        break
      case 'blog':
        blocks.push({ id, type: 'blog' })
        break
      default:
        break
    }
  }
  return blocks
}

export function slugify(value: string) {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48)
  return slug || 'page'
}
