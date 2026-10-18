import { describe, expect, it } from 'vitest'
import { findDeskScreen } from '../shared/desk-screens.ts'
import { appModules } from '../src/lib/modules.ts'
import { workspaceFor, workspaceLinks, workspaces, type WsLabel } from '../src/lib/workspaces.ts'

const roots = ['/desk', '/orders', '/products', '/contacts', '/purchases', '/vendors', '/inventory', '/manufacturing', '/boms', '/pos', '/website', '/shop', '/accounting', '/crm', '/hr', '/go', '/assets', '/subcontracting', '/quality', '/projects']

function pathOk(to: string) {
  const path = to.split('?')[0] ?? ''
  const match = path.match(/^\/app\/([^/]+)\/([^/]+)$/)
  if (match) return findDeskScreen(match[1] ?? '', match[2] ?? '') != null
  return roots.some((root) => path === root || path.startsWith(`${root}/`))
}

function title(label: WsLabel) {
  return typeof label === 'string' ? label : label.en
}

describe('workspaces', () => {
  it('gives every app a chart, shortcut cards, masters, and a checklist', () => {
    for (const mod of appModules) {
      const workspace = workspaceFor(mod.id)
      expect(workspace, mod.id).toBeTruthy()
      if (!workspace) continue
      expect(workspace.chart).toHaveLength(12)
      expect(workspace.kpis.length).toBeGreaterThanOrEqual(3)
      expect(workspace.groups.length).toBeGreaterThanOrEqual(3)
      expect(workspace.steps.length).toBeGreaterThanOrEqual(4)
      expect(workspace.sidebar[0]?.to).toBe(`/go/${mod.id}`)
      for (const link of workspaceLinks(workspace)) expect(pathOk(link.to), `${mod.id} ${link.to}`).toBe(true)
    }
  })

  it('gives assets, projects, quality, subcontracting, and helpdesk a full card grid', () => {
    for (const id of ['assets', 'projects', 'quality', 'subcontracting', 'helpdesk']) {
      const workspace = workspaceFor(id)
      expect(workspace, id).toBeTruthy()
      if (!workspace) continue
      expect(workspace.groups.length).toBeGreaterThanOrEqual(4)
      expect(workspace.groups.reduce((count, group) => count + group.links.length, 0)).toBeGreaterThanOrEqual(12)
      expect(workspace.steps.length).toBeGreaterThanOrEqual(6)
      expect(workspace.sidebar.some((item) => item.to === `/app/${id}/dashboard`)).toBe(true)
    }
  })

  it('follows the manufacturing reference', () => {
    const workspace = workspaces.manufacturing
    expect(workspace?.groups.map((group) => title(group.title))).toEqual(['Production', 'Bill of Materials', 'Subcontracting', 'hub.reports', 'ws.tools', 'hub.settings'])
    expect(workspace?.groups[0]?.links.map((link) => link.to)).toEqual([
      '/manufacturing',
      '/app/manufacturing/production-plan',
      '/app/manufacturing/stock-entry',
      '/app/manufacturing/job-card',
      '/app/manufacturing/lead-time',
      '/app/manufacturing/mps',
      '/app/manufacturing/downtime',
      '/app/manufacturing/forecast',
    ])
    expect(workspace?.steps.map((step) => step.label.en)).toEqual([
      'Create Raw Material',
      'Create Finished Good',
      'Create Operation',
      'Create Bill of Materials',
      'Create Work Order',
      'View Work Order Summary',
      'Review Manufacturing Settings',
    ])
    expect(workspace?.sidebar.map((item) => title(item.label))).toEqual([
      'ws.home',
      'ws.dashboard',
      'BOM',
      'Work Order',
      'desk.s.manufacturing.job-card',
      'desk.s.manufacturing.stock-entry',
      'ws.planning',
      'ws.tools',
      'menu.reporting',
      'ws.setup',
      'hub.settings',
    ])
  })
})
