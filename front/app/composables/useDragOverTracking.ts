import { onBeforeUnmount, ref } from 'vue'

/**
 * Timestamp-based "am I currently being dragged over" tracking for a drop-zone's highlight
 * state — immune to the unmount-leak class of bug that plain dragenter/dragleave-COUNT pairing
 * suffers from (and which bit twice in practice: a stuck theme-card wash, a stuck day-line
 * rule). The counter approach increments on `dragenter`, decrements on `dragleave`, and only
 * clears the highlight at zero — but if the element a `dragenter` fired on (or bubbled through)
 * disappears from the DOM before its matching `dragleave` can ever fire — e.g. the dragged
 * ROW ITSELF gets removed once its task lands somewhere else, or ANY re-render churn eats the
 * leave — the counter never recovers. Nothing can decrement it back to zero; the highlight is
 * stuck forever, in a component that no longer even runs the code that broke it.
 *
 * This can't get stuck the same way: `dragover` fires continuously and frequently while
 * genuinely hovering (mouse-move driven, well under 100ms between events in every real
 * browser), so "am I being dragged over" is just "did a dragover arrive recently" — DECAYING
 * automatically the moment those events stop arriving, for ANY reason: pointer left, drop
 * happened, drag cancelled (Escape), source unmounted mid-drag, tab lost focus. There is no
 * paired state to leak; each `markOver` call is independent of every other.
 *
 * Generic over a key type `K` so a per-row tracker (`number` index) and a single whole-card
 * flag (any truthy literal) share one implementation — DaySection.vue / AddTaskInline.vue use
 * the former, ThemeCard.vue the latter.
 */
export function useDragOverTracking<K>() {
  const current = ref<K | null>(null)
  let lastAt = 0
  let rafId: number | null = null

  /** How stale a drag-over signal can get before the highlight clears itself — comfortably
   *  above a real browser's dragover cadence (never falsely expires while genuinely hovering)
   *  and short enough that any of the failure modes above self-heals within roughly a frame or
   *  two of visual latency, not "stuck until the page reloads." */
  const STALE_MS = 150

  function tick(): void {
    if (current.value !== null && performance.now() - lastAt > STALE_MS) {
      current.value = null
    }
    rafId = current.value !== null ? requestAnimationFrame(tick) : null
  }

  /** Call from `@dragover` (which the caller still needs `.prevent`'d for the element to be a
   *  legal drop target at all — this doesn't replace that, it rides along with it). */
  function markOver(key: K): void {
    lastAt = performance.now()
    if (current.value !== key) current.value = key
    if (rafId === null) rafId = requestAnimationFrame(tick)
  }

  /** Immediate clear — call on drop and on `dragend` for instant feedback rather than waiting
   *  out the (short, but non-zero) decay window. Safe to call any time, stuck or not. */
  function clear(): void {
    current.value = null
  }

  onBeforeUnmount(() => {
    if (rafId !== null) cancelAnimationFrame(rafId)
  })

  return { current, markOver, clear }
}
