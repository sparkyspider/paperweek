#!/usr/bin/env node
// FIXER no-regression checks: strike-calm (click task text, no lingering accent) and ghost-dot
// click-to-unmute (muted theme) — both real coordinate clicks.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const dayCard = page.locator('[data-date="2026-09-20"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

const results = {}

// --- Strike-calm: click the task TEXT (not the dot) ---
const taskText = page.locator('[data-date="2026-09-20"] [role="button"][aria-pressed]', { hasText: 'QT-fixer-margindot-probe' }).first()
const box = await taskText.boundingBox()
const cx = box.x + box.width / 2
const cy = box.y + box.height / 2
await page.mouse.move(cx - 20, cy)
await page.waitForTimeout(40)
await page.mouse.move(cx, cy, { steps: 6 })
await page.waitForTimeout(40)
await page.mouse.down()
await page.waitForTimeout(30)
await page.mouse.up()
await page.waitForTimeout(400)

const strikeState = await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('[role="button"][aria-pressed]')).find(r => r.textContent.includes('QT-fixer-margindot-probe'))
  const hasStrike = !!row?.querySelector('.ink-strike')
  const activeIsBody = document.activeElement === document.body
  return { hasStrike, activeIsBody, ariaPressed: row?.getAttribute('aria-pressed') }
})
results.strikeCalm = strikeState

// revert the strike (click again) to leave data clean
await page.mouse.move(cx, cy)
await page.mouse.down()
await page.waitForTimeout(30)
await page.mouse.up()
await page.waitForTimeout(400)
results.afterRevert = await page.evaluate(() => {
  const row = Array.from(document.querySelectorAll('[role="button"][aria-pressed]')).find(r => r.textContent.includes('QT-fixer-margindot-probe'))
  return { ariaPressed: row?.getAttribute('aria-pressed') }
})

// --- Ghost-dot: mute the QT-SenseTest theme directly via the app's own localStorage key/shape
// (paperweek.hidden-themes = JSON array of theme ids). The theme is archived (not listed in the
// sidebar), but its already-scheduled task's ghost-dot rendering only depends on this flag. ---
await page.evaluate(() => {
  localStorage.setItem('paperweek.hidden-themes', JSON.stringify(['5fd7f647-6ea0-42f2-99e9-cc4d6c5a4865']))
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2500)
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

const ghostDot = page.locator('[data-date="2026-09-20"] .row-margin-dot--ghost').first()
results.ghostDotVisible = (await ghostDot.count()) > 0
results.taskTextHiddenWhileMuted = (await page.locator('[data-date="2026-09-20"]', { hasText: 'QT-fixer-margindot-probe' }).count()) === 0

if (await ghostDot.count()) {
  const gbox = await ghostDot.boundingBox()
  const gcx = gbox.x + gbox.width / 2
  const gcy = gbox.y + gbox.height / 2
  await page.mouse.move(gcx - 10, gcy)
  await page.waitForTimeout(30)
  await page.mouse.move(gcx, gcy, { steps: 5 })
  await page.waitForTimeout(30)
  await page.mouse.down()
  await page.waitForTimeout(30)
  await page.mouse.up()
  await page.waitForTimeout(300)
  results.afterGhostClick = {
    themeVisibleAgain: await page.evaluate(() => {
      try { return !JSON.parse(localStorage.getItem('paperweek.hidden-themes') || '[]').includes('5fd7f647-6ea0-42f2-99e9-cc4d6c5a4865') } catch { return null }
    }),
    taskTextVisible: (await page.locator('[data-date="2026-09-20"]', { hasText: 'QT-fixer-margindot-probe' }).count()) > 0,
    noPickerOpened: (await page.locator('[role="listbox"][aria-label="Choose theme"]').count()) === 0,
  }
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
