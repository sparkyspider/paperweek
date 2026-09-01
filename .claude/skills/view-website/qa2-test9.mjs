#!/usr/bin/env node
// QA II Retest 9: strike calm — click-to-strike has NO lingering accent rule / focus;
// strike stroke capped to words; dblclick-edit DOES show the accent rule.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const results = {}
const dayCard = page.locator('[data-date="2026-09-11"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

// ---- Click-to-strike ----
const strikeRow = dayCard.locator('.ruled-line', { hasText: 'QT-strike calm words here' }).first()
await page.screenshot({ path: `${SCR}/qa2-t9-before-strike.png` })
await strikeRow.click()
await page.waitForTimeout(500)
await page.screenshot({ path: `${SCR}/qa2-t9-after-strike.png` })

const strikeInfo = await page.evaluate((dateAttr) => {
  const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
  const rows = Array.from(cardEl.querySelectorAll('.ruled-line'))
  const row = rows.find(r => r.textContent.includes('QT-strike calm words here'))
  if (!row) return { error: 'row not found' }
  const strikeSpan = row.querySelector('.ink-strike')
  const active = document.activeElement
  const rowHasFocusedInput = row.matches(':has(input:focus)')
  const rowLineRect = row.getBoundingClientRect()
  const spanRect = strikeSpan ? strikeSpan.getBoundingClientRect() : null
  return {
    hasInkStrikeClass: !!strikeSpan,
    activeElementTag: active?.tagName,
    activeElementIsThisRowOrChild: row.contains(active) && active !== document.body,
    rowMatchesHasInputFocus: rowHasFocusedInput,
    rowWidth: rowLineRect.width,
    strikeSpanWidth: spanRect ? spanRect.width : null,
    strikeCappedToWords: spanRect ? spanRect.width < rowLineRect.width * 0.5 : null,
  }
}, '2026-09-11')
results.strike = strikeInfo
results.strikeVerdict = {
  noLingeringFocus: (!strikeInfo.activeElementIsThisRowOrChild) ? 'PASS' : 'FAIL',
  noAccentRule: (!strikeInfo.rowMatchesHasInputFocus) ? 'PASS' : 'FAIL',
  strokeCapped: strikeInfo.strikeCappedToWords ? 'PASS' : 'FAIL',
}

// un-strike it (click again) to leave things tidy, per residue/cleanup discipline
await strikeRow.click()
await page.waitForTimeout(400)

// ---- Dblclick-to-edit shows accent rule ----
const editRow = dayCard.locator('.ruled-line', { hasText: 'QT-edit accent probe' }).first()
await editRow.dblclick()
await page.waitForTimeout(400)
await page.screenshot({ path: `${SCR}/qa2-t9-after-dblclick-edit.png` })

const editInfo = await page.evaluate((dateAttr) => {
  const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
  const rows = Array.from(cardEl.querySelectorAll('.ruled-line'))
  const row = rows.find(r => r.querySelector('input'))
  if (!row) return { error: 'no row with input found' }
  const active = document.activeElement
  return {
    activeElementTag: active?.tagName,
    activeIsInputInRow: row.contains(active) && active.tagName === 'INPUT',
    rowMatchesHasInputFocus: row.matches(':has(input:focus)'),
  }
}, '2026-09-11')
results.edit = editInfo
results.editVerdict = {
  inputFocused: editInfo.activeIsInputInRow ? 'PASS' : 'FAIL',
  accentRulePresent: editInfo.rowMatchesHasInputFocus ? 'PASS' : 'FAIL',
}

// blur/escape to leave clean
await page.keyboard.press('Escape').catch(() => {})
await page.waitForTimeout(300)

console.log(JSON.stringify(results, null, 2))
await browser.close()
