#!/usr/bin/env node
// QA II Retest 2: full-width day-card compose — no inline swatch row, zero left-edge jump
// draft->saved, new task defaults to last-used theme.
import * as rig from './dnd-rig.mjs'
import { writeFileSync } from 'node:fs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'
const QT_THEME = '5fd7f647-6ea0-42f2-99e9-cc4d6c5a4865' // QT-SenseTest

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const results = {}

// Force last-used-theme to QT-SenseTest so we can assert the default deterministically.
await page.evaluate((id) => localStorage.setItem('paperweek.last-used-theme', id), QT_THEME)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const card = page.locator('[data-date="2026-09-13"]')
await card.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

// Click the first empty Morning line in that card.
const morningLine = card.locator('.section-lines .ruled-line').first()
await morningLine.click()
await page.waitForTimeout(200)

const input = card.locator('input.diary-input, .diary-input').first()
await input.waitFor({ state: 'visible', timeout: 3000 })
const draftBox = await input.boundingBox()
results.draftBox = draftBox

// Check for any inline swatch/color-picker row near the input at this moment.
const swatchNearby = await card.locator('.theme-picker, [class*="swatch-row"], [class*="picker-row"]').count()
results.inlineSwatchRowCount = swatchNearby

const title = 'QT-fullwidth compose ' + Date.now()
await input.type(title, { delay: 20 })
await page.waitForTimeout(200)
const draftBoxWithText = await input.boundingBox()
results.draftBoxWithText = draftBoxWithText

await page.screenshot({ path: `${SCR}/qa2-t2-debug-predraft.png` })
await input.press('Enter')
await page.waitForTimeout(700)
await page.screenshot({ path: `${SCR}/qa2-t2-debug-postenter.png` })

const savedChip = card.getByText(title, { exact: false }).first()
await savedChip.waitFor({ state: 'visible', timeout: 5000 })
const savedBox = await savedChip.boundingBox()
results.savedBox = savedBox

results.leftEdgeJumpPx = draftBoxWithText && savedBox ? Math.abs(draftBoxWithText.x - savedBox.x) : null

await page.screenshot({ path: `${SCR}/qa2-t2-compose-saved.png` })

// Verify default theme via API — fetch the new task and check themeId.
const token = await rig.freshToken('mark@flyh2.com', PW)
const api = rig.apiClient(token)
const range = await api('/api/tasks?from=2026-09-13&to=2026-09-13')
const created = range.find(t => t.title === title)
results.createdTask = created ? { id: created.id, themeId: created.themeId, expectedThemeId: QT_THEME, verdict: created.themeId === QT_THEME ? 'PASS' : 'FAIL' } : { verdict: 'FAIL', note: 'task not found via API' }

console.log(JSON.stringify(results, null, 2))
writeFileSync('./qa2-t2-cleanup.json', JSON.stringify({ taskId: created?.id }, null, 2))
await browser.close()
