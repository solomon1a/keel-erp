const key = 'keel.userId'

export function getUserId(): string | null {
  return localStorage.getItem(key)
}

export function setUserId(id: number) {
  localStorage.setItem(key, String(id))
  window.dispatchEvent(new Event('keel-user'))
}

export function clearUserId() {
  localStorage.removeItem(key)
  window.dispatchEvent(new Event('keel-user'))
}

export function subscribeUser(onStoreChange: () => void) {
  window.addEventListener('keel-user', onStoreChange)
  window.addEventListener('storage', onStoreChange)
  return () => {
    window.removeEventListener('keel-user', onStoreChange)
    window.removeEventListener('storage', onStoreChange)
  }
}
