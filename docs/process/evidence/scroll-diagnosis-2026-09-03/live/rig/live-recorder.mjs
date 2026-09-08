#!/usr/bin/env node
// live-recorder.mjs — HEADED Chromium that Mark flicks in with his REAL trackpad. No synthetic
// wheel events (except the optional --selftest burst). Same login + page (/?wheeldebug=1) + runtime
// instrumentation as ../../after/rig/trackpad-rig.mjs: a property trap on the day-strip's
// scrollLeft (every JS write, with the calling function from the stack), wrapped scrollTo/scrollBy,
// scroll/scrollend listeners, plus a passive capture-phase wheel listener recording every real
// wheel event (deltaX, deltaY, deltaMode, timestamp) and the HUD state right after the app's
// handler ran.
//
// Gesture segmentation (in-page): a gesture STARTS at the first wheel event after >= 1500ms of no
// wheel events and no scrollLeft change; it ENDS after 1500ms of both silent. Frames are buffered
// continuously so each gesture carries a 400ms pre-roll. On gesture end the page posts the buffer
// to Node (exposeFunction), which writes, per gesture, in the `live/` dir:
//   gesture-NN-frames.csv   t_ms,scrollLeft,delta,vel_px_s,hud_intent,hud_ownership,hud_target,hud_velocity,state
//   gesture-NN-wheel.csv    t_ms,event_timeStamp,deltaX,deltaY,deltaMode,defaultPrevented,pos,hud_intent,hud_ownership,hud_velocity
//   gesture-NN-writes.json  every scrollLeft write / scrollTo / scrollBy / scroll(end) event
//   gesture-NN-summary.json phases, reversal, pause-then-move, dock error, scrollTo(smooth) calls,
//                           peak velocity, glide distance/duration, HUD final state, plus the
//                           state machine feed: transitions[{t,from,to,x,v,target}],
//                           plans[{n,t,x,v,target,a}], planCount (HUD rule: resets only after
//                           2000ms continuous STILL), planViolation
//   gesture-NN.png          plot (same style as the earlier rigs; rig/plot-gesture.py)
// and prints one line to stdout: "gesture NN saved: <summary> | states: STILL→DRAGGING@384
// →DECELERATING@1231(v=1.49,target=17600) →STILL@6268 plans=1[ PLAN-VIOLATION]". The state feed
// is the app's `[gesture]`/`[plan]` console lines (DayStrip.vue, wheeldebug-gated), captured via
// page.on('console') and parsed by rig/gesture-log.mjs. Runs until Ctrl-C or the window
// closes. NN continues from the highest existing gesture-NN in the out dir (safe to relaunch).
//
// Usage:
//   [PW=<password>] node live-recorder.mjs [--out DIR] [--selftest]
//   PW defaults to the contents of auth/.machinekey/mark-initial-password.txt.
//   --selftest fires ONE synthetic fast/int burst (the after-rig's stream) right after setup, so a
//   `selftest-*` gesture set gets written and plotted; the recorder then keeps running for real use.
import { chromium } from '/Users/sparkyspider/IdeaProjects/paperweek/.claude/skills/view-website/node_modules/playwright/index.mjs'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { GestureLog, frameStates, formatStateLine } from './gesture-log.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../../../../..')
const argv = process.argv.slice(2)
const outIdx = argv.indexOf('--out')
const outDir = resolve(outIdx >= 0 ? argv[outIdx + 1] : resolve(HERE, '..'))
const selftest = argv.includes('--selftest')
mkdirSync(outDir, { recursive: true })
const PLOT = resolve(HERE, 'plot-gesture.py')
const PW = process.env.PW || (() => {
  const p = resolve(REPO, 'auth/.machinekey/mark-initial-password.txt')
  return existsSync(p) ? readFileSync(p, 'utf8').trim() : ''
})()
if (!PW) { console.error('PW env var (password) required, or auth/.machinekey/mark-initial-password.txt'); process.exit(2) }

