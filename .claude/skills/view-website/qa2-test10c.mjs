import * as rig from './dnd-rig.mjs'
const PW = process.env.PW
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)
const dayCard = page.locator('[data-date="2026-09-12"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(1500) // long settle before even starting

const dotHandle = await page.evaluateHandle((dateAttr) => {
  const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
  const rows = Array.from(cardEl.querySelectorAll('.ruled-line'))
  const row = rows.find(r => r.textContent.includes('QT-margindot probe'))
  const idx = rows.indexOf(row)
  const dots = Array.from(cardEl.querySelector('.row-margin-dots').querySelectorAll('.row-margin-dot'))
  return dots[idx]
}, '2026-09-12')
const box = await dotHandle.asElement().boundingBox()
const cx = box.x + box.width/2, cy = box.y + box.height/2
await page.mouse.move(cx - 30, cy - 10)
await page.waitForTimeout(60)
await page.mouse.move(cx, cy, { steps: 8 })
await page.waitForTimeout(800) // LONG dwell before pressing down, unlike the 80ms before
await page.mouse.down()
await page.waitForTimeout(60)
await page.mouse.up()
await page.waitForTimeout(400)
const popoverOpen = (await page.locator('[role="listbox"][aria-label="Choose theme"]').count()) > 0
console.log(JSON.stringify({ popoverOpen, note: 'long dwell (800ms) before mousedown, 1500ms settle before starting' }))
await browser.close()
