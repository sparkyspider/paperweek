#!/usr/bin/env node
// gesture-log.selfcheck.mjs — headless check of rig/gesture-log.mjs: feeds sample `[gesture]` /
// `[plan]` console lines (exact DayStrip.vue formats), windows them like live-recorder.mjs does,
// and asserts the state column, the summary fields, the per-touch plan-count rule (plans since
// the last DRAGGING entry; a second plan without a new touch is a PLAN-VIOLATION) and the
// one-line format. No browser, no files. Usage: node gesture-log.selfcheck.mjs
import assert from 'node:assert/strict'
import { GestureLog, frameStates, formatStateLine, parseConsoleLine } from './gesture-log.mjs'

// --- Parsing ------------------------------------------------------------------------------
assert.deepEqual(parseConsoleLine('[gesture] STILL -> DRAGGING t=1384.2 x=16000.0 v=0.412 target=-'),
  { kind: 'gesture', from: 'STILL', to: 'DRAGGING', t: 1384.2, x: 16000, v: 0.412, target: null })
assert.deepEqual(parseConsoleLine('[plan] #1 t=2230.9 x=16812.5 v=1.490 target=17600.0 a=-0.0631'),
  { kind: 'plan', n: 1, t: 2230.9, x: 16812.5, v: 1.49, target: 17600, a: -0.0631 })
assert.equal(parseConsoleLine('[plan] #2 t=9.0 x=- v=0.000 target=- a=-').x, null)
// The CURRENT DayStrip.vue line (2026-09-03, verbatim from after3/chromium-fast-int-summary.json): T= and profile= appended.
assert.deepEqual(parseConsoleLine('[plan] #1 t=3489.3 x=12432.0 v=36.984 target=13200.0 a=0.8905 T=41.5 profile=constant'),
  { kind: 'plan', n: 1, t: 3489.3, x: 12432, v: 36.984, target: 13200, a: 0.8905, T: 41.5, profile: 'constant' })
assert.deepEqual(parseConsoleLine('[plan] #3 t=12.5 x=- v=0.000 target=- a=- T=- profile=-'),
  { kind: 'plan', n: 3, t: 12.5, x: null, v: 0, target: null, a: null, T: null, profile: null })
// Tolerant of fields we do not know about yet, and of any order.
assert.equal(parseConsoleLine('[plan] #4 t=1.0 x=5.0 v=2.000 target=400.0 a=0.0050 T=48.0 profile=hermite extra=1').profile, 'hermite')
assert.equal(parseConsoleLine('[plan] #5 profile=constant T=100.0 t=2.0 v=8.000 x=0.0 target=400.0 a=0.0800').T, 100)
assert.equal(parseConsoleLine('[plan] #6'), null)
assert.equal(parseConsoleLine('[vite] connected.'), null)
assert.equal(parseConsoleLine('[gesture] nonsense'), null)
console.log('parse: ok')

// --- Scenario: recorder pageT0=1000 (page performance.now() at the recorder's T0) ----------
// Gesture A: flick, one plan, comes to rest. Gesture B: re-flick 1.2s after STILL (inside the
// 2s reset window) — a NEW TOUCH, so under the per-touch rule its plan is #1 again and NOT a
// violation (the old cumulative rule called it #2). Then 3s of STILL, gesture C: plan #1.
const pageT0 = 1000
const lines = [
  '[gesture] STILL -> DRAGGING t=1384.0 x=16000.0 v=0.412 target=-',
  '[plan] #1 t=2231.0 x=16812.5 v=1.490 target=17600.0 a=-0.0631',
  '[gesture] DRAGGING -> DECELERATING t=2231.0 x=16812.5 v=1.490 target=17600.0',
  '[gesture] DECELERATING -> STILL t=7268.0 x=17600.0 v=0.000 target=-',
  // gesture B starts 1200ms after STILL -> a new touch resets the counter
  '[gesture] STILL -> DRAGGING t=8468.0 x=17600.0 v=0.300 target=-',
  '[plan] #1 t=9000.0 x=17900.0 v=0.900 target=19200.0 a=-0.0200',
  '[gesture] DRAGGING -> DECELERATING t=9000.0 x=17900.0 v=0.900 target=19200.0',
  '[gesture] DECELERATING -> STILL t=11000.0 x=19200.0 v=0.000 target=-',
  // gesture C starts 3000ms after STILL -> counter reset
  '[gesture] STILL -> DRAGGING t=14000.0 x=19200.0 v=0.200 target=-',
  '[plan] #1 t=14500.0 x=19300.0 v=0.700 target=20800.0 a=-0.0100',
  '[gesture] DRAGGING -> DECELERATING t=14500.0 x=19300.0 v=0.700 target=20800.0',
  '[gesture] DECELERATING -> STILL t=16000.0 x=20800.0 v=0.000 target=-',
]
const glog = new GestureLog()
for (const l of lines) glog.push(l)
assert.equal(glog.transitions.length, 9)
assert.equal(glog.plans.length, 3)
assert.deepEqual(glog.countedPlans().map(p => p.count), [1, 1, 1], 'per-touch rule: every DRAGGING entry resets the counter')

