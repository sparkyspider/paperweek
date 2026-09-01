#!/usr/bin/env node
// QA II Retest 6: week-density stroke — 0 tasks no underline, 1-2 faint, 3+ confident.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const dates = {
  '2026-09-14': '0 tasks (control)',
  '2026-09-15': '1 task',
  '2026-09-16': '2 tasks',
  '2026-09-17': '3 tasks',
}

const card14 = page.locator('[data-date="2026-09-17"]')
await card14.scrollIntoViewIfNeeded()
await page.waitForTimeout(500)

const out = {}
for (const [date, desc] of Object.entries(dates)) {
  const el = page.locator(`[data-date="${date}"] .date-density-underline`)
  const count = await el.count()
  let opacity = null
  let visible = false
  if (count) {
    opacity = await el.first().evaluate(e => getComputedStyle(e).getPropertyValue('--density-opacity').trim() || getComputedStyle(e).opacity)
    visible = await el.first().isVisible()
  }
  out[date] = { desc, elementCount: count, opacity, visible }
}

await page.screenshot({ path: `${SCR}/qa2-t6-density-full.png` })
// zoomed crop across the 4 date headers
const bb0 = await page.locator('[data-date="2026-09-14"] .date-density-underline, [data-date="2026-09-14"]').first().boundingBox()
const bb3 = await page.locator('[data-date="2026-09-17"]').first().boundingBox()
if (bb0 && bb3) {
  await page.screenshot({
    path: `${SCR}/qa2-t6-density-zoom.png`,
    clip: { x: bb0.x, y: bb0.y, width: (bb3.x + bb3.width) - bb0.x, height: 60 },
  })
}

console.log(JSON.stringify(out, null, 2))
await browser.close()
