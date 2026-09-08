#!/usr/bin/env node
// trackpad-rig.mjs — realistic synthetic trackpad stream (finger phase + OS inertia tail) fired
// at the day-strip's own wheel listener, with a per-frame scrollLeft trace and a log of EVERY
// JS write to scrollLeft (with the calling function, from the stack) so each motion phase can be
// attributed to the code path that produced it. No source edits: instrumentation is a property
// trap installed on the strip element at runtime.
//
// Usage:
//   PW=<password> node trackpad-rig.mjs <chromium|firefox> <fast|slow> [int|float] [line] [diag] [--out DIR]
//
// Stream shape (Marlow's spec): ~300ms finger at 60Hz, deltaX ramping 4 -> 40 (fast) or 2 -> 12
// (slow); lift; ~600ms inertia at 60Hz, deltaX decaying geometrically (ratio 0.9 fast / 0.93
// slow) down to ~1; then silence. `int` rounds every delta to an integer (what Chromium reports
// for a macOS trackpad); `float` leaves them fractional. `line` sends DOM_DELTA_LINE with
// dx/16 (Firefox line-mode convention the code normalises). `diag` makes two inertia samples
// slightly diagonal (deltaY > deltaX) to exercise the horizontal-intent gate.
import { chromium, firefox } from '/Users/sparkyspider/IdeaProjects/paperweek/.claude/skills/view-website/node_modules/playwright/index.mjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const argv = process.argv.slice(2)
const browserName = argv[0] === 'firefox' ? 'firefox' : 'chromium'
const flick = argv[1] === 'slow' ? 'slow' : 'fast'
const rounding = argv.includes('float') ? 'float' : 'int'
const lineMode = argv.includes('line')
const diag = argv.includes('diag')
const outIdx = argv.indexOf('--out')
const outDir = resolve(outIdx >= 0 ? argv[outIdx + 1] : '.')
mkdirSync(outDir, { recursive: true })
const tag = `${browserName}-${flick}-${rounding}${lineMode ? '-line' : ''}${diag ? '-diag' : ''}`
const PW = process.env.PW
if (!PW) { console.error('PW env var (password) required'); process.exit(2) }

// ---- Build the stream ---------------------------------------------------------------------
function buildStream() {
  const HZ = 1000 / 60
  const samples = []
  let t = 0
  const fingerN = 18 // ~300ms
  const [d0, d1] = flick === 'fast' ? [4, 40] : [2, 12]
  for (let i = 0; i < fingerN; i++) {
    const dx = d0 + (d1 - d0) * (i / (fingerN - 1))
    samples.push({ t, dx, dy: 0, phase: 'finger' })
    t += HZ
  }
  const inertiaN = 36 // ~600ms
  const r = flick === 'fast' ? 0.9 : 0.93
  let v = d1
  for (let i = 0; i < inertiaN; i++) {
    v *= r
    if (v < 1) break
    let dy = 0
    if (diag && (i === 3 || i === 9)) dy = v * 1.3
    samples.push({ t, dx: v, dy, phase: 'inertia' })
    t += HZ
  }
  for (const s of samples) {
    if (rounding === 'int') { s.dx = Math.round(s.dx); s.dy = Math.round(s.dy) }
    if (lineMode) { s.dx = s.dx / 16; s.dy = s.dy / 16 }
  }
  return samples
}
const stream = buildStream()

// ---- Drive the browser --------------------------------------------------------------------
const engine = browserName === 'firefox' ? firefox : chromium
const browser = await engine.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1600, height: 1000 },
  recordVideo: { dir: resolve(outDir, 'video'), size: { width: 1600, height: 1000 } },
})
const page = await context.newPage()
const consoleErrors = []
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message))

// Login through the real UI (same as the view-website rig).
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

