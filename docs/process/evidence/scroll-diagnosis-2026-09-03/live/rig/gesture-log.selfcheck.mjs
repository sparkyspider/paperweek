#!/usr/bin/env node
// gesture-log.selfcheck.mjs — headless check of rig/gesture-log.mjs: feeds sample `[gesture]` /
// `[plan]` console lines (exact DayStrip.vue formats), windows them like live-recorder.mjs does,
// and asserts the state column, the summary fields, the HUD plan-count rule and the one-line
// format. No browser, no files. Usage: node gesture-log.selfcheck.mjs
import assert from 'node:assert/strict'
import { GestureLog, frameStates, formatStateLine, parseConsoleLine } from './gesture-log.mjs'

// --- Parsing ------------------------------------------------------------------------------
assert.deepEqual(parseConsoleLine('[gesture] STILL -> DRAGGING t=1384.2 x=16000.0 v=0.412 target=-'),
  { kind: 'gesture', from: 'STILL', to: 'DRAGGING', t: 1384.2, x: 16000, v: 0.412, target: null })
assert.deepEqual(parseConsoleLine('[plan] #1 t=2230.9 x=16812.5 v=1.490 target=17600.0 a=-0.0631'),
  { kind: 'plan', n: 1, t: 2230.9, x: 16812.5, v: 1.49, target: 17600, a: -0.0631 })
assert.equal(parseConsoleLine('[plan] #2 t=9.0 x=- v=0.000 target=- a=-').x, null)
assert.equal(parseConsoleLine('[vite] connected.'), null)
assert.equal(parseConsoleLine('[gesture] nonsense'), null)
console.log('parse: ok')

// --- Scenario: recorder pageT0=1000 (page performance.now() at the recorder's T0) ----------
// Gesture A: flick, one plan, comes to rest. Gesture B: re-flick 1.2s after STILL (inside the
// HUD's 2s reset window) => its plan is #2 under the HUD rule = PLAN-VIOLATION. Then 3s of
// STILL, gesture C: plan is #1 again.
const pageT0 = 1000
const lines = [
  '[gesture] STILL -> DRAGGING t=1384.0 x=16000.0 v=0.412 target=-',
  '[plan] #1 t=2231.0 x=16812.5 v=1.490 target=17600.0 a=-0.0631',
  '[gesture] DRAGGING -> DECELERATING t=2231.0 x=16812.5 v=1.490 target=17600.0',
  '[gesture] DECELERATING -> STILL t=7268.0 x=17600.0 v=0.000 target=-',
  // gesture B starts 1200ms after STILL -> counter NOT reset
  '[gesture] STILL -> DRAGGING t=8468.0 x=17600.0 v=0.300 target=-',
  '[plan] #2 t=9000.0 x=17900.0 v=0.900 target=19200.0 a=-0.0200',
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
assert.deepEqual(glog.countedPlans().map(p => p.count), [1, 2, 1], 'HUD reset rule: 2000ms continuous STILL')

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
assert.equal(gw.planCount, 1)
assert.equal(gw.planViolation, false)
const states = frameStates(frames, gw.transitions, gw.initialState)
const at = ms => states[frames.findIndex(f => f.t >= ms)]
assert.equal(at(0), 'STILL'); assert.equal(at(400), 'DRAGGING'); assert.equal(at(1240), 'DECELERATING'); assert.equal(at(6300), 'STILL')
const lineA = formatStateLine(gw)
console.log('gesture A:', lineA)
assert.equal(lineA, 'states: STILL→DRAGGING@384 →DECELERATING@1231(v=1.49,target=17600) →STILL@6268 plans=1')

// Gesture B window (recorder segments it separately; its plan is the HUD's #2 => violation).
const bStart = pageT0 + (8468 - pageT0 - 400)
const gwB = glog.window(bStart, bStart + 4000)
assert.equal(gwB.initialState, 'STILL')
assert.equal(gwB.planCount, 2); assert.equal(gwB.hudPlanCount, 2); assert.equal(gwB.planViolation, true)
const lineB = formatStateLine(gwB)
console.log('gesture B:', lineB)
assert.equal(lineB, 'states: STILL→DRAGGING@400 →DECELERATING@932(v=0.90,target=19200) →STILL@2932 plans=2 PLAN-VIOLATION')

// Gesture C window: counter reset after 3s STILL.
const cStart = pageT0 + (14000 - pageT0 - 400)
const gwC = glog.window(cStart, cStart + 3000)
assert.equal(gwC.planCount, 1); assert.equal(gwC.planViolation, false)
console.log('gesture C:', formatStateLine(gwC))

// A window with no transitions (e.g. a wheel touch that never left STILL) and mid-state start.
const gwNone = glog.window(pageT0 + 17000, pageT0 + 18000)
assert.equal(formatStateLine(gwNone), 'states: STILL (no transitions) plans=0')
assert.equal(glog.window(pageT0 + 1500, pageT0 + 1600).initialState, 'DECELERATING')
console.log('empty window:', formatStateLine(gwNone))

// trim() keeps stateAt() correct.
glog.trim(15000) // absolute page time: drops everything before gesture C's DECELERATING@14500 except that one
assert.equal(glog.transitions.length, 2)
assert.equal(glog.stateAt(15500), 'DECELERATING')
assert.equal(glog.stateAt(16500), 'STILL')
console.log('trim: ok')

// Summary shape as written by live-recorder.mjs.
const summary = { initialState: gw.initialState, transitions: gw.transitions, plans: gw.plans, planCount: gw.planCount, hudPlanCount: gw.hudPlanCount, planViolation: gw.planViolation, stateLine: lineA }
console.log('summary fields:', JSON.stringify(summary))
console.log('frames.csv state column sample:', states.filter((_, i) => i % 60 === 0).join(','))
console.log('SELFCHECK OK')
