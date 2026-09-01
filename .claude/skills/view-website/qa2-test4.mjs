#!/usr/bin/env node
// QA II Retest 4: first-drag teaching note + task-row hover-lift (1px)
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)
await rig.instrument(page)

const results = {}

// Clear the teaching flag, then reload so the app re-reads localStorage fresh.
await page.evaluate(() => localStorage.removeItem('paperweek.has-dragged'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1000)

const todayCard = page.locator('[data-date="2026-09-01"]')
await todayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

const noteBefore = await todayCard.locator('.first-drag-note').count()
results.noteVisibleBeforeDrag = noteBefore > 0
await page.screenshot({ path: `${SCR}/qa2-t4-note-before.png` })

// Hover-lift check on a task row (use the QT-teach drag probe row in the sidebar backlog).
const sourceRow = page.locator('.task-row-lift', { hasText: 'QT-teach drag probe' }).first()
const beforeHoverTransform = await sourceRow.evaluate(el => getComputedStyle(el).transform)
await sourceRow.hover()
await page.waitForTimeout(250)
const afterHoverTransform = await sourceRow.evaluate(el => getComputedStyle(el).transform)
results.hoverLift = { beforeHoverTransform, afterHoverTransform, changed: beforeHoverTransform !== afterHoverTransform }

// Perform the drag: sidebar QT-teach drag probe -> today's Morning first line.
const target = todayCard.locator('.section-lines .ruled-line').first()
await rig.humanDrag(page, sourceRow, target, { onMid: async () => { await page.screenshot({ path: `${SCR}/qa2-t4-mid-drag.png` }) } })
await page.waitForTimeout(500)

const log = await rig.getLog(page)
results.dndEvents = log.map(l => l.type)

const noteAfterDrop = await todayCard.locator('.first-drag-note').count()
results.noteVisibleAfterDrop = noteAfterDrop > 0
await page.screenshot({ path: `${SCR}/qa2-t4-note-after-drop.png` })

const flagAfter = await page.evaluate(() => localStorage.getItem('paperweek.has-dragged'))
results.flagAfterDrop = flagAfter

// reload-verify: note stays gone
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const noteAfterReload = await todayCard.locator('.first-drag-note').count()
results.noteVisibleAfterReload = noteAfterReload > 0
await page.screenshot({ path: `${SCR}/qa2-t4-note-after-reload.png` })

results.verdict = {
  notePreconditionShows: noteBefore > 0 ? 'PASS' : 'FAIL',
  noteGoneAfterDrag: noteAfterDrop === 0 ? 'PASS' : 'FAIL',
  noteStaysGoneAfterReload: noteAfterReload === 0 ? 'PASS' : 'FAIL',
  hoverLiftChanged: results.hoverLift.changed ? 'PASS' : 'FAIL/INCONCLUSIVE',
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
