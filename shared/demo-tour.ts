export const demoStepIds = ['lead', 'confirm', 'purchase', 'make', 'wastage', 'deliver', 'books', 'dashboard'] as const

export type DemoStepId = (typeof demoStepIds)[number]

export type DemoRunStatus = 'active' | 'done' | 'skipped'

export type DemoRunView = {
  id: number
  step: number
  status: DemoRunStatus
  serial: number
  leadId: number | null
  quotationId: number | null
  salesOrderId: number | null
  purchaseOrderId: number | null
  manufacturingOrderId: number | null
  invoiceId: number | null
  finishedId: number | null
  componentId: number | null
  note: string | null
  productName: string
  materialName: string
  quantity: number
}

export type DemoTourState = {
  available: boolean
  steps: readonly DemoStepId[]
  run: DemoRunView | null
  blocked?: boolean
}

export function demoStepId(step: number): DemoStepId | null {
  return demoStepIds[step] ?? null
}

export function demoPath(run: Pick<DemoRunView, 'step' | 'leadId' | 'salesOrderId' | 'purchaseOrderId' | 'manufacturingOrderId'>): string {
  const step = demoStepId(run.step) ?? 'lead'
  switch (step) {
    case 'lead':
      return run.leadId ? `/crm/${run.leadId}` : '/crm'
    case 'confirm':
    case 'deliver':
      return run.salesOrderId ? `/orders/${run.salesOrderId}` : '/orders'
    case 'purchase':
      return run.purchaseOrderId ? `/purchases/${run.purchaseOrderId}` : '/purchases'
    case 'make':
      return run.manufacturingOrderId ? `/manufacturing/${run.manufacturingOrderId}` : '/manufacturing'
    case 'wastage':
      return '/manufacturing/wastage'
    case 'books':
      return '/accounting/reports'
    case 'dashboard':
      return '/go/dashboard'
    default: {
      const unexpected: never = step
      return unexpected
    }
  }
}

export function demoTarget(step: DemoStepId): string {
  switch (step) {
    case 'lead':
      return 'tour-lead'
    case 'confirm':
      return 'tour-confirm'
    case 'purchase':
      return 'tour-receive'
    case 'make':
      return 'tour-produce'
    case 'wastage':
      return 'tour-wastage'
    case 'deliver':
      return 'tour-deliver'
    case 'books':
      return 'tour-profit'
    case 'dashboard':
      return 'tour-dashboard'
    default: {
      const unexpected: never = step
      return unexpected
    }
  }
}
