export const accessModels = [
  'desk.record',
  'sale.order',
  'purchase.order',
  'mrp.order',
  'stock.transfer',
  'stock.valuation',
  'account.move',
  'bank.statement',
] as const

export type AccessModel = (typeof accessModels)[number]

export const accessOps = ['read', 'write', 'create', 'delete'] as const

export type AccessOp = (typeof accessOps)[number]

export const groupKeys = ['internal', 'manager', 'settings'] as const

export type GroupKey = (typeof groupKeys)[number]

export function isAccessModel(value: string): value is AccessModel {
  return (accessModels as readonly string[]).includes(value)
}

export function isGroupKey(value: string): value is GroupKey {
  return (groupKeys as readonly string[]).includes(value)
}

export function groupName(key: GroupKey): string {
  switch (key) {
    case 'internal':
      return 'Internal user'
    case 'manager':
      return 'Manager'
    case 'settings':
      return 'Settings'
    default: {
      const unexpected: never = key
      return unexpected
    }
  }
}

export function grantFor(group: GroupKey, op: AccessOp): boolean {
  switch (group) {
    case 'internal':
      return internalAllows(op)
    case 'manager':
    case 'settings':
      return true
    default: {
      const unexpected: never = group
      return unexpected
    }
  }
}

function internalAllows(op: AccessOp): boolean {
  switch (op) {
    case 'read':
    case 'write':
    case 'create':
      return true
    case 'delete':
      return false
    default: {
      const unexpected: never = op
      return unexpected
    }
  }
}
