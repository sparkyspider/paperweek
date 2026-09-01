#!/usr/bin/env node
// QA III — final-gate retest of the margin-dot theme-picker real-mouse-click bug.
// Fix under test: DaySection.vue's pickerTriggerEl ref (togglePicker/closePicker/onDocClick).
import * as rig from './dnd-rig.mjs'
import { writeFileSync } from 'node:fs'

const PW = process.env.PW
if (!PW) throw new Error('set PW env var')
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/6e062959-30ab-4c2e-87cf-e19f0564cec9/scratchpad'
const EMAIL = 'mark@flyh2.com'

const results = {}

// ---------- Setup: QT- prefixed theme + tasks (own themes, no real user data touched) ----------
const token = await rig.freshToken(EMAIL, PW)
const api = rig.apiClient(token)

const themeA = await api('/api/themes', { method: 'POST', body: { name: 'QT-QAIII' } })
const themeB = await api('/api/themes', { method: 'POST', body: { name: 'QT-QAIII-Alt' } })
console.log('themes', themeA.id, themeB.id)

async function mk(title, extra = {}) {
  return api('/api/tasks', { method: 'POST', body: { themeId: themeA.id, title, ...extra } })
}
async function schedule(id, scheduledOn, daypart, position = 0) {
  return api(`/api/tasks/${id}`, { method: 'PATCH', body: { scheduledOn, daypart, position } })
}

const t1 = await mk('QT-margindot verify')
await schedule(t1.id, '2026-09-22', 'morning', 0)
const t3 = await mk('QT-strike verify words here')
await schedule(t3.id, '2026-09-23', 'morning', 0)
const t4 = await mk('QT-drag verify')
// t4 stays unscheduled (backlog) — drag source for check 4.

const createdTaskIds = [t1.id, t3.id, t4.id]

// Also clean up the two stray QT- fixer tasks found pre-existing (debris from an earlier phase,
// one of them attached to the REAL "Personal" theme — deleting the stray TASK only, not the
// theme, so nothing about the real theme itself is touched).
const strayIds = ['e92198c4-1c55-4c80-8354-723884b83f1f', 'd8888e6e-ee60-4880-bc12-244c0d7feb4a']

console.log('fixtures created', JSON.stringify({ themeA: themeA.id, themeB: themeB.id, t1: t1.id, t3: t3.id, t4: t4.id }))

// ---------- Browser session ----------
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
await rig.login(page, EMAIL, PW)

// Helper: locate the margin dot for a task row by its title text, within a given day-card date.
async function findDot(dateAttr, titleText) {
  const dayCard = page.locator(`[data-date="${dateAttr}"]`)
  await dayCard.scrollIntoViewIfNeeded()
  await page.waitForTimeout(200)
  const handle = await page.evaluateHandle(({ dateAttr, titleText }) => {
    const cardEl = document.querySelector(`[data-date="${dateAttr}"]`)
    if (!cardEl) return null
    const rows = Array.from(cardEl.querySelectorAll('.ruled-line'))
    const row = rows.find(r => r.textContent.includes(titleText))
    if (!row) return null
    const idx = rows.indexOf(row)
    const dotsContainer = cardEl.querySelector('.row-margin-dots')
    const dots = Array.from(dotsContainer.querySelectorAll('.row-margin-dot'))
    return dots[idx] || null
  }, { dateAttr, titleText })
  return handle.asElement()
}

