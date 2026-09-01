#!/usr/bin/env node
// QA II Retest 10 (HIGH-SUSPECT): margin-dot theme picker via REAL coordinate mouse click
// (page.mouse.move/down/up at the dot's visual centre — NOT el.click()).
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const results = {}
const dayCard = page.locator('[data-date="2026-09-12"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)

const dot = dayCard.locator('.row-margin-dot[aria-haspopup="listbox"]', { hasText: '' }).first()
// Scope more precisely: the row-margin-dot associated with "QT-margindot probe"'s line.
const dotHandle = await page.evaluateHandle((dateAttr) => {
  const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
  const rows = Array.from(cardEl.querySelectorAll('.ruled-line'))
  const row = rows.find(r => r.textContent.includes('QT-margindot probe'))
  if (!row) return null
  // The margin dot is a SIBLING overlay, not inside .ruled-line — find it by matching
  // vertical alignment (same top offset) within the .row-margin-dots container.
  const idx = rows.indexOf(row)
  const dotsContainer = cardEl.querySelector('.row-margin-dots')
  const dots = Array.from(dotsContainer.querySelectorAll('.row-margin-dot'))
  return dots[idx] || null
}, '2026-09-12')

const dotEl = dotHandle.asElement()
if (!dotEl) {
  console.log(JSON.stringify({ error: 'margin dot element not found' }))
  await browser.close()
  process.exit(1)
}

const box = await dotEl.boundingBox()
results.dotBoundingBox = box
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

await page.screenshot({ path: `${SCR}/qa2-t10-before-click.png` })

// elementFromPoint BEFORE the click (what's actually hit-testable there right now).
const preClickHitTest = await page.evaluate(({ x, y }) => {
  const el = document.elementFromPoint(x, y)
  function describe(e) {
    if (!e) return null
    const cs = getComputedStyle(e)
    return {
      tag: e.tagName, cls: e.className?.toString().slice(0, 80),
      pointerEvents: cs.pointerEvents, zIndex: cs.zIndex, position: cs.position,
    }
  }
  // Walk up a few ancestors too, for the stacking picture.
  const chain = []
  let cur = el
  for (let i = 0; i < 5 && cur; i++) { chain.push(describe(cur)); cur = cur.parentElement }
  return { topElement: describe(el), ancestorChain: chain }
}, { x: cx, y: cy })
results.preClickElementFromPoint = preClickHitTest

// Instrument capture-phase mousedown/mouseup/click at window level to see exactly what fires.
await page.evaluate(() => {
  window.__clickLog = []
  for (const t of ['mousedown', 'mouseup', 'click']) {
    window.addEventListener(t, (e) => {
      window.__clickLog.push({
        type: t, x: e.clientX, y: e.clientY,
        targetTag: e.target.tagName, targetCls: (e.target.className || '').toString().slice(0, 60),
        defaultPrevented: e.defaultPrevented,
      })
    }, true)
  }
})

// REAL coordinate-based mouse click — human-style move, down, up (NOT el.click()).
await page.mouse.move(cx - 30, cy - 10)
await page.waitForTimeout(60)
await page.mouse.move(cx, cy, { steps: 8 })
await page.waitForTimeout(80)
await page.mouse.down()
await page.waitForTimeout(60)
await page.mouse.up()

// Check immediately (0ms) and again after settle, to catch an open-then-instantly-close.
const immediate = await page.evaluate(() => {
  const btn = document.querySelector('.row-margin-dot[aria-expanded]')
  const anyListbox = document.querySelector('[role="listbox"]')
  return {
    ariaExpandedOnDot: btn ? btn.getAttribute('aria-expanded') : null,
    anyListboxInDom: !!anyListbox,
    listboxOuterHTMLSnippet: anyListbox ? anyListbox.outerHTML.slice(0, 200) : null,
  }
})
results.immediateAfterMouseUp = immediate

await page.waitForTimeout(400)

const clickLog = await page.evaluate(() => window.__clickLog || [])
results.clickLog = clickLog

await page.screenshot({ path: `${SCR}/qa2-t10-after-click.png` })

// THE result for the real coordinate-based click, measured BEFORE any fallback/control action.
const popoverCount = await page.locator('[role="listbox"][aria-label="Choose theme"]').count()
results.popoverOpened = popoverCount > 0
results.realClickVerdict = results.popoverOpened ? 'PASS' : 'FAIL'

// Control A/B (only runs if the real click failed): does el.click() (programmatic) open it,
// on the SAME element? Isolates whether it's specifically the real-mouse event path that
// fails vs. the picker being broken outright. This is a SEPARATE, clearly labeled measurement —
// it must not influence realClickVerdict above, which was already captured.
if (!results.popoverOpened) {
  await dotEl.evaluate(el => el.click())
  await page.waitForTimeout(300)
  results.programmaticClickOpensPopover = (await page.locator('[role="listbox"][aria-label="Choose theme"]').count()) > 0
  await page.screenshot({ path: `${SCR}/qa2-t10-after-programmatic-click.png` })
  if (results.programmaticClickOpensPopover) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(200)
  }
}

if (!results.popoverOpened) {
  // Failure path — gather full forensics as instructed.
  const forensics = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y)
    function describe(e) {
      if (!e) return null
      const cs = getComputedStyle(e)
      const r = e.getBoundingClientRect()
      return {
        tag: e.tagName, cls: e.className?.toString().slice(0, 120),
        pointerEvents: cs.pointerEvents, zIndex: cs.zIndex, position: cs.position,
        rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      }
    }
    const chain = []
    let cur = el
    for (let i = 0; i < 6 && cur; i++) { chain.push(describe(cur)); cur = cur.parentElement }
    // Also grab the dot button itself + its container for comparison.
    return { elementFromPointAtClick: describe(el), ancestorChain: chain }
  }, { x: cx, y: cy })
  results.failureForensics = forensics
  results.verdict = 'FAIL (HIGH-SUSPECT CONFIRMED)'
} else {
  results.verdict = 'PASS'
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