// Continue numbering from whatever is already in outDir.
let gestureN = readdirSync(outDir)
  .map(f => (f.match(/^gesture-(\d+)-summary\.json$/) || [])[1])
  .filter(Boolean)
  .reduce((m, n) => Math.max(m, +n), 0)

let pendingTag = null // set to 'selftest' so the next flushed gesture is named that instead of gesture-NN
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)

// ---- Browser ------------------------------------------------------------------------------
const browser = await chromium.launch({ headless: false })
const context = await browser.newContext({ viewport: { width: 1400, height: 900 } })
const page = await context.newPage()
page.on('pageerror', e => log('pageerror:', e.message))
// The app's `[gesture] FROM -> TO ...` / `[plan] #n ...` lines (DayStrip.vue, wheeldebug-gated)
// are the state-machine feed: kept session-long in Node (absolute page time), windowed per gesture.
const glog = new GestureLog()
let pageT0 = 0 // page performance.now() at the recorder's in-page T0 (set after instrumentation)
page.on('console', m => {
  if (glog.push(m.text())) return
  if (m.type() === 'error') log('console.error:', m.text().slice(0, 200))
})

// Node-side sink for finished gestures (must be exposed before the page installs its hooks).
await page.exposeFunction('__gestureDone', payload => { try { saveGesture(payload) } catch (e) { log('save failed:', e.stack || e) } })

