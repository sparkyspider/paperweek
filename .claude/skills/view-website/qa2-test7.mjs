#!/usr/bin/env node
// QA II Retest 7: ghost-dot residue on muted theme's scheduled task.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'
const QT_THEME = '5fd7f647-6ea0-42f2-99e9-cc4d6c5a4865'

const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, 'mark@flyh2.com', PW)

// Ensure clean starting state — theme unmuted.
await page.evaluate(() => localStorage.removeItem('paperweek.hidden-themes'))
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(800)

const results = {}
const dayCard = page.locator('[data-date="2026-09-10"]')
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)

results.textVisibleBeforeMute = await dayCard.locator('text=QT-ghostdot probe').count() > 0
await page.screenshot({ path: `${SCR}/qa2-t7-before-mute.png` })

// Mute QT-SenseTest via its swatch button in the sidebar (aria-label="Hide QT-SenseTest tasks").
const swatchBtn = page.locator('button[aria-label="Hide QT-SenseTest tasks"]').first()
await swatchBtn.click({ timeout: 3000 })
results.swatchClicked = true
await page.waitForTimeout(500)

const hiddenThemes = await page.evaluate(() => localStorage.getItem('paperweek.hidden-themes'))
results.hiddenThemesAfterMute = hiddenThemes

await page.screenshot({ path: `${SCR}/qa2-t7-after-mute-sidebar.png` })

await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(300)
await page.screenshot({ path: `${SCR}/qa2-t7-after-mute-daycard.png` })

const ghostDot = dayCard.locator('.row-margin-dot--ghost').first()
results.ghostDotCount = await dayCard.locator('.row-margin-dot--ghost').count()
if (results.ghostDotCount > 0) {
  results.ghostDotTitle = await ghostDot.getAttribute('title')
  results.textStillVisibleWhileMuted = await dayCard.locator('text=QT-ghostdot probe').count() > 0
  const ghostBox = await ghostDot.boundingBox()
  results.ghostDotBox = ghostBox
  // check the line is not writable: click where the text used to be, see if an input appears
  if (ghostBox) {
    await page.mouse.click(ghostBox.x + 40, ghostBox.y)
    await page.waitForTimeout(300)
    const inputAppeared = await dayCard.locator('input:visible').count()
    results.lineWritableAfterClick = inputAppeared > 0
  }
}

// Click the ghost dot to unmute + restore.
if (results.ghostDotCount > 0) {
  await ghostDot.click()
  await page.waitForTimeout(500)
  results.hiddenThemesAfterUnmuteClick = await page.evaluate(() => localStorage.getItem('paperweek.hidden-themes'))
  results.textVisibleAfterUnmuteClick = await dayCard.locator('text=QT-ghostdot probe').count() > 0
  await page.screenshot({ path: `${SCR}/qa2-t7-after-unmute-click.png` })
}

// Re-mute and reload-verify persistence.
if (results.swatchClicked) {
  const swatchBtn2 = page.locator('button[aria-label="Hide QT-SenseTest tasks"]').first()
  await swatchBtn2.click({ timeout: 3000 })
  await page.waitForTimeout(500)
  results.hiddenThemesAfterReMute = await page.evaluate(() => localStorage.getItem('paperweek.hidden-themes'))

  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  results.hiddenThemesAfterReload = await page.evaluate(() => localStorage.getItem('paperweek.hidden-themes'))
  const dayCard2 = page.locator('[data-date="2026-09-10"]')
  await dayCard2.scrollIntoViewIfNeeded()
  await page.waitForTimeout(300)
  results.ghostDotCountAfterReload = await dayCard2.locator('.row-margin-dot--ghost').count()
  await page.screenshot({ path: `${SCR}/qa2-t7-after-reload-still-muted.png` })
}

console.log(JSON.stringify(results, null, 2))
await browser.close()
