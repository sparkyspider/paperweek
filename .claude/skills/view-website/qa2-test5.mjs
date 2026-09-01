#!/usr/bin/env node
// QA II Retest 5: unschedule via drag onto theme card issues exactly ONE PATCH.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const patchRequests = []
page.on('request', (req) => {
  if (req.method() === 'PATCH' && req.url().includes('/api/tasks/')) {
    patchRequests.push({ url: req.url(), postData: req.postData() })
  }
})

const dayCard = page.locator('[data-date="2026-09-09"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

const source = dayCard.locator('text=QT-unschedule probe').first()
await source.scrollIntoViewIfNeeded()
await page.screenshot({ path: `${SCR}/qa2-t5-before.png` })

const themeCard = page.locator('text=QT-SenseTest').first()

await rig.humanDrag(page, source, themeCard, { settleDelay: 1500 })
await page.waitForTimeout(1000)

await page.screenshot({ path: `${SCR}/qa2-t5-after.png` })

const results = {
  patchCount: patchRequests.length,
  patches: patchRequests,
  verdict: patchRequests.length === 1 ? 'PASS' : 'FAIL',
}

// reload-verify the task is now unscheduled
const token = await rig.freshToken('mark@flyh2.com', PW)
const api = rig.apiClient(token)
const backlog = await api('/api/tasks?themeId=5fd7f647-6ea0-42f2-99e9-cc4d6c5a4865&backlog=true')
const found = backlog.find(t => t.title === 'QT-unschedule probe')
results.unscheduledConfirmed = !!found
results.taskState = found ? { scheduledOn: found.scheduledOn, daypart: found.daypart, themeId: found.themeId } : null

console.log(JSON.stringify(results, null, 2))
await browser.close()
