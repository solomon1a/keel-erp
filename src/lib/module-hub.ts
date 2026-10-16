import type { AppModule } from './modules.ts'

export type HubTile = {
  key: string
  label: string
  to: string
}

const categoryGroups = new Set(['menu.reporting', 'desk.g.configuration'])

function isSettings(label: string) {
  return label.endsWith('.settings')
}

export function segmentPath(moduleId: string, label: string) {
  return `/go/${moduleId}/${encodeURIComponent(label)}`
}

function pageTile(label: string, to: string, key = label): HubTile {
  return { key, label, to }
}

function remainderTiles(moduleId: string, groupLabel: string, children: { label: string; to: string }[]): HubTile[] {
  if (children.length === 1) {
    const only = children[0]
    if (!only) return []
    return [pageTile(only.label, only.to)]
  }
  if (children.length > 1) return [pageTile(groupLabel, segmentPath(moduleId, groupLabel))]
  return []
}

/** Tiles for the screen that opens when someone picks an app from the launcher. */
export function hubTiles(mod: AppModule): HubTile[] {
  const tiles: HubTile[] = []
  for (const entry of mod.menu) {
    const children = entry.children ?? []
    if (children.length === 0) {
      if (entry.to) tiles.push(pageTile(entry.label === 'menu.reporting' ? 'hub.reports' : entry.label, entry.to, entry.label))
      continue
    }
    if (!categoryGroups.has(entry.label)) {
      for (const child of children) tiles.push(pageTile(child.label, child.to, `${entry.label}:${child.label}`))
      continue
    }
    if (entry.label === 'desk.g.configuration') {
      for (const child of children) {
        if (isSettings(child.label)) tiles.push(pageTile('hub.settings', child.to, child.label))
      }
      tiles.push(...remainderTiles(mod.id, entry.label, children.filter((child) => !isSettings(child.label))))
      continue
    }
    if (entry.label !== 'menu.reporting') continue
    if (children.length === 1) {
      const only = children[0]
      if (only) tiles.push(pageTile('hub.reports', only.to, entry.label))
      continue
    }
    tiles.push(pageTile('hub.reports', segmentPath(mod.id, entry.label), entry.label))
  }
  return tiles
}

/** A second tile grid, used when a section is itself a list of pages. */
export function segmentTiles(mod: AppModule, segment: string): { title: string; tiles: HubTile[] } | null {
  const entry = mod.menu.find((item) => item.label === segment)
  if (!entry?.children?.length) return null
  const children = entry.label === 'desk.g.configuration' ? entry.children.filter((child) => !isSettings(child.label)) : entry.children
  if (children.length < 2) return null
  return {
    title: entry.label === 'menu.reporting' ? 'hub.reports' : entry.label,
    tiles: children.map((child) => pageTile(child.label, child.to)),
  }
}
