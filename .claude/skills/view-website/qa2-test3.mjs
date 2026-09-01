#!/usr/bin/env node
// QA II Retest 3: label bands — gap below ghost label <=3px AND clearly smaller than gap above.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

const card = page.locator('[data-date="2026-09-14"]') // an empty day, clean lines
await card.scrollIntoViewIfNeeded()
await page.waitForTimeout(400)

const measurements = await page.evaluate((dateAttr) => {
  const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
  const bands = Array.from(cardEl.querySelectorAll('.section-band'))
  const out = []
  let prevBottom = null
  // Use the card's own top (header) as the initial "above" reference for the first band.
  const headerEl = cardEl.querySelector('header, .day-header, h2, h3')
  prevBottom = headerEl ? headerEl.getBoundingClientRect().bottom : cardEl.getBoundingClientRect().top

  for (const band of bands) {
    const watermark = band.querySelector('.section-watermark')
    const wRect = watermark.getBoundingClientRect()
    const label = watermark.textContent.trim()
    // gap above = distance from previous content's bottom to this label's top
    const gapAbove = wRect.top - prevBottom
    // find the section-lines that follows this band (next sibling in the section wrapper)
    let linesEl = band.nextElementSibling
    while (linesEl && !linesEl.classList.contains('section-lines')) linesEl = linesEl.nextElementSibling
    let gapBelow = null
    let firstLineTop = null
    if (linesEl) {
      const firstLine = linesEl.querySelector('.ruled-line')
      if (firstLine) {
        firstLineTop = firstLine.getBoundingClientRect().top
        gapBelow = firstLineTop - wRect.bottom
      }
      // set prevBottom to the LAST ruled-line's bottom for next iteration's "gap above"
      const allLines = linesEl.querySelectorAll('.ruled-line')
      if (allLines.length) prevBottom = allLines[allLines.length - 1].getBoundingClientRect().bottom
      else prevBottom = linesEl.getBoundingClientRect().bottom
    }
    out.push({ label, watermarkRect: wRect, gapAbove, gapBelow })
  }
  return out
}, '2026-09-14')

const results = measurements.map(m => ({
  label: m.label,
  gapAbove: Math.round(m.gapAbove * 100) / 100,
  gapBelow: m.gapBelow === null ? null : Math.round(m.gapBelow * 100) / 100,
  belowLE3: m.gapBelow !== null && m.gapBelow <= 3,
  belowLessThanAbove: m.gapBelow !== null && m.gapBelow < m.gapAbove,
  verdict: (m.gapBelow !== null && m.gapBelow <= 3 && m.gapBelow < m.gapAbove) ? 'PASS' : 'FAIL',
}))

await page.screenshot({ path: `${SCR}/qa2-t3-label-bands.png` })
// zoomed crop of the Morning label area for visual evidence
const morningBand = card.locator('.section-band').first()
const bb = await morningBand.boundingBox()
if (bb) {
  await page.screenshot({
    path: `${SCR}/qa2-t3-morning-label-zoom.png`,
    clip: { x: Math.max(0, bb.x - 20), y: Math.max(0, bb.y - 30), width: bb.width + 40, height: bb.height + 80 },
  })
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