// Recorder window for gesture A: pre-roll starts 400ms before the first wheel (recorder time 1384-1000-400 = -16 => use 0 baseline).
const absT0 = 0 // recorder time of pre-roll start
const absStart = pageT0 + absT0            // 1000
const frames = []
for (let t = 0; t <= 7000; t += 16.7) frames.push({ t: +t.toFixed(1) }) // flushes ~1.5s after STILL@6268
const absEnd = absStart + frames[frames.length - 1].t
const gw = glog.window(absStart, absEnd)
assert.equal(gw.initialState, 'STILL')
assert.equal(gw.transitions.length, 3)
assert.deepEqual(gw.transitions[1], { t: 1231, from: 'DRAGGING', to: 'DECELERATING', x: 16812.5, v: 1.49, target: 17600 })
assert.equal(gw.plans.length, 1)
assert.deepEqual(gw.plans[0], { n: 1, t: 1231, x: 16812.5, v: 1.49, target: 17600, a: -0.0631, recorderCount: 1 })
assert.equal(gw.planCount, 1); assert.equal(gw.flicks, 1)
assert.equal(gw.planViolation, false)
const states = frameStates(frames, gw.transitions, gw.initialState)
const at = ms => states[frames.findIndex(f => f.t >= ms)]
assert.equal(at(0), 'STILL'); assert.equal(at(400), 'DRAGGING'); assert.equal(at(1240), 'DECELERATING'); assert.equal(at(6300), 'STILL')
const lineA = formatStateLine(gw)
console.log('gesture A:', lineA)
assert.equal(lineA, 'states: STILL→DRAGGING@384 →DECELERATING@1231(v=1.49,target=17600) →STILL@6268 plans=1 flicks=1')

// Gesture B window (recorder segments it separately; a new touch => its plan is #1, no violation).
const bStart = pageT0 + (8468 - pageT0 - 400)
const gwB = glog.window(bStart, bStart + 4000)
assert.equal(gwB.initialState, 'STILL')
assert.equal(gwB.planCount, 1); assert.equal(gwB.flicks, 1); assert.equal(gwB.hudPlanCount, 1); assert.equal(gwB.planViolation, false)
const lineB = formatStateLine(gwB)
console.log('gesture B:', lineB)
assert.equal(lineB, 'states: STILL→DRAGGING@400 →DECELERATING@932(v=0.90,target=19200) →STILL@2932 plans=1 flicks=1')

// Gesture C window: counter reset after 3s STILL.
const cStart = pageT0 + (14000 - pageT0 - 400)
const gwC = glog.window(cStart, cStart + 3000)
assert.equal(gwC.planCount, 1); assert.equal(gwC.planViolation, false)
console.log('gesture C:', formatStateLine(gwC))

// A window with no transitions (e.g. a wheel touch that never left STILL) and mid-state start.
const gwNone = glog.window(pageT0 + 17000, pageT0 + 18000)
assert.equal(formatStateLine(gwNone), 'states: STILL (no transitions) plans=0 flicks=0')
assert.equal(glog.window(pageT0 + 1500, pageT0 + 1600).initialState, 'DECELERATING')
console.log('empty window:', formatStateLine(gwNone))

// Current-format scenario: the state line carries T and profile per DECELERATING transition.
const glog2 = new GestureLog()
for (const l of [
  '[gesture] STILL -> DRAGGING t=1401.0 x=18800.0 v=0.000 target=-',
  '[plan] #1 t=1610.0 x=18990.0 v=6.090 target=19200.0 a=0.0883 T=100.0 profile=constant',
  '[gesture] DRAGGING -> DECELERATING t=1610.0 x=18990.0 v=6.090 target=19200.0',
  '[gesture] DECELERATING -> STILL t=3280.0 x=19200.0 v=6.090 target=-',
  '[gesture] STILL -> DRAGGING t=3800.0 x=19200.0 v=0.000 target=-',
  '[plan] #1 t=4100.0 x=19250.0 v=2.500 target=19600.0 a=0.0521 T=48.0 profile=hermite',
  '[gesture] DRAGGING -> DECELERATING t=4100.0 x=19250.0 v=2.500 target=19600.0',
  '[gesture] DECELERATING -> STILL t=4900.0 x=19600.0 v=2.500 target=-',
]) glog2.push(l)
const gw2 = glog2.window(1000, 6000)
assert.equal(gw2.planCount, 2); assert.equal(gw2.flicks, 2); assert.equal(gw2.planViolation, false)
assert.deepEqual(gw2.plans[0], { n: 1, t: 610, x: 18990, v: 6.09, target: 19200, a: 0.0883, T: 100, profile: 'constant', recorderCount: 1 })
const line2 = formatStateLine(gw2)
console.log('current format:', line2)
assert.equal(line2, 'states: STILL→DRAGGING@401 →DECELERATING@610(v=6.09,target=19200,T=100,constant) →STILL@2280 →DRAGGING@2800 →DECELERATING@3100(v=2.50,target=19600,T=48,hermite) →STILL@3900 plans=2 flicks=2')

