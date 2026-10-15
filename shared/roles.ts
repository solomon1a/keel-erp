export const roleValues = ['admin', 'user'] as const

export type Role = (typeof roleValues)[number]

export function parseRole(value: string): Role | null {
  switch (value) {
    case 'admin':
      return 'admin'
    case 'user':
      return 'user'
    default:
      return null
  }
}

export function roleLabel(role: Role): string {
  switch (role) {
    case 'admin':
      return 'Admin'
    case 'user':
      return 'User'
    default: {
      const unexpected: never = role
      return unexpected
    }
  }
}
