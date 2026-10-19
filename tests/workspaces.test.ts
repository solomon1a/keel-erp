import { describe, expect, it } from 'vitest'
import { findDeskScreen } from '../shared/desk-screens.ts'
import { appModules } from '../src/lib/modules.ts'
import { workspaceFor, workspaceLinks, type WsLabel } from '../src/lib/workspaces.ts'

const roots = ['/desk', '/orders', '/products', '/contacts', '/purchases', '/vendors', '/inventory', '/manufacturing', '/boms', '/pos', '/website', '/shop', '/accounting', '/crm', '/hr', '/go', '/assets', '/subcontracting', '/quality', '/projects', '/email', '/sites', '/site', '/sales', '/helpdesk']

function pathOk(to: string) {
  const path = to.split('?')[0] ?? ''
  const match = path.match(/^\/app\/([^/]+)\/([^/]+)$/)
  if (match) {
    const screen = findDeskScreen(match[1] ?? '', match[2] ?? '')
    return screen != null && screen.kind !== 'list' && screen.kind !== 'report'
  }
  return roots.some((root) => path === root || path.startsWith(`${root}/`))
}

function comingSoon(to: string) {
  const path = to.split('?')[0] ?? ''
  const match = path.match(/^\/app\/([^/]+)\/([^/]+)$/)
  if (!match) return false
  const screen = findDeskScreen(match[1] ?? '', match[2] ?? '')
  return screen?.kind === 'list' || screen?.kind === 'report'
}

function title(label: WsLabel) {
  return typeof label === 'string' ? label : label.en
}

describe('workspaces', () => {
  it('keeps charts and only links a real page', () => {
    for (const mod of appModules) {
      const workspace = workspaceFor(mod.id)
      expect(workspace, mod.id).toBeTruthy()
      if (!workspace) continue
      expect(workspace.chart, mod.id).toHaveLength(12)
      expect(workspace.sidebar[0]?.to, mod.id).toBe(`/go/${mod.id}`)
      for (const link of workspaceLinks(workspace)) {
        expect(comingSoon(link.to), `${mod.id} ${link.to}`).toBe(false)
        expect(pathOk(link.to), `${mod.id} ${link.to}`).toBe(true)
      }
    }
  })

  it('follows the manufacturing reference', () => {
    const workspace = workspaceFor('manufacturing')
    expect(workspace?.groups.map((group) => title(group.title))).toEqual(['Production', 'Bill of Materials', 'Subcontracting', 'hub.settings'])
    expect(workspace?.groups[0]?.links.map((link) => link.to)).toEqual(['/manufacturing', '/manufacturing/plan'])
    expect(workspace?.groups[1]?.links.map((link) => link.to)).toEqual(['/products', '/boms'])
    expect(workspace?.groups[2]?.links.map((link) => link.to)).toEqual(['/boms', '/subcontracting', '/subcontracting'])
    expect(workspace?.steps.map((step) => step.label.en)).toEqual([
      'Create Raw Material',
      'Create Finished Good',
      'Create Bill of Materials',
      'Create Work Order',
      'Review Manufacturing Settings',
    ])
    expect(workspace?.sidebar.map((item) => title(item.label))).toEqual([
      'ws.home',
      'ws.dashboard',
      'BOM',
      'Work Order',
      'ws.planning',
      'hub.settings',
    ])
  })
})