// ================= CHECK 1: real-mouse click on day-card margin dot, 4 runs =================
const check1 = { runs: [] }
for (let run = 1; run <= 4; run++) {
  const dotEl = await findDot('2026-09-22', 'QT-margindot verify')
  if (!dotEl) { check1.runs.push({ run, error: 'dot not found' }); continue }
  const box = await dotEl.boundingBox()
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.screenshot({ path: `${SCR}/qa3-c1-run${run}-before.png` })

  // Real coordinate mouse click: move -> down -> up (not el.click()).
  await page.mouse.move(cx - 25, cy - 8)
  await page.waitForTimeout(50)
  await page.mouse.move(cx, cy, { steps: 8 })
  await page.waitForTimeout(70)
  await page.mouse.down()
  await page.waitForTimeout(50)
  await page.mouse.up()
  await page.waitForTimeout(250)

  const ariaExpanded = await dotEl.getAttribute('aria-expanded')
  const listboxCount = await page.locator('[role="listbox"][aria-label="Choose theme"]').count()
  const opened = ariaExpanded === 'true' && listboxCount > 0
  await page.screenshot({ path: `${SCR}/qa3-c1-run${run}-after.png` })

  const runResult = { run, ariaExpanded, listboxCount, opened }

  if (opened && run === 4) {
    // Bonus/check-5 tie-in: pick the ALT theme via a real click on the option, to drive
    // last-used-theme, then verify the popover closed itself as a result.
    const altOption = page.locator('[role="option"]', { hasText: 'QT-QAIII-Alt' }).first()
    await altOption.click()
    await page.waitForTimeout(200)
    runResult.selectedAltTheme = true
    runResult.listboxCountAfterSelect = await page.locator('[role="listbox"]').count()
  } else if (opened) {
    // Close via a second real-mouse click on the SAME dot (toggle-close path), so the next run
    // starts clean.
    await page.mouse.move(cx, cy);
    await page.waitForTimeout(40)
    await page.mouse.down(); await page.waitForTimeout(40); await page.mouse.up()
    await page.waitForTimeout(200)
    runResult.closedViaSecondClick = (await page.locator('[role="listbox"]').count()) === 0
  }

  if (!opened) {
    // Failure forensics, as instructed.
    const forensics = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      function describe(e) {
        if (!e) return null
        const cs = getComputedStyle(e)
        const r = e.getBoundingClientRect()
        return { tag: e.tagName, cls: (e.className || '').toString().slice(0, 120), pointerEvents: cs.pointerEvents, zIndex: cs.zIndex, position: cs.position, rect: { x: r.x, y: r.y, w: r.width, h: r.height } }
      }
      const chain = []
      let cur = el
      for (let i = 0; i < 6 && cur; i++) { chain.push(describe(cur)); cur = cur.parentElement }
      return { elementFromPointAtClick: describe(el), ancestorChain: chain }
    }, { x: cx, y: cy })
    runResult.forensics = forensics

    // Programmatic click control on the SAME element, to isolate real-mouse-path vs mechanism.
    const stillSameNode = await dotEl.evaluate(el => document.contains(el))
    runResult.dotStillInDomAfterFailedClick = stillSameNode
    await dotEl.evaluate(el => el.click())
    await page.waitForTimeout(250)
    runResult.programmaticClickOpens = (await page.locator('[role="listbox"]').count()) > 0
    // close it again if it opened, so subsequent runs start clean
    if (runResult.programmaticClickOpens) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.mouse.click(5, 5).catch(() => {})
      await page.waitForTimeout(150)
    }
  }

  check1.runs.push(runResult)
}
check1.passCount = check1.runs.filter(r => r.opened).length
check1.verdict = check1.passCount === 4 ? 'PASS (4/4)' : `FAIL (${check1.passCount}/4)`
results.check1_daycard_realclick = check1

// Capture last-used-theme localStorage right after run 4's selection (feeds bonus check 5).
const lastUsedRightAfter = await page.evaluate(() => localStorage.getItem('paperweek.last-used-theme'))
results.lastUsedThemeImmediatelyAfterSelect = lastUsedRightAfter

// ================= CHECK 2: sidebar task dot — does the affordance even exist? =================
// Code inspection (TaskChip.vue / AddTaskInline.vue / ThemeCard.vue) found no row-margin-dot /
// theme-picker trigger implemented for sidebar backlog rows — only DaySection.vue (day-card)
// implements it. Verify that against the live DOM: a backlog row for a QT- task should render
// NO aria-haspopup="listbox" button anywhere near it.
const sidebarCheck = await page.evaluate((themeName) => {
  const cards = Array.from(document.querySelectorAll('.paper-card'))
  const card = cards.find(c => c.querySelector('h3')?.textContent?.trim() === themeName)
  if (!card) return { error: 'theme card not found' }
  const rows = Array.from(card.querySelectorAll('.task-row-lift'))
  const dotButtons = card.querySelectorAll('[aria-haspopup="listbox"], .row-margin-dot')
  return {
    themeCardFound: true,
    backlogRowCount: rows.length,
    marginDotOrPickerTriggerCount: dotButtons.length,
  }
}, 'QT-QAIII')
await page.screenshot({ path: `${SCR}/qa3-c2-sidebar.png` })
results.check2_sidebar_dot = {
  ...sidebarCheck,
  verdict: sidebarCheck.marginDotOrPickerTriggerCount === 0
    ? 'N/A — no margin-dot/theme-picker affordance exists on sidebar task rows (confirmed both by source (TaskChip.vue/ThemeCard.vue/AddTaskInline.vue have no picker) and live DOM query); nothing to click-test here.'
    : 'UNEXPECTED — a picker trigger was found on a sidebar row; needs re-investigation',
}

// ================= CHECK 3: regression — click task TEXT (strike), no lingering accent =================
const strikeDayCard = page.locator('[data-date="2026-09-23"]')
await strikeDayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(200)
const strikeRow = strikeDayCard.locator('.task-row-lift', { hasText: 'QT-strike verify words here' }).first()
const strikeRowBox = await strikeRow.boundingBox()
await page.screenshot({ path: `${SCR}/qa3-c3-before.png` })

const sx = strikeRowBox.x + strikeRowBox.width / 2
const sy = strikeRowBox.y + strikeRowBox.height / 2
await page.mouse.move(sx - 20, sy - 5)
await page.waitForTimeout(50)
await page.mouse.move(sx, sy, { steps: 6 })
await page.waitForTimeout(60)
await page.mouse.down()
await page.waitForTimeout(50)
await page.mouse.up()
await page.waitForTimeout(300)