// Per-touch rule, both directions. (1) Ten rapid flicks, each with exactly one plan, all inside
// the 2s window and even re-touching mid-DECELERATING => plans=10 flicks=10, NO violation.
const glog3 = new GestureLog()
let t3 = 1000
for (let i = 0; i < 10; i++) {
  const x = 12000 + i * 400
  glog3.push(`[gesture] ${i === 0 ? 'STILL' : 'DECELERATING'} -> DRAGGING t=${t3}.0 x=${x}.0 v=0.000 target=-`)
  glog3.push(`[plan] #1 t=${t3 + 200}.0 x=${x + 150}.0 v=8.000 target=${x + 400}.0 a=0.1000 T=60.0 profile=constant`)
  glog3.push(`[gesture] DRAGGING -> DECELERATING t=${t3 + 200}.0 x=${x + 150}.0 v=8.000 target=${x + 400}.0`)
  t3 += 700 // the next touch lands while the previous manoeuvre is still running
}
glog3.push(`[gesture] DECELERATING -> STILL t=${t3 + 800}.0 x=16000.0 v=0.000 target=-`)
assert.deepEqual(glog3.countedPlans().map(p => p.count), Array(10).fill(1))
const gw3 = glog3.window(600, t3 + 2000)
assert.equal(gw3.planCount, 10); assert.equal(gw3.flicks, 10); assert.equal(gw3.planViolation, false)
const line3 = formatStateLine(gw3)
console.log('ten flicks:', line3)
assert.ok(line3.endsWith(' plans=10 flicks=10'), line3)
assert.ok(!line3.includes('PLAN-VIOLATION'))

// (2) One flick with TWO plans and no DRAGGING between them => violation.
const glog4 = new GestureLog()
for (const l of [
  '[gesture] STILL -> DRAGGING t=1400.0 x=16000.0 v=0.000 target=-',
  '[plan] #1 t=1600.0 x=16150.0 v=8.000 target=16400.0 a=0.1000 T=60.0 profile=constant',
  '[gesture] DRAGGING -> DECELERATING t=1600.0 x=16150.0 v=8.000 target=16400.0',
  '[plan] #2 t=1900.0 x=16300.0 v=3.000 target=16400.0 a=0.0500 T=40.0 profile=hermite',
  '[gesture] DECELERATING -> STILL t=2600.0 x=16400.0 v=0.000 target=-',
]) glog4.push(l)
assert.deepEqual(glog4.countedPlans().map(p => p.count), [1, 2])
const gw4 = glog4.window(1000, 4000)
assert.equal(gw4.planCount, 2); assert.equal(gw4.flicks, 1); assert.equal(gw4.planViolation, true)
const line4 = formatStateLine(gw4)
console.log('two plans, one flick:', line4)
assert.equal(line4, 'states: STILL→DRAGGING@400 →DECELERATING@600(v=8.00,target=16400,T=60,constant) →STILL@1600 plans=2 flicks=1 PLAN-VIOLATION')
// The 2s-STILL reset still applies: a plan after 2s of STILL with no new touch is #1, not a violation.
const glog5 = new GestureLog()
for (const l of [
  '[gesture] STILL -> DRAGGING t=1000.0 x=0.0 v=0.000 target=-',
  '[plan] #1 t=1200.0 x=100.0 v=5.000 target=400.0 a=0.1000 T=60.0 profile=constant',
  '[gesture] DRAGGING -> DECELERATING t=1200.0 x=100.0 v=5.000 target=400.0',
  '[gesture] DECELERATING -> STILL t=2000.0 x=400.0 v=0.000 target=-',
  '[plan] #1 t=4500.0 x=400.0 v=0.000 target=- a=- T=- profile=-',
]) glog5.push(l)
assert.deepEqual(glog5.countedPlans().map(p => p.count), [1, 1])
assert.equal(glog5.window(500, 5000).planViolation, false)

// trim() keeps stateAt() correct.
glog.trim(15000) // absolute page time: drops everything before gesture C's DECELERATING@14500 except that one
assert.equal(glog.transitions.length, 2)
assert.equal(glog.stateAt(15500), 'DECELERATING')
assert.equal(glog.stateAt(16500), 'STILL')
console.log('trim: ok')

// Summary shape as written by live-recorder.mjs.
const summary = { initialState: gw.initialState, transitions: gw.transitions, plans: gw.plans, planCount: gw.planCount, flicks: gw.flicks, hudPlanCount: gw.hudPlanCount, planViolation: gw.planViolation, stateLine: lineA }
console.log('summary fields:', JSON.stringify(summary))
console.log('frames.csv state column sample:', states.filter((_, i) => i % 60 === 0).join(','))
console.log('SELFCHECK OK')
