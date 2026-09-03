// gesture-log.mjs — pure (no browser, no fs) parsing of DayStrip.vue's `?wheeldebug=1` console
// feed and the per-gesture state/plan summary the live recorder derives from it. Kept separate
// from live-recorder.mjs so it can be exercised headless (gesture-log.selfcheck.mjs).
//
// The two line formats (grep `console.log(\`[gesture]` / `[plan]` in DayStrip.vue):
//   [gesture] <FROM> -> <TO> t=<performance.now()> x=<scrollLeft|-> v=<vel> target=<px|->
//   [plan] #<n> t=<performance.now()> x=<scrollLeft|-> v=<vel> target=<px|-> a=<accel|->
// `t` is the page's absolute performance.now(); the recorder converts to gesture-relative ms.
//
// Plan counter rule (mirrors the HUD's `planCount` / PLAN_RESET_STILL_MS): the counter is reset
// only once the machine has been STILL for 2000ms continuously; a re-flick (leaving STILL)
// before that keeps counting, so a second `[plan]` in that span is a PLAN-VIOLATION.

export const PLAN_RESET_STILL_MS = 2000
export const GESTURE_RE = /^\[gesture\] (\S+) -> (\S+) t=(\S+) x=(\S+) v=(\S+) target=(\S+)$/
export const PLAN_RE = /^\[plan\] #(\d+) t=(\S+) x=(\S+) v=(\S+) target=(\S+) a=(\S+)$/

const num = s => (s === '-' || s === undefined ? null : +s)

/** Parse one console line; null when it is neither a `[gesture]` nor a `[plan]` line. */
export function parseConsoleLine(text) {
  const s = String(text).trim()
  let m = s.match(GESTURE_RE)
  if (m) return { kind: 'gesture', from: m[1], to: m[2], t: +m[3], x: num(m[4]), v: +m[5], target: num(m[6]) }
  m = s.match(PLAN_RE)
  if (m) return { kind: 'plan', n: +m[1], t: +m[2], x: num(m[3]), v: +m[4], target: num(m[5]), a: num(m[6]) }
  return null
}

/** Session-long record of transitions and plans (absolute page time). */
export class GestureLog {
  constructor({ resetStillMs = PLAN_RESET_STILL_MS } = {}) {
    this.resetStillMs = resetStillMs
    this.transitions = []
    this.plans = []
  }

  /** Feed a console line; returns the parsed record or null. */
  push(text) {
    const r = parseConsoleLine(text)
    if (!r) return null
    if (r.kind === 'gesture') this.transitions.push(r)
    else this.plans.push(r)
    return r
  }

  /** State at absolute time t: the `to` of the last transition at or before t; before any
   *  transition, the `from` of the first one; with no transitions at all, STILL. */
  stateAt(t) {
    let state = this.transitions.length ? this.transitions[0].from : 'STILL'
    for (const tr of this.transitions) { if (tr.t <= t) state = tr.to; else break }
    return state
  }

  /** Recorder-side plan counter for every plan, applying the HUD's reset rule to the whole
   *  session (not just one recorder window). Returns [{...plan, count}] in time order. */
  countedPlans() {
    const evs = [...this.transitions.map(x => ({ ...x, kind: 'gesture' })), ...this.plans.map(x => ({ ...x, kind: 'plan' }))]
      .sort((a, b) => a.t - b.t || (a.kind === 'plan' ? -1 : 1)) // plan is solved before the state change in the same tick
    let counter = 0, stillSince = null
    const out = []
    for (const e of evs) {
      // The HUD's timer would have fired: reset before handling anything at or after that moment.
      if (stillSince !== null && e.t - stillSince >= this.resetStillMs) { counter = 0; stillSince = null }
      if (e.kind === 'gesture') stillSince = e.to === 'STILL' ? e.t : null
      else { counter++; out.push({ ...e, count: counter }) }
    }
    return out
  }

  /** Everything in [absStart, absEnd] converted to gesture-relative ms (t - absStart). */
  window(absStart, absEnd) {
    const rel = t => +(t - absStart).toFixed(1)
    const inWin = e => e.t >= absStart && e.t <= absEnd
    const transitions = this.transitions.filter(inWin).map(e => ({ t: rel(e.t), from: e.from, to: e.to, x: e.x, v: e.v, target: e.target }))
    const plans = this.countedPlans().filter(inWin).map(e => ({ n: e.n, t: rel(e.t), x: e.x, v: e.v, target: e.target, a: e.a, recorderCount: e.count }))
    const initialState = this.stateAt(absStart - 0.001)
    // planCount mirrors the HUD: the counter value as of the last plan in this window (0 if none).
    const planCount = plans.length ? plans[plans.length - 1].recorderCount : 0
    const hudPlanCount = plans.length ? plans[plans.length - 1].n : 0
    return { transitions, plans, initialState, planCount, hudPlanCount, planViolation: planCount > 1 }
  }

  /** Drop history older than absBefore, keeping the last transition so stateAt() stays right. */
  trim(absBefore) {
    const older = this.transitions.filter(tr => tr.t < absBefore)
    this.transitions = [...older.slice(-1), ...this.transitions.filter(tr => tr.t >= absBefore)]
    this.plans = this.plans.filter(p => p.t >= absBefore)
  }
}

/** State per frame: frames [{t}] (gesture-relative), transitions from window(), initial state. */
export function frameStates(frames, transitions, initialState) {
  let i = 0, state = initialState
  return frames.map(f => {
    while (i < transitions.length && transitions[i].t <= f.t) state = transitions[i++].to
    return state
  })
}

/** Compact line: `states: STILL→DRAGGING@384 →DECELERATING@1231(v=1.49,target=17600) →STILL@6268 plans=1[ PLAN-VIOLATION]` */
export function formatStateLine({ transitions, initialState, planCount }) {
  let s = 'states: '
  if (!transitions.length) s += `${initialState} (no transitions)`
  else {
    s += transitions.map((tr, i) => {
      const detail = tr.target === null ? '' : `(v=${tr.v.toFixed(2)},target=${Math.round(tr.target)})`
      return `${i === 0 ? tr.from : ''}→${tr.to}@${Math.round(tr.t)}${detail}`
    }).join(' ')
  }
  s += ` plans=${planCount}`
  if (planCount > 1) s += ' PLAN-VIOLATION'
  return s
}
