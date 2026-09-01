#!/usr/bin/env node
// Verify paperweek.last-used-theme localStorage round-trips correctly and drives the default
// theme for a NEW day-card task, across a reload.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

// Set it the way the APP itself does (raw string, not JSON) and confirm it survives a reload
// and is read back as the exact same raw string (composable does getItem/setItem directly).
await page.evaluate(() => {
  localStorage.setItem('paperweek.last-used-theme', 'acfd6d5c-f636-43e9-b7a4-98d73ce38f2b') // Personal
})
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

const readBack = await page.evaluate(() => ({
  raw: localStorage.getItem('paperweek.last-used-theme'),
  isValidJsonToo: (() => { try { JSON.parse(localStorage.getItem('paperweek.last-used-theme')); return true } catch { return false } })(),
}))

// Now click an empty line on a fresh day, type a task, and check the draft's default theme
// dot color matches "Personal"'s color (read from a swatch we can cross-check via API separately).
const dayCard = page.locator('[data-date="2026-09-21"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
const emptyLine = page.locator('[data-date="2026-09-21"] .ruled-line.cursor-text').first()
await emptyLine.click()
await page.waitForTimeout(200)
await page.keyboard.type('QT-lastused-probe', { delay: 15 })
await page.waitForTimeout(200)
const draftDotColor = await page.evaluate(() => {
  const cardEl = document.querySelector('[data-date="2026-09-21"]')
  const dot = cardEl.querySelector('.row-margin-dot')
  return dot ? getComputedStyle(dot).backgroundColor : null
})
await page.keyboard.press('Escape') // revert, don't actually save the probe task
await page.waitForTimeout(200)

console.log(JSON.stringify({ readBack, draftDotColor }, null, 2))
await browser.close()
