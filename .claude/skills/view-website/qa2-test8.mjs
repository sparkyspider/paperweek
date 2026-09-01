#!/usr/bin/env node
// QA II Retest 8: Enter-chain — type-Enter-type-Enter-type on both surfaces.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const results = {}
const stamp = Date.now()

async function focusInfo() {
  return page.evaluate(() => {
    const el = document.activeElement
    return { tag: el?.tagName, type: el?.type, isInput: el?.tagName === 'INPUT', value: el?.value }
  })
}

async function chainTest(labelPrefix) {
  const out = {}
  const t1 = `${labelPrefix}-1-${stamp}`
  await page.keyboard.type(t1, { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  out.focusAfterEnter1 = await focusInfo()

  const t2 = `${labelPrefix}-2-${stamp}`
  await page.keyboard.type(t2, { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  out.focusAfterEnter2 = await focusInfo()

  const t3 = `${labelPrefix}-3-${stamp}`
  await page.keyboard.type(t3, { delay: 20 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(600)
  out.focusAfterEnter3 = await focusInfo()

  out.titles = [t1, t2, t3]
  return out
}

// ---- Sidebar surface: QT-SenseTest theme card's trailing blank backlog line ----
const qtCardHandle = await page.evaluateHandle(() => {
  const cards = Array.from(document.querySelectorAll('.paper-card'))
  return cards.find(c => c.textContent.includes('QT-SenseTest')) || null
})
const blankLineHandle = await page.evaluateHandle((card) => {
  if (!card) return null
  const blanks = card.querySelectorAll('.backlog-lines .ruled-line.cursor-text')
  return blanks[blanks.length - 1] || null
}, qtCardHandle)
const blankEl = blankLineHandle.asElement()
let sidePoint = null
if (blankEl) {
  await blankEl.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const box = await blankEl.boundingBox()
  if (box) sidePoint = { x: box.x + 20, y: box.y + box.height / 2 }
}

let sideResult = null
if (sidePoint) {
  await page.mouse.click(sidePoint.x, sidePoint.y)
  await page.waitForTimeout(250)
  const focus0 = await focusInfo()
  if (focus0.isInput) {
    sideResult = await chainTest('QT-sidechain')
  } else {
    sideResult = { error: 'click did not focus an input', focus0 }
  }
} else {
  results.sidePointError = 'sidebar blank line not found'
}
results.sidebar = sideResult

await page.screenshot({ path: `${SCR}/qa2-t8-sidebar-chain.png` })

// ---- Day-card surface: unused day (2026-09-20), Notes section first line ----
const dayCard = page.locator('[data-date="2026-09-20"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

const notesPoint = await page.evaluate((dateAttr) => {
  const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
  const bands = Array.from(cardEl.querySelectorAll('.section-band'))
  for (const band of bands) {
    const wm = band.querySelector('.section-watermark')
    if (wm && wm.textContent.trim() === 'Notes') {
      let linesEl = band.nextElementSibling
      while (linesEl && !linesEl.classList.contains('section-lines')) linesEl = linesEl.nextElementSibling
      const line = linesEl?.querySelector('.ruled-line')
      if (line) {
        const r = line.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }
    }
  }
  return null
}, '2026-09-20')

let dayResult = null
if (notesPoint) {
  await page.mouse.click(notesPoint.x, notesPoint.y)
  await page.waitForTimeout(250)
  const focus0 = await focusInfo()
  if (focus0.isInput) {
    dayResult = await chainTest('QT-daychain')
  } else {
    dayResult = { error: 'click did not focus an input', focus0 }
  }
} else {
  results.dayPointError = 'day-card Notes line not found'
}
results.dayCard = dayResult

await page.screenshot({ path: `${SCR}/qa2-t8-daycard-chain.png` })

// reload-verify persistence
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const token = await rig.freshToken('mark@flyh2.com', PW)
const api = rig.apiClient(token)
const backlog = await api('/api/tasks?themeId=5fd7f647-6ea0-42f2-99e9-cc4d6c5a4865&backlog=true')
const range = await api('/api/tasks?from=2026-09-20&to=2026-09-20')

results.sidebarPersisted = results.sidebar?.titles?.map(t => ({ t, found: backlog.some(b => b.title === t) }))
results.dayCardPersisted = results.dayCard?.titles?.map(t => ({ t, found: range.some(b => b.title === t) }))

console.log(JSON.stringify(results, null, 2))
await browser.close()