const strikeState = await page.evaluate((titleText) => {
  const rows = Array.from(document.querySelectorAll('.task-row-lift'))
  const row = rows.find(r => r.textContent.includes(titleText))
  if (!row) return { error: 'row not found' }
  const span = row.querySelector('span')
  return {
    hasInkStrike: !!row.querySelector('.ink-strike'),
    activeElementTag: document.activeElement?.tagName,
    activeElementIsRow: document.activeElement === row,
    rowMatchesHasInputFocus: row.closest('.ruled-line')?.matches(':has(input:focus)') ?? false,
  }
}, 'QT-strike verify words here')
await page.screenshot({ path: `${SCR}/qa3-c3-after.png` })
results.check3_strike_regression = {
  ...strikeState,
  verdict: (strikeState.hasInkStrike && !strikeState.activeElementIsRow && !strikeState.rowMatchesHasInputFocus)
    ? 'PASS' : 'FAIL',
}

// ================= CHECK 4: regression — one quick drag, backlog -> day line =================
const dragSource = page.locator('.task-row-lift', { hasText: 'QT-drag verify' }).first()
const dragTargetCard = page.locator('[data-date="2026-09-25"]')
await dragTargetCard.scrollIntoViewIfNeeded()
const dragTarget = dragTargetCard.locator('.section-lines .ruled-line').first()
await page.screenshot({ path: `${SCR}/qa3-c4-before.png` })
await rig.humanDrag(page, dragSource, dragTarget, {
  onMid: async () => { await page.screenshot({ path: `${SCR}/qa3-c4-mid.png` }) },
})
await page.waitForTimeout(400)
await page.screenshot({ path: `${SCR}/qa3-c4-after.png` })
const t4After = await rig.verifyTask(api, t4.id, themeA.id)
results.check4_drag_regression = {
  scheduledOn: t4After?.scheduledOn,
  daypart: t4After?.daypart,
  verdict: t4After?.scheduledOn === '2026-09-25' ? 'PASS' : 'FAIL',
}

// ================= CHECK 5 (bonus): last-used-theme default survives reload =================
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
const lastUsedAfterReload = await page.evaluate(() => localStorage.getItem('paperweek.last-used-theme'))

// Create a NEW day-card draft (empty line on a fresh date) and confirm it defaults to the
// last-used theme (ALT), captured via the POST /api/tasks network body when it autosaves.
const netReqs = []
page.on('request', (req) => {
  if (req.method() === 'POST' && req.url().includes('/api/tasks')) {
    try { netReqs.push(JSON.parse(req.postData() || '{}')) } catch { /* ignore */ }
  }
})
const freshDayCard = page.locator('[data-date="2026-09-24"]')
await freshDayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(200)
const emptyLine = freshDayCard.locator('.section-lines .ruled-line.cursor-text').first()
await emptyLine.click()
await page.waitForTimeout(150)
await page.keyboard.type('QT-lastused check', { delay: 20 })
await page.keyboard.press('Enter')
await page.waitForTimeout(600)
await page.screenshot({ path: `${SCR}/qa3-c5-newdraft.png` })

const postBody = netReqs.find(b => b.title === 'QT-lastused check')
results.check5_bonus_lastused = {
  lastUsedRightAfterSelect: lastUsedRightAfter,
  lastUsedAfterReload,
  matchesAltThemeId: lastUsedAfterReload === themeB.id,
  newDraftPostedThemeId: postBody?.themeId,
  newDraftDefaultedToAlt: postBody?.themeId === themeB.id,
  verdict: (lastUsedAfterReload === themeB.id && postBody?.themeId === themeB.id) ? 'PASS' : 'FAIL/INCONCLUSIVE',
}

await browser.close()

// ---------- Cleanup ----------
// Find and delete every QT- task (created by this run, the "lastused check" one, plus the two
// pre-existing stray fixer tasks), then archive both QT- test themes.
const range = await api('/api/tasks?from=2026-08-01&to=2026-10-31')
const backlogA = await api(`/api/tasks?themeId=${themeA.id}&backlog=true`).catch(() => [])
const backlogB = await api(`/api/tasks?themeId=${themeB.id}&backlog=true`).catch(() => [])
const allQt = [...range, ...backlogA, ...backlogB].filter(t => t.title && t.title.startsWith('QT-'))
const seen = new Set()
const toDelete = []
for (const t of allQt) { if (!seen.has(t.id)) { seen.add(t.id); toDelete.push(t) } }
for (const id of strayIds) { if (!seen.has(id)) { seen.add(id); toDelete.push({ id, title: '(stray fixer debris)' }) } }

const deleted = []
const failed = []
for (const t of toDelete) {
  try { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); deleted.push({ id: t.id, title: t.title }) }
  catch (e) { failed.push({ id: t.id, title: t.title, error: e.message }) }
}
await api(`/api/themes/${themeA.id}`, { method: 'DELETE' }).catch((e) => failed.push({ theme: themeA.id, error: e.message }))
await api(`/api/themes/${themeB.id}`, { method: 'DELETE' }).catch((e) => failed.push({ theme: themeB.id, error: e.message }))

results.cleanup = { deletedCount: deleted.length, deleted, failed }

writeFileSync(`${SCR}/qa3-results.json`, JSON.stringify(results, null, 2))
console.log(JSON.stringify(results, null, 2))
