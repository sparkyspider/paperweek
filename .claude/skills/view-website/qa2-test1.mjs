#!/usr/bin/env node
// QA II Retest 1: End/Home edit trap (day-card + sidebar)
import * as rig from './dnd-rig.mjs'
import { readFileSync } from 'node:fs'

const PW = process.env.PW
const fx = JSON.parse(readFileSync('./qa2-fixture.json', 'utf8'))
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const results = {}

async function testDayCard() {
  // Navigate: today is 2026-09-01, task scheduled 2026-09-08 morning (t1day)
  // Scroll the strip to find the day card for 09-08.
  const card = page.locator('[data-date="2026-09-08"]')
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(300)
  const row = card.locator('text=QT-EndHome probe day').first()
  await row.scrollIntoViewIfNeeded()
  await row.dblclick()
  await page.waitForTimeout(200)
  const input = card.locator('input[type=text]:visible').first()
  await input.waitFor({ state: 'visible', timeout: 3000 })
  const beforeVal = await input.inputValue()

  // END then type
  await input.press('End')
  await input.type('-END', { delay: 30 })
  let val = await input.inputValue()
  results.dayEnd = { before: beforeVal, after: val, verdict: val === beforeVal + '-END' ? 'PASS' : 'FAIL' }

  // HOME then type
  await input.press('Home')
  await input.type('HOME-', { delay: 30 })
  val = await input.inputValue()
  results.dayHome = { after: val, verdict: val === 'HOME-' + beforeVal + '-END' ? 'PASS' : 'FAIL' }

  // Cmd+ArrowRight / Cmd+ArrowLeft
  await input.press('Meta+ArrowRight')
  await input.type('[R]', { delay: 30 })
  val = await input.inputValue()
  const expectAfterRight = 'HOME-' + beforeVal + '-END[R]'
  results.dayCmdRight = { after: val, verdict: val === expectAfterRight ? 'PASS' : 'FAIL' }

  await input.press('Meta+ArrowLeft')
  await input.type('[L]', { delay: 30 })
  val = await input.inputValue()
  const expectAfterLeft = '[L]' + expectAfterRight
  results.dayCmdLeft = { after: val, verdict: val === expectAfterLeft ? 'PASS' : 'FAIL' }

  await page.screenshot({ path: `${SCR}/qa2-t1-daycard-edit.png` })
  results.dayFinalValueBeforeSave = val
  await input.press('Enter').catch(() => {})
  await page.waitForTimeout(500)
}

async function testSidebar() {
  const sideCard = page.locator('text=QT-SenseTest').first().locator('xpath=ancestor::*[contains(@class,"theme") or self::div][1]')
  // Simpler: find the row by text within the whole sidebar
  const row = page.locator('text=QT-EndHome probe side').first()
  await row.scrollIntoViewIfNeeded()
  await row.dblclick()
  await page.waitForTimeout(200)
  const input = page.locator('input[type=text]:visible').first()
  await input.waitFor({ state: 'visible', timeout: 3000 })
  const beforeVal = await input.inputValue()

  await input.press('End')
  await input.type('-END', { delay: 30 })
  let val = await input.inputValue()
  results.sideEnd = { before: beforeVal, after: val, verdict: val === beforeVal + '-END' ? 'PASS' : 'FAIL' }

  await input.press('Home')
  await input.type('HOME-', { delay: 30 })
  val = await input.inputValue()
  results.sideHome = { after: val, verdict: val === 'HOME-' + beforeVal + '-END' ? 'PASS' : 'FAIL' }

  await page.screenshot({ path: `${SCR}/qa2-t1-sidebar-edit.png` })
  results.sideFinalValueBeforeSave = val
  await input.press('Enter').catch(() => {})
  await page.waitForTimeout(500)
}

try {
  await testDayCard()
} catch (e) {
  results.dayCardError = e.message
}
try {
  await testSidebar()
} catch (e) {
  results.sidebarError = e.message
}

// reload-verify persistence
try {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  const dayText = await page.locator('[data-date="2026-09-08"]').locator('text=HOME-').first().textContent().catch(() => null)
  results.dayReloadText = dayText
  const sideText = await page.locator('text=HOME-').first().textContent().catch(() => null)
  results.sideReloadTextIncludes = sideText
} catch (e) {
  results.reloadError = e.message
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
