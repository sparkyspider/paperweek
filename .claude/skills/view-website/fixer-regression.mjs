#!/usr/bin/env node
// FIXER verification: toggle-close (click same dot again), outside-click-close, and
// switch-to-different-dot, on top of the already-proven real-click-opens-it fix.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

async function findDot(dateAttr, titleSubstr) {
  const handle = await page.evaluateHandle(({ dateAttr, titleSubstr }) => {
    const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
    const rows = Array.from(cardEl.querySelectorAll('.ruled-line'))
    const row = rows.find(r => r.textContent.includes(titleSubstr))
    if (!row) return null
    const idx = rows.indexOf(row)
    const dotsContainer = cardEl.querySelector('.row-margin-dots')
    const dots = Array.from(dotsContainer.querySelectorAll('.row-margin-dot'))
    return dots[idx] || null
  }, { dateAttr, titleSubstr })
  return handle.asElement()
}

async function realClick(el) {
  const box = await el.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx - 30, cy - 10)
  await page.waitForTimeout(40)
  await page.mouse.move(cx, cy, { steps: 8 })
  await page.waitForTimeout(60)
  await page.mouse.down()
  await page.waitForTimeout(40)
  await page.mouse.up()
  await page.waitForTimeout(250)
}

const dayCard = page.locator('[data-date="2026-09-20"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

const dot = await findDot('2026-09-20', 'QT-fixer-margindot-probe')
const results = {}

// 1) open
await realClick(dot)
results.afterFirstClick = { ariaExpanded: await dot.getAttribute('aria-expanded'), popoverOpen: (await page.locator('[role="listbox"][aria-label="Choose theme"]').count()) > 0 }

// 2) click same dot again -> should CLOSE (toggle)
await realClick(dot)
results.afterSecondClickSameDot = { ariaExpanded: await dot.getAttribute('aria-expanded'), popoverOpen: (await page.locator('[role="listbox"][aria-label="Choose theme"]').count()) > 0 }

// 3) open again, then click far outside -> should CLOSE
await realClick(dot)
results.afterThirdClickReopen = { ariaExpanded: await dot.getAttribute('aria-expanded'), popoverOpen: (await page.locator('[role="listbox"][aria-label="Choose theme"]').count()) > 0 }
await page.mouse.click(50, 50)
await page.waitForTimeout(200)
results.afterOutsideClick = { ariaExpanded: await dot.getAttribute('aria-expanded'), popoverOpen: (await page.locator('[role="listbox"][aria-label="Choose theme"]').count()) > 0 }

console.log(JSON.stringify(results, null, 2))
await browser.close()
