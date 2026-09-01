#!/usr/bin/env node
// Follow-up diagnostic for retest 10: does a plain (non-Vue) click listener attached directly
// to the dot button fire on the real coordinate click? Isolates DOM-level dispatch from
// Vue's own handler.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const dayCard = page.locator('[data-date="2026-09-12"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)

const dotHandle = await page.evaluateHandle((dateAttr) => {
  const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
  const rows = Array.from(cardEl.querySelectorAll('.ruled-line'))
  const row = rows.find(r => r.textContent.includes('QT-margindot probe'))
  const idx = rows.indexOf(row)
  const dotsContainer = cardEl.querySelector('.row-margin-dots')
  const dots = Array.from(dotsContainer.querySelectorAll('.row-margin-dot'))
  const el = dots[idx]
  // Attach a plain, non-Vue click listener directly on this exact node.
  window.__plainClickFired = 0
  window.__plainMousedownFired = 0
  el.addEventListener('mousedown', () => { window.__plainMousedownFired++ })
  el.addEventListener('click', (e) => { window.__plainClickFired++; window.__lastClickIsTrusted = e.isTrusted })
  return el
}, '2026-09-12')

const box = await dotHandle.asElement().boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2

await page.mouse.move(cx - 30, cy - 10)
await page.waitForTimeout(60)
await page.mouse.move(cx, cy, { steps: 8 })
await page.waitForTimeout(80)
await page.mouse.down()
await page.waitForTimeout(60)
await page.mouse.up()
await page.waitForTimeout(300)

const diag = await page.evaluate(() => ({
  plainMousedownFired: window.__plainMousedownFired,
  plainClickFired: window.__plainClickFired,
  lastClickIsTrusted: window.__lastClickIsTrusted,
}))

const popoverOpen = (await page.locator('[role="listbox"][aria-label="Choose theme"]').count()) > 0

console.log(JSON.stringify({ diag, popoverOpen }, null, 2))
await browser.close()