// Login through the real UI (same as the view-website / trackpad rigs).
await page.goto('http://localhost:3200/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(500)
await page.waitForSelector('input[type=email]', { timeout: 10000 })
await page.click('input[type=email]')
await page.type('input[type=email]', 'mark@flyh2.com', { delay: 10 })
await page.click('input[type=password]')
await page.type('input[type=password]', PW, { delay: 10 })
await Promise.all([
  page.click('button[type=submit]'),
  page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
])
await page.waitForTimeout(1500)
await page.goto('http://localhost:3200/?wheeldebug=1', { waitUntil: 'networkidle', timeout: 30000 })
const strip = page.locator('.day-strip')
await strip.waitFor({ state: 'visible' })
await page.waitForTimeout(1500) // initial centering (ResizeObserver + 120ms) well settled

// ---- In-page instrumentation + gesture segmentation --------------------------------------
await page.evaluate(() => {
  const SILENCE_MS = 1500
  const PREROLL_MS = 400
  const hud = () => (document.querySelector('div.font-mono.fixed')?.textContent ?? '')
  const hudField = (h, k) => (h.match(new RegExp(k + ':\\s+(\\S+)')) || [])[1] || ''
  const T0 = performance.now()
  window.__liveRecorderT0 = T0 // lets Node align the console lines' performance.now() t values
  const now = () => +(performance.now() - T0).toFixed(1)
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft')

  function callerOf(stack) {
    const lines = (stack || '').split('\n').map(s => s.trim()).filter(Boolean)
    const names = []
    for (const l of lines) {
      const m = l.match(/^at\s+([^\s(]+)/) || l.match(/^([^@]+)@/)
      if (!m) continue
      const n = m[1]
      if (n === 'set' || n === 'Error' || n === 'set scrollLeft' || n.includes('callerOf')) continue
      names.push(n)
    }
    return names.slice(0, 3).join('<')
  }

  // Rolling buffers (everything since the last gesture flush; trimmed to the pre-roll while idle).
  let frames = [], writes = [], calls = [], events = [], wheel = []
  let el = null
  let lastPos = 0, lastChangeT = now(), lastWheelT = -Infinity
  let gesture = null // { startT, startPos, firstWheelT }

  function install(node) {
    el = node
    el.dataset.liveRecorder = '1'
    Object.defineProperty(el, 'scrollLeft', {
      configurable: true,
      get() { return desc.get.call(this) },
      set(v) {
        writes.push({ t: now(), from: +desc.get.call(this).toFixed(2), to: +(+v).toFixed(2), caller: callerOf(new Error().stack) })
        desc.set.call(this, v)
      },
    })
    const origScrollTo = el.scrollTo.bind(el)
    el.scrollTo = function (...args) {
      const o = args[0]
      calls.push({ t: now(), fn: 'scrollTo', left: typeof o === 'object' ? o.left : args[0], behavior: o?.behavior, at: +desc.get.call(el).toFixed(2), caller: callerOf(new Error().stack) })
      return origScrollTo(...args)
    }
    const origScrollBy = el.scrollBy.bind(el)
    el.scrollBy = function (...args) { calls.push({ t: now(), fn: 'scrollBy', arg: JSON.stringify(args[0]), caller: callerOf(new Error().stack) }); return origScrollBy(...args) }
    for (const type of ['scroll', 'scrollend']) el.addEventListener(type, () => events.push({ t: now(), type, at: +desc.get.call(el).toFixed(2) }))
    lastPos = desc.get.call(el)
  }
  install(document.querySelector('.day-strip'))

  // Real wheel events: capture phase on window (before the app's handler) records the deltas;
  // a bubble-phase listener (after the handler, unless it stops propagation) fills in the HUD
  // reaction + defaultPrevented. Both passive: they never influence the app.
  window.addEventListener('wheel', e => {
    const t = now()
    const rec = { t, ts: +e.timeStamp.toFixed(1), dx: +e.deltaX.toFixed(3), dy: +e.deltaY.toFixed(3), mode: e.deltaMode, x: e.clientX, y: e.clientY, onStrip: !!(el && el.contains(e.target)), pos: +desc.get.call(el).toFixed(1), synthetic: !e.isTrusted, prevented: null, intent: '', ownership: '', velocity: '' }
    wheel.push(rec)
    e.__liveRec = rec
    // Start on ANY wheel event while idle. (Requiring "no scrollLeft change for 1500ms" as well
    // silently drops the first flick after any non-wheel move — e.g. initial centering — so
    // that condition is only applied at the END; whether the strip was still moving at the
    // start is recorded instead.)
    if (!gesture) {
      gesture = { startT: t, startPos: +desc.get.call(el).toFixed(2), firstWheelT: t, startedWhileMoving: t - lastChangeT < SILENCE_MS, msSinceLastChange: +(t - lastChangeT).toFixed(0), msSinceLastWheel: isFinite(lastWheelT) ? +(t - lastWheelT).toFixed(0) : null }
    }
    lastWheelT = t
  }, { capture: true, passive: true })
  window.addEventListener('wheel', e => {
    const rec = e.__liveRec
    if (!rec) return
    const h = hud()
    rec.prevented = e.defaultPrevented
    rec.intent = hudField(h, 'intent'); rec.ownership = hudField(h, 'ownership'); rec.velocity = hudField(h, 'velocity')
  }, { capture: false, passive: true })

  function flush() {
    const g = gesture
    gesture = null
    const t0 = g.firstWheelT - PREROLL_MS
    const since = a => a.filter(x => x.t >= t0)
    const docks = Array.from(el.querySelectorAll('[data-date]'), k => k.offsetLeft - 20)
    const endPos = desc.get.call(el)
    const nearest = docks.length ? docks.reduce((b, d) => (Math.abs(d - endPos) < Math.abs(b - endPos) ? d : b), docks[0]) : endPos
    const payload = {
      absT0: +t0.toFixed(1), prerollMs: PREROLL_MS, firstWheelT: +(g.firstWheelT - t0).toFixed(1),
      startedWhileMoving: g.startedWhileMoving, msSinceLastChangeAtStart: g.msSinceLastChange, msSinceLastWheelAtStart: g.msSinceLastWheel,
      startPos: g.startPos, endPos: +endPos.toFixed(2), nearestDock: +nearest.toFixed(2), dockError: +(endPos - nearest).toFixed(2),
      dockCount: docks.length, viewportW: el.clientWidth, scrollW: el.scrollWidth,
      frames: since(frames).map(f => ({ ...f, t: +(f.t - t0).toFixed(1) })),
      writes: since(writes).map(w => ({ ...w, t: +(w.t - t0).toFixed(1) })),
      calls: since(calls).map(c => ({ ...c, t: +(c.t - t0).toFixed(1) })),
      events: since(events).map(e => ({ ...e, t: +(e.t - t0).toFixed(1) })),
      wheel: since(wheel).map(w => ({ ...w, t: +(w.t - t0).toFixed(1) })),
      hudFinal: hud().replace(/\s+/g, ' ').trim(),
      ua: navigator.userAgent,
    }
    frames = []; writes = []; calls = []; events = []; wheel = []
    window.__gestureDone(payload)
  }

  function frame() {
    // Vue/HMR may swap the element: re-install on the live one so the trap never silently lapses.
    const cur = document.querySelector('.day-strip')
    if (cur && cur !== el) install(cur)
    const t = now()
    const pos = el ? desc.get.call(el) : 0
    if (Math.abs(pos - lastPos) > 0.01) lastChangeT = t
    lastPos = pos
    const h = hud()
    frames.push({ t, pos: +pos.toFixed(2), intent: hudField(h, 'intent'), ownership: hudField(h, 'ownership'), target: hudField(h, 'target'), velocity: hudField(h, 'velocity') })
    if (gesture) {
      if (t - lastWheelT >= SILENCE_MS && t - lastChangeT >= SILENCE_MS) flush()
    } else {
      // Idle: keep only the pre-roll window.
      const keep = t - PREROLL_MS
      if (frames.length > 200) frames = frames.filter(f => f.t >= keep)
      if (writes.length > 500) writes = writes.filter(f => f.t >= keep)
      if (calls.length > 100) calls = calls.filter(f => f.t >= keep)
      if (events.length > 500) events = events.filter(f => f.t >= keep)
      if (wheel.length > 200) wheel = wheel.filter(f => f.t >= keep)
    }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)
  window.__liveRecorderInstalled = true
})
pageT0 = await page.evaluate(() => window.__liveRecorderT0)
log(`recorder armed: window open, logged in as mark@flyh2.com, /?wheeldebug=1, out=${outDir}, next gesture=${String(gestureN + 1).padStart(2, '0')}`)
log('flick the day-strip with the trackpad; each gesture is saved 1.5s after it goes quiet. Ctrl-C to stop.')

// ---- Optional self-test burst (proves the pipeline end-to-end without a human) ------------
if (selftest) {
  pendingTag = 'selftest'
  await page.evaluate(() => new Promise(res => {
    const el = document.querySelector('.day-strip')
    const r = el.getBoundingClientRect()
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2
    const HZ = 1000 / 60
    const samples = []
    let t = 0
    for (let i = 0; i < 18; i++) { samples.push({ t, dx: Math.round(4 + 36 * (i / 17)) }); t += HZ }
    let v = 40
    for (let i = 0; i < 36; i++) { v *= 0.9; if (v < 1) break; samples.push({ t, dx: Math.round(v) }); t += HZ }
    let i = 0
    const base = performance.now() + 50
    function fire() {
      if (i >= samples.length) { res(); return }
      const s = samples[i++]
      el.dispatchEvent(new WheelEvent('wheel', { deltaX: s.dx, deltaY: 0, deltaMode: 0, bubbles: true, cancelable: true, clientX: cx, clientY: cy }))
      if (i < samples.length) setTimeout(fire, Math.max(0, base + samples[i].t - performance.now()))
      else res()
    }
    setTimeout(fire, 50)
  }))
  log('selftest burst dispatched (synthetic, fast/int, 18 finger + inertia tail); waiting for it to flush...')
}

// ---- Keep alive until Ctrl-C or the window closes -----------------------------------------
await new Promise(res => {
  page.on('close', res)
  browser.on('disconnected', res)
  process.on('SIGINT', res)
  process.on('SIGTERM', res)
})
log('recorder stopping')
await browser.close().catch(() => {})
process.exit(0)

// ---- Per-gesture save + analysis (Node; hoisted — called from the exposed sink above) ------
function saveGesture(p) {
  const { frames, writes, calls, events, wheel } = p
  // Label by CONTENT: only a gesture that actually contains synthetic events is the selftest
  // (a real flick can land before the burst flushes; it must not steal the label).
  let tag
  if (pendingTag && wheel.some(w => w.synthetic)) { tag = pendingTag; pendingTag = null }
  else { gestureN++; tag = `gesture-${String(gestureN).padStart(2, '0')}` }

  // Motion phases: contiguous frames with movement, split by >= 3 still frames (~50ms).
  const phases = []
  let cur = null, still = 0
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i].pos - frames[i - 1].pos
    if (Math.abs(d) > 0.01) {
      if (!cur) cur = { startT: frames[i - 1].t, startPos: frames[i - 1].pos, minD: d, maxD: d, reversals: 0, lastSign: Math.sign(d) }
      else { if (Math.sign(d) !== cur.lastSign) cur.reversals++; cur.lastSign = Math.sign(d) }
      cur.minD = Math.min(cur.minD, d); cur.maxD = Math.max(cur.maxD, d)
      cur.endT = frames[i].t; cur.endPos = frames[i].pos
      still = 0
    } else if (cur) {
      still++
      if (still >= 3) { phases.push(cur); cur = null; still = 0 }
    }
  }
  if (cur) phases.push(cur)
  const lastWheelT = wheel.length ? wheel[wheel.length - 1].t : 0
  for (const ph of phases) {
    const w = writes.filter(x => x.t >= ph.startT - 1 && x.t <= ph.endT + 1)
    const byCaller = {}
    for (const x of w) byCaller[x.caller] = (byCaller[x.caller] || 0) + 1
    ph.writers = byCaller
    ph.scrollToCalls = calls.filter(c => c.t >= ph.startT - 20 && c.t <= ph.endT + 1).map(c => `${c.fn}(${c.left ?? c.arg},${c.behavior ?? ''}) @${c.t}ms by ${c.caller}`)
    ph.travel = +(ph.endPos - ph.startPos).toFixed(1)
    ph.durationMs = +(ph.endT - ph.startT).toFixed(0)
    ph.direction = ph.travel > 0 ? 'right' : 'left'
    ph.wheelEventsDuring = wheel.filter(x => x.t >= ph.startT && x.t <= ph.endT).length
    ph.startsAfterLastWheel = ph.startT > lastWheelT
    delete ph.lastSign
  }
  const gaps = phases.slice(1).map((ph, i) => +(ph.startT - phases[i].endT).toFixed(0))
  const motionReverses = phases.some((ph, i) => i > 0 && Math.sign(ph.travel) !== Math.sign(phases[i - 1].travel)) || phases.some(ph => ph.reversals > 0)
  // Pause-then-move: the strip came to rest (>=120ms) and then moved again with no wheel input in between.
  const pauseThenMove = phases.some((ph, i) => i > 0 && (ph.startT - phases[i - 1].endT) >= 120 && !wheel.some(w => w.t > phases[i - 1].endT && w.t <= ph.startT))

  // Velocity per frame (px/s) over a >= 16ms window (two rAF callbacks can land ~1ms apart,
  // which would make a single-frame quotient explode) + peak.
  let peakVel = 0, peakVelT = 0, peakFrameDelta = 0
  const vels = frames.map((f, i) => {
    if (!i) return 0
    let j = i - 1
    while (j > 0 && f.t - frames[j].t < 16) j--
    const dt = f.t - frames[j].t
    const d = f.pos - frames[j].pos
    const v = dt > 0 ? d / dt * 1000 : 0
    if (Math.abs(v) > Math.abs(peakVel)) { peakVel = v; peakVelT = f.t }
    const d1 = f.pos - frames[i - 1].pos
    if (Math.abs(d1) > Math.abs(peakFrameDelta)) peakFrameDelta = d1
    return v
  })
  // Glide: motion after the last wheel event.
  const posAtLastWheel = wheel.length ? wheel[wheel.length - 1].pos : p.startPos
  const lastMoveT = phases.length ? phases[phases.length - 1].endT : lastWheelT
  const glideDistance = +(p.endPos - posAtLastWheel).toFixed(1)
  const glideDurationMs = +Math.max(0, lastMoveT - lastWheelT).toFixed(0)
  const smoothCalls = calls.filter(c => c.fn === 'scrollTo' && c.behavior === 'smooth')
  const writesByCaller = writes.reduce((m, w) => ((m[w.caller] = (m[w.caller] || 0) + 1), m), {})
  const wheelSpanMs = wheel.length ? +(wheel[wheel.length - 1].t - wheel[0].t).toFixed(0) : 0
  const totalTravel = +(p.endPos - p.startPos).toFixed(1)
  const hudFinal = {
    raw: p.hudFinal,
    intent: (p.hudFinal.match(/intent:\s+(\S+)/) || [])[1] || '',
    ownership: (p.hudFinal.match(/ownership:\s+(\S+)/) || [])[1] || '',
    velocity: (p.hudFinal.match(/velocity:\s+(\S+)/) || [])[1] || '',
    target: (p.hudFinal.match(/target:\s+(\S+)/) || [])[1] || '',
  }

  // Gesture state machine + plan solves from the app's console lines, windowed to this gesture
  // (absolute page time = pageT0 + recorder time; the window is the pre-roll start .. last frame).
  const absStart = pageT0 + p.absT0
  const absEnd = absStart + (frames.length ? frames[frames.length - 1].t : 0)
  const gw = glog.window(absStart, absEnd)
  const states = frameStates(frames, gw.transitions, gw.initialState)
  const stateLine = formatStateLine(gw)
  glog.trim(absStart - 60000) // keep a minute of history for stateAt(); the window is already saved

  // Files.
  const csv = ['t_ms,scrollLeft,delta,vel_px_s,hud_intent,hud_ownership,hud_target,hud_velocity,state']
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]
    const d = i ? +(f.pos - frames[i - 1].pos).toFixed(2) : 0
    csv.push(`${f.t},${f.pos.toFixed(2)},${d},${vels[i].toFixed(0)},${f.intent},${f.ownership},${f.target},${f.velocity},${states[i]}`)
  }
  writeFileSync(resolve(outDir, `${tag}-frames.csv`), csv.join('\n'))
  const wcsv = ['t_ms,event_timeStamp,deltaX,deltaY,deltaMode,defaultPrevented,pos,onStrip,synthetic,hud_intent,hud_ownership,hud_velocity']
  for (const w of wheel) wcsv.push(`${w.t},${w.ts},${w.dx},${w.dy},${w.mode},${w.prevented},${w.pos},${w.onStrip},${w.synthetic},${w.intent},${w.ownership},${w.velocity}`)
  writeFileSync(resolve(outDir, `${tag}-wheel.csv`), wcsv.join('\n'))
  writeFileSync(resolve(outDir, `${tag}-writes.json`), JSON.stringify({ writes, calls, events }, null, 2))

  const oneLine = `${wheel.length} wheel evts over ${wheelSpanMs}ms (dx ${wheel.length ? Math.min(...wheel.map(w => w.dx)) : 0}..${wheel.length ? Math.max(...wheel.map(w => w.dx)) : 0}, mode ${[...new Set(wheel.map(w => w.mode))].join('/')}), travel ${totalTravel > 0 ? '+' : ''}${totalTravel}px in ${phases.length} phase(s)${gaps.length ? ' gaps ' + gaps.join('/') + 'ms' : ''}, peak ${peakVel.toFixed(0)}px/s, glide ${glideDistance}px/${glideDurationMs}ms, reverses=${motionReverses}, pauseThenMove=${pauseThenMove}, scrollTo(smooth)=${smoothCalls.length}, dockError=${p.dockError}px, HUD ${hudFinal.ownership}/${hudFinal.intent}${p.startedWhileMoving ? ', startedWhileMoving' : ''}${wheel.some(w => w.synthetic) ? ', SYNTHETIC' : ''} | ${stateLine}`

  const summary = {
    tag, savedAt: new Date().toISOString(), selftest: tag === 'selftest', ua: p.ua,
    absT0: p.absT0, prerollMs: p.prerollMs, firstWheelT: p.firstWheelT,
    startedWhileMoving: p.startedWhileMoving, msSinceLastChangeAtStart: p.msSinceLastChangeAtStart, msSinceLastWheelAtStart: p.msSinceLastWheelAtStart,
    wheelEvents: wheel.length, wheelSpanMs, deltaModes: [...new Set(wheel.map(w => w.mode))], syntheticEvents: wheel.filter(w => w.synthetic).length,
    startPos: p.startPos, endPos: p.endPos, totalTravel, nearestDock: p.nearestDock, dockError: p.dockError, dockCount: p.dockCount, viewportW: p.viewportW, scrollW: p.scrollW,
    phases, gapsBetweenPhasesMs: gaps, motionReverses, pauseThenMove,
    peakVelocityPxPerS: +peakVel.toFixed(0), peakVelocityAtMs: peakVelT, peakFrameDeltaPx: +peakFrameDelta.toFixed(1),
    glideDistancePx: glideDistance, glideDurationMs, lastWheelT, lastMoveT, posAtLastWheel,
    scrollToSmoothCalls: smoothCalls, scrollToCalls: calls, writesByCaller,
    scrollendEvents: events.filter(e => e.type === 'scrollend').map(e => `${e.t}ms@${e.at}`),
    scrollEventCount: events.filter(e => e.type === 'scroll').length,
    hudFinal,
    // State machine feed (`[gesture]` / `[plan]` console lines), gesture-relative t. planCount is
    // the total plans in this window, flicks the touches (DRAGGING entries); planViolation is a
    // plan with no DRAGGING since the previous plan (gesture-log.mjs, per-touch rule); each plan
    // also carries the HUD's own `#n` (its per-touch counter) for cross-checking.
    initialState: gw.initialState, transitions: gw.transitions, plans: gw.plans,
    planCount: gw.planCount, flicks: gw.flicks, hudPlanCount: gw.hudPlanCount, planViolation: gw.planViolation, stateLine,
    // `fired` keeps the plot script's contract: ticks along the bottom, one per wheel event.
    fired: wheel.map(w => ({ t: w.t, phase: w.synthetic ? 'inertia' : 'finger', dx: w.dx, dy: w.dy, mode: w.mode, intent: w.intent, ownership: w.ownership, velocity: w.velocity, pos: w.pos })),
    oneLine,
    files: { frames: `${tag}-frames.csv`, wheel: `${tag}-wheel.csv`, writes: `${tag}-writes.json`, png: `${tag}.png` },
  }
  writeFileSync(resolve(outDir, `${tag}-summary.json`), JSON.stringify(summary, null, 2))

  const plot = spawnSync('python3', [PLOT, outDir, resolve(outDir, `${tag}.png`), tag], { encoding: 'utf8' })
  if (plot.status !== 0) log(`plot failed for ${tag}: ${(plot.stderr || '').trim().split('\n').slice(-3).join(' | ')}`)
  console.log(`${tag === 'selftest' ? 'selftest' : 'gesture ' + tag.slice(8)} saved: ${oneLine}`)
}
