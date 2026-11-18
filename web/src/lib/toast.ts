export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

let items: ToastItem[] = []
let sequence = 0
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((listener) => listener())
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getToastSnapshot() {
  return items
}

export function toast(message: string, tone: ToastTone = 'success') {
  const id = ++sequence
  items = [...items, { id, message, tone }]
  emit()
  window.setTimeout(() => {
    items = items.filter((item) => item.id !== id)
    emit()
  }, 4000)
}
