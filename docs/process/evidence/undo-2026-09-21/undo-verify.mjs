// One-off verification script for the Cmd+Z undo feature (task 2026-09-21).
// Logs in and drives the real UI (no store stubbing), and proves checks a-f from the task
// brief. Screenshots + a JSON result log go to docs/process/evidence/undo-2026-09-21/.
//
// Usage: node undo-verify.mjs <email> <password>
// (credentials are never hardcoded here — see auth/.machinekey/mark-initial-password.txt)
import { chromium } from 'playwright'
import fs from 'node:fs'

const EMAIL = process.argv[2]
const PASSWORD = process.argv[3]
if (!EMAIL || !PASSWORD) {
  console.error('Usage: node undo-verify.mjs <email> <password>')
  process.exit(2)
}
const EVIDENCE_DIR = '/Users/sparkyspider/IdeaProjects/paperweek/docs/process/evidence/undo-2026-09-21'
const BASE = 'http://localhost:3200'

const results = []
function record(id, pass, note, shot) {
  results.push({ id, pass, note, shot })
  console.log(`[${pass ? 'PASS' : 'FAIL'}] ${id}: ${note}${shot ? ' (' + shot + ')' : ''}`)
}

function shotPath(name) {
  return `${EVIDENCE_DIR}/${name}`
}

/** The write-anywhere "Enter chains to the next line" feature (pre-existing, unrelated to
 *  Cmd+Z) leaves a fresh empty draft `<input>` focused after every task creation. This
 *  Chromium build (macOS defaults) does not shift focus to a plain `<button>` on click, so
 *  that leftover focus can persist right through a later hover+click on an unrelated task's
 *  delete button. Blur it explicitly before each Cmd+Z check so the test exercises "nothing
 *  editable is focused" — the realistic case Mark is in once he's clicked/toggled anything
 *  else on the page — rather than an artifact of the test's own task-creation step. */
async function blurActive(page) {
  await page.evaluate(() => {
    const el = document.activeElement
    if (el && typeof el.blur === 'function') el.blur()
  })
}

/** Toasts self-dismiss after 5s; wait for a specific one to clear so an EARLIER check's toast
 *  can't be mistaken for a NEW one a later check triggers. */
async function waitForNoToast(page, text, timeoutMs = 6000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const count = await page.getByText(text, { exact: true }).count()
    if (count === 0) return true
    await page.waitForTimeout(200)
  }
  return false
}

const apiLog = []

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
  ])
  await page.waitForTimeout(1200)
}

/** Synthetic HTML5 drag: dispatches the exact DragEvents the components listen to
 *  (dragstart/dragenter/dragover/drop/dragend) with a real DataTransfer — exercises the app's
 *  own handlers rather than calling any store method directly. */
async function dragTask(page, sourceLocator, targetLocator) {
  const source = await sourceLocator.elementHandle()
  const target = await targetLocator.elementHandle()
  if (!source || !target) throw new Error('dragTask: source or target not found')
  await page.evaluate(([src, tgt]) => {
    const dt = new DataTransfer()
    const fire = (el, type) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })
      el.dispatchEvent(ev)
    }
    fire(src, 'dragstart')
    fire(tgt, 'dragenter')
    fire(tgt, 'dragover')
    fire(tgt, 'drop')
    fire(src, 'dragend')
  }, [source, target])
  await source.dispose()
  await target.dispose()
}

function themeCard(page, themeName) {
  return page.locator('.paper-card', { has: page.locator('h3', { hasText: themeName }) })
}

function taskRow(page, title) {
  // Climb from the exact-text node to its nearest draggable ancestor (TaskChip's root div —
  // the drag SOURCE, and where the hover-revealed edit/delete buttons live).
  return page.getByText(title, { exact: true }).locator('xpath=ancestor::div[@draggable][1]')
}

function daySectionByLabel(page, dateISO, label) {
  const card = page.locator(`.day-card[data-date="${dateISO}"]`)
  return card.locator('.day-section', { has: page.locator('.section-watermark', { hasText: label }) })
}

/** Creates a new backlog task under a theme by clicking its trailing empty line, typing the
 *  title, and pressing Enter (the app's own write-anywhere autosave path). */