// Install instrumentation + run the stream + trace, all in-page for tight timing.
const result = await page.evaluate(async ({ stream, lineMode }) => {
  const el = document.querySelector('.day-strip')
  const hud = () => (document.querySelector('div.font-mono.fixed')?.textContent ?? '')
  const T0 = performance.now()
  const now = () => +(performance.now() - T0).toFixed(1)
  const writes = []
  const calls = []
  const events = []

  // Trap every JS write to scrollLeft with its caller (from the stack; dev build = real names).
  const desc = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollLeft')
  function callerOf(stack) {
    const lines = (stack || '').split('\n').map(s => s.trim()).filter(Boolean)
    // Chromium: "at fn (url)"; Firefox: "fn@url". Skip our own trap frame(s).
    const names = []
    for (const l of lines) {
      let m = l.match(/^at\s+([^\s(]+)/) || l.match(/^([^@]+)@/)
      if (!m) continue
      const n = m[1]
      if (n === 'set' || n === 'Error' || n === 'set scrollLeft' || n.includes('callerOf')) continue
      names.push(n)
    }
    return names.slice(0, 3).join('<')
  }
  Object.defineProperty(el, 'scrollLeft', {
    configurable: true,
    get() { return desc.get.call(this) },
    set(v) {
      writes.push({ t: now(), from: desc.get.call(this), to: v, caller: callerOf(new Error().stack) })
      desc.set.call(this, v)
    },
  })
  const origScrollTo = el.scrollTo.bind(el)
  el.scrollTo = function (...args) {
    const o = args[0]
    calls.push({ t: now(), fn: 'scrollTo', left: typeof o === 'object' ? o.left : args[0], behavior: o?.behavior, at: desc.get.call(el), caller: callerOf(new Error().stack) })
    return origScrollTo(...args)
  }
  const origScrollBy = el.scrollBy.bind(el)
  el.scrollBy = function (...args) { calls.push({ t: now(), fn: 'scrollBy', arg: JSON.stringify(args[0]), caller: callerOf(new Error().stack) }); return origScrollBy(...args) }
  for (const type of ['scroll', 'scrollend']) el.addEventListener(type, () => events.push({ t: now(), type, at: desc.get.call(el) }))

  // Per-frame trace.
  const frames = []
  let stop = false
  let lastPos = desc.get.call(el)
  let lastChangeT = now()
  let streamDone = false
  function frame() {
    const t = now()
    const pos = desc.get.call(el)
    if (Math.abs(pos - lastPos) > 0.01) lastChangeT = t
    lastPos = pos
    frames.push({ t, pos, hud: hud().replace(/\s+/g, ' ') })
    if (streamDone && t - lastChangeT > 2000) { stop = true; return }
    if (t > 12000) { stop = true; return }
    requestAnimationFrame(frame)
  }
  requestAnimationFrame(frame)

  // Fire the stream at its scheduled times (drift-corrected setTimeout).
  const startPos = desc.get.call(el)
  const fired = []
  await new Promise(res => {
    let i = 0
    const base = performance.now() + 50
    function fire() {
      if (i >= stream.length) { streamDone = true; res(); return }
      const s = stream[i++]
      const ev = new WheelEvent('wheel', {
        deltaX: s.dx, deltaY: s.dy, deltaMode: lineMode ? 1 : 0, bubbles: true, cancelable: true, clientX: 800, clientY: 500,
      })
      const notCancelled = el.dispatchEvent(ev)
      const h = hud()
      const intent = (h.match(/intent:\s+(\S+)/) || [])[1]
      const own = (h.match(/ownership:\s+(\S+)/) || [])[1]
      const vel = (h.match(/velocity:\s+(\S+)/) || [])[1]
      fired.push({ t: now(), phase: s.phase, dx: +s.dx.toFixed(3), dy: +s.dy.toFixed(3), preventDefault: !notCancelled, intent, ownership: own, velocity: vel, pos: +desc.get.call(el).toFixed(1) })
      const next = base + (i < stream.length ? stream[i].t : 0)
      if (i < stream.length) setTimeout(fire, Math.max(0, next - performance.now()))
      else { streamDone = true; res() }
    }
    setTimeout(fire, Math.max(0, base + stream[0].t - performance.now()))
  })
  while (!stop) await new Promise(r => setTimeout(r, 50))

  // Dock geometry at the end: is the final scrollLeft on a card's docked left?
  const docks = Array.from(el.querySelectorAll('[data-date]'), k => k.offsetLeft - 20)
  const endPos = desc.get.call(el)
  const nearest = docks.reduce((b, d) => (Math.abs(d - endPos) < Math.abs(b - endPos) ? d : b), docks[0])
  return { startPos, endPos, nearestDock: nearest, dockError: +(endPos - nearest).toFixed(2), frames, writes, calls, events, fired, hudFinal: hud() }
}, { stream, lineMode })

// Final HUD screenshot + video.
const shotPath = resolve(outDir, `${tag}-hud-final.png`)
await page.screenshot({ path: shotPath, clip: { x: 0, y: 0, width: 1600, height: 1000 } })
const video = page.video()
await context.close()
let videoPath = null
if (video) { videoPath = resolve(outDir, 'video', `${tag}.webm`); await video.saveAs(videoPath) }
await browser.close()

// ---- Analyse ------------------------------------------------------------------------------
const { frames, writes, calls, events, fired } = result
// Motion phases: contiguous frames with movement, split by >= 3 still frames (~50ms).
const phases = []
let cur = null
let still = 0
for (let i = 1; i < frames.length; i++) {
  const d = frames[i].pos - frames[i - 1].pos
  if (Math.abs(d) > 0.01) {
    if (!cur) cur = { startT: frames[i - 1].t, startPos: frames[i - 1].pos, minD: d, maxD: d, reversals: 0, lastSign: Math.sign(d) }
    else {
      if (Math.sign(d) !== cur.lastSign) cur.reversals++
      cur.lastSign = Math.sign(d)
    }
    cur.minD = Math.min(cur.minD, d); cur.maxD = Math.max(cur.maxD, d)
    cur.endT = frames[i].t; cur.endPos = frames[i].pos
    still = 0
  } else if (cur) {
    still++
    if (still >= 3) { phases.push(cur); cur = null; still = 0 }
  }
}
if (cur) phases.push(cur)
for (const p of phases) {
  const w = writes.filter(x => x.t >= p.startT - 1 && x.t <= p.endT + 1)
  const byCaller = {}
  for (const x of w) byCaller[x.caller] = (byCaller[x.caller] || 0) + 1
  p.writers = byCaller
  p.scrollToCalls = calls.filter(c => c.t >= p.startT - 20 && c.t <= p.endT + 1).map(c => `${c.fn}(${c.left ?? c.arg},${c.behavior ?? ''}) @${c.t}ms by ${c.caller}`)
  p.travel = +(p.endPos - p.startPos).toFixed(1)
  p.durationMs = +(p.endT - p.startT).toFixed(0)
  p.direction = p.travel > 0 ? 'right' : 'left'
  delete p.lastSign
}
const gaps = phases.slice(1).map((p, i) => +(p.startT - phases[i].endT).toFixed(0))
const overallReversal = phases.some((p, i) => i > 0 && Math.sign(p.travel) !== Math.sign(phases[i - 1].travel)) || phases.some(p => p.reversals > 0)

// CSV
const csv = ['t_ms,scrollLeft,delta,hud_intent,hud_ownership,hud_target']
for (let i = 0; i < frames.length; i++) {
  const f = frames[i]
  const d = i ? +(f.pos - frames[i - 1].pos).toFixed(2) : 0
  const intent = (f.hud.match(/intent:\s+(\S+)/) || [])[1] || ''
  const own = (f.hud.match(/ownership:\s+(\S+)/) || [])[1] || ''
  const tgt = (f.hud.match(/target:\s+(\S+)/) || [])[1] || ''
  csv.push(`${f.t},${f.pos.toFixed(2)},${d},${intent},${own},${tgt}`)
}
writeFileSync(resolve(outDir, `${tag}-frames.csv`), csv.join('\n'))

// ASCII sketch: per-frame velocity bar + caller letter, until last movement + 300ms.
const lastMoveT = phases.length ? phases[phases.length - 1].endT : 0
const sketch = [`# ${tag}: per-frame scrollLeft delta (px). '>' right, '<' left. Caller: W=onWheel S=runTakeover.step T=scrollTo(smooth, native) A=withAnchor`]
for (let i = 1; i < frames.length; i++) {
  const f = frames[i]
  if (f.t > lastMoveT + 300) break
  const d = f.pos - frames[i - 1].pos
  const w = writes.filter(x => x.t > frames[i - 1].t && x.t <= f.t)
  const cs = calls.filter(x => x.t > frames[i - 1].t && x.t <= f.t)
  const letters = [...new Set([...w.map(x => x.caller.startsWith('onWheel') ? 'W' : x.caller.startsWith('step') ? 'S' : x.caller.includes('withAnchor') ? 'A' : '?' + x.caller.split('<')[0]), ...cs.map(() => 'T')])].join('')
  const bar = (d > 0 ? '>' : '<').repeat(Math.min(60, Math.round(Math.abs(d))))
  const ev = fired.filter(x => x.t > frames[i - 1].t && x.t <= f.t).map(x => `${x.phase[0]}:${x.dx}${x.dy ? '/' + x.dy : ''}->${x.intent}`).join(' ')
  sketch.push(`${String(f.t).padStart(7)}ms ${f.pos.toFixed(0).padStart(6)} ${String(d.toFixed(1)).padStart(6)} ${letters.padEnd(3)} ${bar.padEnd(42)} ${ev}`)
}
writeFileSync(resolve(outDir, `${tag}-sketch.txt`), sketch.join('\n'))

const summary = {
  tag, browserName, flick, rounding, lineMode, diag,
  streamSamples: stream.length, streamMs: +stream[stream.length - 1].t.toFixed(0),
  startPos: result.startPos, endPos: result.endPos, nearestDock: result.nearestDock, dockError: result.dockError,
  phases, gapsBetweenPhasesMs: gaps, motionReverses: overallReversal,
  writesByCaller: writes.reduce((m, w) => ((m[w.caller] = (m[w.caller] || 0) + 1), m), {}),
  scrollToCalls: calls,
  scrollendEvents: events.filter(e => e.type === 'scrollend').map(e => `${e.t}ms@${e.at.toFixed(1)}`),
  scrollEventCount: events.filter(e => e.type === 'scroll').length,
  fired,
  consoleErrors,
  files: { csv: `${tag}-frames.csv`, sketch: `${tag}-sketch.txt`, hudShot: shotPath, video: videoPath },
}
writeFileSync(resolve(outDir, `${tag}-summary.json`), JSON.stringify(summary, null, 2))
writeFileSync(resolve(outDir, `${tag}-writes.json`), JSON.stringify({ writes, calls, events }, null, 2))
console.log(JSON.stringify({ tag, phases: phases.map(p => ({ ...p, writers: p.writers, scrollToCalls: p.scrollToCalls })), gaps, motionReverses: overallReversal, dockError: result.dockError, scrollend: summary.scrollendEvents.length, consoleErrors }, null, 2))
