export const workflowModels = ['sale.order', 'purchase.order', 'mrp.order', 'stock.transfer', 'account.move'] as const

export type WorkflowModel = (typeof workflowModels)[number]

const saleOrder: Record<string, readonly string[]> = {
  draft: ['sent', 'sale', 'cancel'],
  sent: ['sale', 'draft', 'cancel'],
  sale: ['done', 'cancel'],
  done: [],
  cancel: ['draft'],
}

const purchaseOrder: Record<string, readonly string[]> = {
  draft: ['sent', 'purchase', 'cancel'],
  sent: ['purchase', 'cancel'],
  purchase: ['done', 'cancel'],
  done: [],
  cancel: [],
}

const manufacturingOrder: Record<string, readonly string[]> = {
  draft: ['confirmed', 'cancel'],
  confirmed: ['progress', 'cancel'],
  progress: ['done', 'cancel'],
  done: [],
  cancel: [],
}

const stockTransfer: Record<string, readonly string[]> = {
  draft: ['ready', 'cancel'],
  ready: ['done', 'cancel'],
  done: [],
  cancel: [],
}

const accountMove: Record<string, readonly string[]> = {
  draft: ['posted', 'cancel'],
  posted: ['paid'],
  paid: [],
  cancel: [],
}

export function isWorkflowModel(value: string): value is WorkflowModel {
  return (workflowModels as readonly string[]).includes(value)
}

function machineFor(model: WorkflowModel): Record<string, readonly string[]> {
  switch (model) {
    case 'sale.order':
      return saleOrder
    case 'purchase.order':
      return purchaseOrder
    case 'mrp.order':
      return manufacturingOrder
    case 'stock.transfer':
      return stockTransfer
    case 'account.move':
      return accountMove
    default: {
      const unexpected: never = model
      return unexpected
    }
  }
}

export function canTransition(model: WorkflowModel, from: string, to: string): boolean {
  if (from === to) return true
  const next = machineFor(model)[from]
  if (!next) return false
  return next.includes(to)
}
