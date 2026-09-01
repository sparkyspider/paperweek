#!/usr/bin/env node
// FIXER forensics round 9: capture browser console output (temporary [FIXER] logs added to
// DaySection.vue's togglePicker/closePicker/onDocClick) during a real coordinate click.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const consoleLog = []
page.on('console', (msg) => {
  if (msg.text().includes('[FIXER]')) consoleLog.push(msg.text())
})
await rig.login(page, 'mark@flyh2.com', PW)

const dayCard = page.locator('[data-date="2026-09-20"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)

const dotHandle = await page.evaluateHandle((dateAttr) => {
  const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
  const rows = Array.from(cardEl.querySelectorAll('.ruled-line'))
  const row = rows.find(r => r.textContent.includes('QT-fixer-margindot-probe'))
  if (!row) return null
  const idx = rows.indexOf(row)
  const dotsContainer = cardEl.querySelector('.row-margin-dots')
  const dots = Array.from(dotsContainer.querySelectorAll('.row-margin-dot'))
  return dots[idx] || null
}, '2026-09-20')

const dotEl = dotHandle.asElement()
if (!dotEl) { console.log(JSON.stringify({ error: 'dot not found' })); await browser.close(); process.exit(1) }

const box = await dotEl.boundingBox()
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

const ariaExpanded = await dotEl.getAttribute('aria-expanded')
const popoverOpen = await page.locator('[role="listbox"][aria-label="Choose theme"]').count()

console.log(JSON.stringify({ consoleLog, ariaExpanded, popoverOpen: popoverOpen > 0 }, null, 2))
await browser.close()
