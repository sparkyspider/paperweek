#!/usr/bin/env node
// QA II bonus: docking physics feel-check — programmatic flicks should land docked flush-left
// with no visible stop-then-jump.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const strip = page.locator('.day-strip')
await strip.waitFor({ state: 'visible' })

async function flickAndTrace(dx) {
  const box = await strip.boundingBox()
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  // Simulate a flick: several fast mouse-wheel deltaX events (trackpad-style momentum flick).
  await page.mouse.move(startX, startY)
  const before = await strip.evaluate(el => el.scrollLeft)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(dx / 6, 0)
    await page.waitForTimeout(16)
  }
  // Sample scrollLeft at short intervals to build a velocity trace through the settle.
  const trace = []
  const t0 = Date.now()
  while (Date.now() - t0 < 1200) {
    const sl = await strip.evaluate(el => el.scrollLeft)
    trace.push({ t: Date.now() - t0, sl })
    await page.waitForTimeout(40)
  }
  const after = await strip.evaluate(el => el.scrollLeft)

  // Detect a "stop then jump": a run of near-zero deltas followed by a sudden large delta.
  let stopThenJump = false
  let maxJumpAfterStop = 0
  for (let i = 2; i < trace.length; i++) {
    const prevDelta = Math.abs(trace[i - 1].sl - trace[i - 2].sl)
    const delta = Math.abs(trace[i].sl - trace[i - 1].sl)
    if (prevDelta < 0.5 && delta > 3) {
      stopThenJump = true
      maxJumpAfterStop = Math.max(maxJumpAfterStop, delta)
    }
  }

  // Is the FINAL position flush with some card's left edge (a data-date card's x ~= strip's
  // own content-left, i.e. scrollLeft lands such that a card's left border sits at the
  // strip's padding edge)?
  const dockCheck = await page.evaluate(() => {
    const stripEl = document.querySelector('.day-strip')
    const cards = Array.from(stripEl.querySelectorAll('[data-date]'))
    const stripLeft = stripEl.getBoundingClientRect().left
    const cs = getComputedStyle(stripEl)
    const padLeft = parseFloat(cs.paddingLeft) || 0
    const targetX = stripLeft + padLeft
    let best = null
    for (const c of cards) {
      const r = c.getBoundingClientRect()
      const diff = Math.abs(r.left - targetX)
      if (best === null || diff < best.diff) best = { date: c.dataset.date, diff, left: r.left, targetX }
    }
    return best
  })

  return { before, after, trace, stopThenJump, maxJumpAfterStop, dockCheck }
}

const results = []
results.push({ flick: 'forward-strong', ...(await flickAndTrace(900)) })
await page.waitForTimeout(500)
results.push({ flick: 'backward-strong', ...(await flickAndTrace(-900)) })
await page.waitForTimeout(500)
results.push({ flick: 'forward-gentle', ...(await flickAndTrace(250)) })

// Trim traces in the printed summary (keep first/last few points + stats only).
const summary = results.map(r => ({
  flick: r.flick,
  before: r.before,
  after: r.after,
  stopThenJump: r.stopThenJump,
  maxJumpAfterStop: r.maxJumpAfterStop,
  dockedFlushDiffPx: r.dockCheck?.diff,
  dockedDate: r.dockCheck?.date,
  tracePointCount: r.trace.length,
  traceSample: r.trace.filter((_, i) => i % 4 === 0),
}))

console.log(JSON.stringify(summary, null, 2))
await browser.close()
