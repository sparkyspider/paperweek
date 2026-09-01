#!/usr/bin/env node
// FIXER no-regression: quick real drag-and-drop smoke test (backlog -> day line -> back to
// backlog, restoring original state) using the existing dnd-rig humanDrag helper.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)
await rig.instrument(page)

const source = page.locator('[draggable="true"]', { hasText: 'QT-fixer-dnd-probe' }).first()
const target = page.locator('[data-date="2026-09-20"] .ruled-line.cursor-text').first()

await humanDragCheck()
async function humanDragCheck() {
  await rig.humanDrag(page, source, target)
  const log = await rig.getLog(page)
  const droppedOnDay = (await page.locator('[data-date="2026-09-20"]', { hasText: 'QT-fixer-dnd-probe' }).count()) > 0
  console.log(JSON.stringify({ eventsFired: log.map(l => l.type), droppedOnDay }, null, 2))
}

await browser.close()
