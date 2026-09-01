/**
 * A tiny global toast queue for the soft undo pattern ("Archived — Undo", "Deleted — Undo").
 * Module-level state (not per-call) so every caller shares the same queue; `ToastHost.vue`
 * is the one renderer, mounted once in app.vue.
 */
import { ref } from 'vue'

export interface ToastMsg {
  id: number
  message: string
  actionLabel?: string
  onAction?: () => void
}

const toasts = ref<ToastMsg[]>([])
let counter = 0

export function useToast() {
  function show(message: string, opts?: { actionLabel?: string; onAction?: () => void; duration?: number }): number {
    const id = ++counter
    toasts.value.push({ id, message, actionLabel: opts?.actionLabel, onAction: opts?.onAction })
    const duration = opts?.duration ?? 5000
    setTimeout(() => dismiss(id), duration)
    return id
  }

  function dismiss(id: number): void {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts, show, dismiss }
}