async function createBacklogTask(page, themeName, title) {
  const card = themeCard(page, themeName)
  const emptyLine = card.locator('.ruled-line').last()
  await emptyLine.click()
  await page.waitForTimeout(150)
  const input = card.locator('input.diary-input').last()
  await input.fill(title)
  await input.press('Enter')
  await page.waitForTimeout(700)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1600, height: 2200 } })
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))
  page.on('requestfinished', async (req) => {
    if (req.url().includes('/api/tasks')) {
      try {
        const res = await req.response()
        apiLog.push({ method: req.method(), url: req.url(), status: res ? res.status() : null })
      } catch { /* ignore */ }
    }
  })

  await login(page)
  await page.screenshot({ path: shotPath('0-planner-loaded.png'), fullPage: false })

  // ---------- Setup: T1 for check (a) ----------
  const T1 = 'undo-test-delete'
  await createBacklogTask(page, 'Personal', T1)
  await page.screenshot({ path: shotPath('1-t1-created.png'), fullPage: false })

  // ---------- (a) delete + Cmd+Z within 5s ----------
  {
    const row = taskRow(page, T1)
    await row.hover()
    await page.waitForTimeout(150)
    await row.locator('button[aria-label="Delete task"]').click()
    await page.waitForTimeout(200)
    const deletedGone = (await page.getByText(T1, { exact: true }).count()) === 0
    await page.screenshot({ path: shotPath('2a-after-delete-toast.png'), fullPage: false })
    await blurActive(page)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(400)
    const backAfterUndo = (await page.getByText(T1, { exact: true }).count()) > 0
    const restoredToastVisible = (await page.getByText('Task restored', { exact: true }).count()) > 0
    await page.screenshot({ path: shotPath('2b-after-cmdz-restored.png'), fullPage: false })
    record('a', deletedGone && backAfterUndo && restoredToastVisible,
      `deletedGone=${deletedGone} backAfterUndo=${backAfterUndo} restoredToast=${restoredToastVisible}`,
      '2a-after-delete-toast.png / 2b-after-cmdz-restored.png')
  }

  // ---------- (f, part 1) reload after (a): persisted ----------
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  {
    const present = (await page.getByText(T1, { exact: true }).count()) > 0
    await page.screenshot({ path: shotPath('3-reload-after-a.png'), fullPage: false })
    record('f1', present, `T1 "${T1}" present after reload=${present}`, '3-reload-after-a.png')
  }

  // ---------- Setup: T2 for check (b) ----------
  const T2 = 'undo-test-delete-late'
  await createBacklogTask(page, 'Personal', T2)
  await page.screenshot({ path: shotPath('4-t2-created.png'), fullPage: false })

  // ---------- (b) delete, wait 7s (past the 5s deferred commit), then Cmd+Z ----------
  {
    apiLog.length = 0
    const row = taskRow(page, T2)
    await row.hover()
    await page.waitForTimeout(150)
    await row.locator('button[aria-label="Delete task"]').click()
    await page.waitForTimeout(200)
    await page.screenshot({ path: shotPath('5a-t2-after-delete.png'), fullPage: false })
    await page.waitForTimeout(7000)
    const deleteHitServer = apiLog.some((r) => r.method === 'DELETE' && r.url.includes('/api/tasks/'))
    await blurActive(page)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(600)
    const backAfterUndo = (await page.getByText(T2, { exact: true }).count()) > 0
    const restoredToastVisible = (await page.getByText('Task restored', { exact: true }).count()) > 0
    // POST defaults to 201 Created in this codebase (no route anywhere overrides Nest's default
    // status codes) — 201 is the correct/expected status here, not a bug.
    const restoreHitApi = apiLog.some((r) => r.method === 'POST' && r.url.includes('/restore') && r.status === 201)
    await page.screenshot({ path: shotPath('5b-t2-after-cmdz-late.png'), fullPage: false })
    // GET /api/tasks includes it again — reload and re-check via a fresh backlog fetch.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const getIncludesAfterReload = (await page.getByText(T2, { exact: true }).count()) > 0
    const getTasksHit = apiLog.some((r) => r.method === 'GET' && r.url.includes('/api/tasks') && r.status === 200)
    await page.screenshot({ path: shotPath('5c-t2-reload.png'), fullPage: false })
    record('b', deleteHitServer && backAfterUndo && restoredToastVisible && restoreHitApi && getIncludesAfterReload && getTasksHit,
      `deleteHitServer=${deleteHitServer} backAfterUndo=${backAfterUndo} restoredToast=${restoredToastVisible} restoreHitApi(200)=${restoreHitApi} getIncludesAfterReload=${getIncludesAfterReload} getTasksHit=${getTasksHit} apiLog=${JSON.stringify(apiLog)}`,
      '5a-t2-after-delete.png / 5b-t2-after-cmdz-late.png / 5c-t2-reload.png')
  }

  // ---------- Setup: T3 for checks (c)/(d)/(e) ----------
  const T3 = 'undo-test-move'
  await createBacklogTask(page, 'Personal', T3)
  await page.screenshot({ path: shotPath('6-t3-created.png'), fullPage: false })

  const MON = '2026-09-21' // Monday, per the loaded week
  const WED = '2026-09-23' // Wednesday — a different day, empty Morning section

  // ---------- (c) drag backlog -> Monday Morning, Cmd+Z -> back in backlog ----------
  {
    const source = taskRow(page, T3)
    const target = daySectionByLabel(page, MON, 'Morning').locator('.ruled-line').first()
    await dragTask(page, source, target)
    await page.waitForTimeout(700)
    const onGrid = (await daySectionByLabel(page, MON, 'Morning').getByText(T3, { exact: true }).count()) > 0
    await page.screenshot({ path: shotPath('7a-t3-dropped-monday-morning.png'), fullPage: false })
    await blurActive(page)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(500)
    const backInBacklog = (await themeCard(page, 'Personal').getByText(T3, { exact: true }).count()) > 0
    const offGridAfterUndo = (await daySectionByLabel(page, MON, 'Morning').getByText(T3, { exact: true }).count()) === 0
    const movedBackToast = (await page.getByText('Moved back', { exact: true }).count()) > 0
    await page.screenshot({ path: shotPath('7b-t3-cmdz-back-in-backlog.png'), fullPage: false })
    record('c', onGrid && backInBacklog && offGridAfterUndo && movedBackToast,
      `onGrid=${onGrid} backInBacklog=${backInBacklog} offGridAfterUndo=${offGridAfterUndo} movedBackToast=${movedBackToast}`,
      '7a-t3-dropped-monday-morning.png / 7b-t3-cmdz-back-in-backlog.png')
  }

  // ---------- (f, part 2) reload after (c): persisted back in backlog ----------
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  {
    const present = (await themeCard(page, 'Personal').getByText(T3, { exact: true }).count()) > 0
    await page.screenshot({ path: shotPath('8-reload-after-c.png'), fullPage: false })
    record('f2', present, `T3 "${T3}" present back in Personal backlog after reload=${present}`, '8-reload-after-c.png')
  }

  // ---------- Precondition for (d): re-drag T3 backlog -> Monday Morning ----------
  {
    const source = taskRow(page, T3)
    const target = daySectionByLabel(page, MON, 'Morning').locator('.ruled-line').first()
    await dragTask(page, source, target)
    await page.waitForTimeout(700)
  }

  // ---------- (d) drag Monday Morning -> Wednesday Morning (different day), Cmd+Z -> back on Monday ----------
  {
    const source = taskRow(page, T3)
    const target = daySectionByLabel(page, WED, 'Morning').locator('.ruled-line').first()
    await dragTask(page, source, target)
    await page.waitForTimeout(700)
    const onWednesday = (await daySectionByLabel(page, WED, 'Morning').getByText(T3, { exact: true }).count()) > 0
    await page.screenshot({ path: shotPath('9a-t3-dropped-wednesday.png'), fullPage: false })
    await blurActive(page)
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(500)
    const backOnMonday = (await daySectionByLabel(page, MON, 'Morning').getByText(T3, { exact: true }).count()) > 0
    const offWednesday = (await daySectionByLabel(page, WED, 'Morning').getByText(T3, { exact: true }).count()) === 0
    await page.screenshot({ path: shotPath('9b-t3-cmdz-back-monday.png'), fullPage: false })
    record('d', onWednesday && backOnMonday && offWednesday,
      `onWednesday=${onWednesday} backOnMonday=${backOnMonday} offWednesday=${offWednesday}`,
      '9a-t3-dropped-wednesday.png / 9b-t3-cmdz-back-monday.png')
  }

  // Let (d)'s own "Moved back" toast fully clear so it can't be mistaken for a toast (e)
  // triggers — (e) asserts NO such toast appears as a result of its own Cmd+Z.
  await waitForNoToast(page, 'Moved back')

  // ---------- (e) typing in a focused editor: native undo only, stack untouched ----------
  {
    apiLog.length = 0
    const row = daySectionByLabel(page, MON, 'Morning').getByText(T3, { exact: true })
    await row.dblclick()
    await page.waitForTimeout(200)
    const input = daySectionByLabel(page, MON, 'Morning').locator('input')
    // dblclick's startEdit() selects the whole title (TaskChip's normal rename affordance), so
    // typing one character REPLACES the selection — that's the browser's ordinary behaviour,
    // not this feature's concern. What matters for (e) is that native undo reverses exactly
    // that edit afterward.
    await input.press('X')
    const valueAfterType = await input.inputValue()
    await page.screenshot({ path: shotPath('10a-typing-char.png'), fullPage: false })
    // Deliberately NO blurActive() here — the whole point is focus stays IN this input, so the
    // app-level Cmd+Z listener must see an editable target and step aside for native undo.
    await page.keyboard.press('Meta+z')
    await page.waitForTimeout(300)
    const valueAfterUndo = await input.inputValue()
    const noMoveToast = (await page.getByText('Moved back', { exact: true }).count()) === 0
    const noRestoreToast = (await page.getByText('Task restored', { exact: true }).count()) === 0
    const noPatchFired = !apiLog.some((r) => r.method === 'PATCH')
    await page.screenshot({ path: shotPath('10b-after-native-undo.png'), fullPage: false })
    await input.press('Escape')
    const charWasTyped = valueAfterType === 'X'
    const charWasUndone = valueAfterUndo === T3
    const stillOnMonday = (await daySectionByLabel(page, MON, 'Morning').getByText(T3, { exact: true }).count()) > 0
    record('e', charWasTyped && charWasUndone && noMoveToast && noRestoreToast && noPatchFired && stillOnMonday,
      `valueAfterType="${valueAfterType}" valueAfterUndo="${valueAfterUndo}" noMoveToast=${noMoveToast} noRestoreToast=${noRestoreToast} noPatchFired=${noPatchFired} stillOnMonday=${stillOnMonday}`,
      '10a-typing-char.png / 10b-after-native-undo.png')
  }

  // ---------- Cleanup: delete T1, T2, T3 for real (no undo) ----------
  await page.waitForTimeout(300)
  for (const title of [T1, T2, T3]) {
    const matches = await page.getByText(title, { exact: true }).count()
    if (matches === 0) continue
    const row = page.getByText(title, { exact: true }).first().locator('xpath=ancestor::div[@draggable][1]')
    await row.hover().catch(() => {})
    await row.locator('button[aria-label="Delete task"]').click().catch(() => {})
    await page.waitForTimeout(200)
  }
  await page.waitForTimeout(6000) // let the deferred DELETEs actually commit server-side
  await page.screenshot({ path: shotPath('11-after-cleanup.png'), fullPage: false })

  const cleanupOk = (
    (await page.getByText(T1, { exact: true }).count()) === 0 &&
    (await page.getByText(T2, { exact: true }).count()) === 0 &&
    (await page.getByText(T3, { exact: true }).count()) === 0
  )
  record('cleanup', cleanupOk, `all three throwaway tasks gone from view=${cleanupOk}`, '11-after-cleanup.png')

  fs.writeFileSync(`${EVIDENCE_DIR}/results.json`, JSON.stringify({ results, consoleErrors, apiLogTail: apiLog.slice(-20) }, null, 2))
  console.log('\nConsole/page errors observed during run:', consoleErrors.length)
  if (consoleErrors.length) console.log(consoleErrors)

  await browser.close()
}

main().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})
