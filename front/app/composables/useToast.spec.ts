import { describe, expect, it, vi } from 'vitest'
import { useToast } from './useToast'

describe('useToast second action (PAPERWEEK_DELETE)', () => {
  it('carries the second action beside Undo when asked', () => {
    const { toasts, show, dismiss } = useToast()
    const onSecondary = vi.fn()
    const id = show('Task deleted', { actionLabel: 'Undo', onAction: () => {}, secondaryLabel: 'Delete permanently', onSecondary })
    const t = toasts.value.find(x => x.id === id)!
    expect(t.secondaryLabel).toBe('Delete permanently')
    t.onSecondary?.()
    expect(onSecondary).toHaveBeenCalledOnce()
    dismiss(id)
  })

  it('offers no second action when none is passed (everyone without the right)', () => {
    const { toasts, show, dismiss } = useToast()
    const id = show('Task deleted', { actionLabel: 'Undo', onAction: () => {} })
    const t = toasts.value.find(x => x.id === id)!
    expect(t.secondaryLabel).toBeUndefined()
    expect(t.onSecondary).toBeUndefined()
    dismiss(id)
  })
})
