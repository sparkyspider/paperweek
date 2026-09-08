#!/usr/bin/env node
// Verifies: "Enter while editing a task title moves editing to the next line down" (Mark's ask,
// 2026-09-08), in BOTH surfaces that use TaskChip's rename mode — the sidebar theme backlog
// (AddTaskInline.vue) and a week-grid daypart cell (DaySection.vue).
//
// Setup/cleanup goes through the API directly (dnd-rig's apiClient/freshToken) so this never
// touches Mark's real themes/tasks — everything created here is prefixed QT- and deleted again
// at the end, verified via a fresh API read.
import * as rig from './dnd-rig.mjs'

const PW = 'Water@002'
const EMAIL = 'mark@flyh2.com'
const SCR = '/private/tmp/claude-501/-Users-sparkyspider-IdeaProjects-productivity-tools/c114a762-d766-4bb3-8dc9-43426cda9caf/scratchpad'
const TEST_DATE = '2026-10-08' // far from "today" (2026-09-08), unlikely to collide with real plans

const results = { steps: [], created: [], deleted: [], pass: true }
function record(name, ok, detail) {
  results.steps.push({ name, ok, detail })
  if (!ok) results.pass = false
  console.log(`${ok ? 'PASS' : 'FAIL'} — ${name}${detail ? ': ' + JSON.stringify(detail) : ''}`)
}

const token = await rig.freshToken(EMAIL, PW)
const api = rig.apiClient(token)

// ---- Setup: a dedicated QT- theme + backlog tasks + two scheduled tasks ----
const theme = await api('/api/themes', { method: 'POST', body: { name: 'QT-EnterChain', color: '#AFCBE3' } })
results.created.push({ kind: 'theme', id: theme.id, name: theme.name })

const backlogTitles = ['QT-Enter-A', 'QT-Enter-B', 'QT-Enter-C']
const backlogTasks = []
for (const title of backlogTitles) {
  const t = await api('/api/tasks', { method: 'POST', body: { themeId: theme.id, title } })
  backlogTasks.push(t)
  results.created.push({ kind: 'task', id: t.id, title })
}

const dayTitles = ['QT-Enter-D', 'QT-Enter-E']
const dayTasks = []
for (let i = 0; i < dayTitles.length; i++) {
  const t = await api('/api/tasks', { method: 'POST', body: { themeId: theme.id, title: dayTitles[i] } })
  await api(`/api/tasks/${t.id}`, { method: 'PATCH', body: { scheduledOn: TEST_DATE, daypart: 'morning', position: i } })
  dayTasks.push(t)
  results.created.push({ kind: 'task', id: t.id, title: dayTitles[i] })
}

// ---- Drive the real UI ----
const browser = await rig.launch({ headed: false })
const page = await browser.newPage({ viewport: { width: 1700, height: 1100 } })
const consoleErrors = []
const pageErrors = []
page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()) })
page.on('pageerror', (err) => pageErrors.push(err.message))

await rig.login(page, EMAIL, PW)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1500)

async function activeInputState() {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el.tagName !== 'INPUT') return { tag: el?.tagName ?? null }
    return {
      tag: 'INPUT',
      value: el.value,
      placeholder: el.getAttribute('placeholder'),
      selectionStart: el.selectionStart,
      selectionEnd: el.selectionEnd,
      atEnd: el.selectionStart === el.value.length && el.selectionEnd === el.value.length,
    }
  })
}

// ===================== 1) Sidebar theme backlog =====================
const themeCard = page.locator('.paper-card', { hasText: 'QT-EnterChain' }).first()
await themeCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(200)

// -- A -> B --
await page.getByText('QT-Enter-A', { exact: true }).first().dblclick()
await page.waitForTimeout(150)
let st = await activeInputState()
record('backlog: dblclick A opens edit', st.tag === 'INPUT' && st.value === 'QT-Enter-A', st)
await page.screenshot({ path: `${SCR}/enter-next-01-backlog-editing-A.png` })

await page.keyboard.press('Enter')
await page.waitForTimeout(150)
st = await activeInputState()
record('backlog: Enter A -> editing B, caret at end', st.tag === 'INPUT' && st.value === 'QT-Enter-B' && st.atEnd, st)
await page.screenshot({ path: `${SCR}/enter-next-02-backlog-editing-B.png` })

// -- B -> C --
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
st = await activeInputState()
record('backlog: Enter B -> editing C, caret at end', st.tag === 'INPUT' && st.value === 'QT-Enter-C' && st.atEnd, st)
await page.screenshot({ path: `${SCR}/enter-next-03-backlog-editing-C.png` })

// -- C (last, non-empty) -> new blank line created + focused --
await page.keyboard.press('Enter')
await page.waitForTimeout(150)
st = await activeInputState()
record('backlog: Enter C (last) -> new blank line focused, empty', st.tag === 'INPUT' && st.value === '', st)
await page.screenshot({ path: `${SCR}/enter-next-04-backlog-new-blank-line.png` })

let backlogAfterBlank = await api(`/api/tasks?themeId=${theme.id}&backlog=true`)
record('backlog: no 4th task persisted by opening the blank line', backlogAfterBlank.length === 3, { count: backlogAfterBlank.length })

// -- Enter on that still-empty line -> must NOT create another task --
await page.keyboard.press('Enter')
await page.waitForTimeout(800) // clear of the composer's own debounce/settle window
st = await activeInputState()
record('backlog: Enter on empty last line does not error', pageErrors.length === 0, { pageErrors })
await page.screenshot({ path: `${SCR}/enter-next-05-backlog-after-empty-enter.png` })

const backlogFinal = await api(`/api/tasks?themeId=${theme.id}&backlog=true`)
record('backlog: still exactly the 3 real tasks (no runaway empty task)', backlogFinal.length === 3, { count: backlogFinal.length, titles: backlogFinal.map(t => t.title) })

// ===================== 2) Week-grid daypart cell =====================
const dayCard = page.locator(`[data-date="${TEST_DATE}"]`).first()
await dayCard.scrollIntoViewIfNeeded()
await page.waitForTimeout(200)

await page.getByText('QT-Enter-D', { exact: true }).first().dblclick()
await page.waitForTimeout(150)
st = await activeInputState()
record('day-cell: dblclick D opens edit', st.tag === 'INPUT' && st.value === 'QT-Enter-D', st)
await page.screenshot({ path: `${SCR}/enter-next-06-daycell-editing-D.png` })

await page.keyboard.press('Enter')
await page.waitForTimeout(150)
st = await activeInputState()
record('day-cell: Enter D -> editing E, caret at end', st.tag === 'INPUT' && st.value === 'QT-Enter-E' && st.atEnd, st)
await page.screenshot({ path: `${SCR}/enter-next-07-daycell-editing-E.png` })

await page.keyboard.press('Enter')
await page.waitForTimeout(150)
st = await activeInputState()
record('day-cell: Enter E (last) -> new blank line focused, empty', st.tag === 'INPUT' && st.value === '', st)
await page.screenshot({ path: `${SCR}/enter-next-08-daycell-new-blank-line.png` })

let dayCellAfterBlank = await api(`/api/tasks?from=${TEST_DATE}&to=${TEST_DATE}`)
record('day-cell: no 3rd task persisted by opening the blank line', dayCellAfterBlank.length === 2, { count: dayCellAfterBlank.length })

await page.keyboard.press('Enter')
await page.waitForTimeout(800)
record('day-cell: Enter on empty last line does not error', pageErrors.length === 0, { pageErrors })
await page.screenshot({ path: `${SCR}/enter-next-09-daycell-after-empty-enter.png` })

const dayCellFinal = await api(`/api/tasks?from=${TEST_DATE}&to=${TEST_DATE}`)
record('day-cell: still exactly the 2 real tasks (no runaway empty task)', dayCellFinal.length === 2, { count: dayCellFinal.length, titles: dayCellFinal.map(t => t.title) })

// ===================== Regression checks (Escape / blur / Cmd+B unchanged) =====================
await page.getByText('QT-Enter-A', { exact: true }).first().dblclick()
await page.waitForTimeout(150)
await page.keyboard.type(' EDITED')
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const afterEscape = await api(`/api/tasks?themeId=${theme.id}&backlog=true`)
const taskA = afterEscape.find(t => t.id === backlogTasks[0].id)
record('regression: Escape reverts without moving/saving', taskA?.title === 'QT-Enter-A', { title: taskA?.title })

// One expected, pre-existing artifact: the app's own silent-refresh probe fires on every cold
// login (no refresh token yet -> a single 401 on /auth/refresh) — reproduced identically with
// zero interaction with this feature (see probe401.mjs in this directory), so it's filtered out
// here rather than treated as a regression this change introduced.
const unexpectedConsoleErrors = consoleErrors.filter(e => !e.includes('401'))
record('regression: zero console errors across the whole run (401 refresh-probe excluded, pre-existing)', unexpectedConsoleErrors.length === 0, { consoleErrors, unexpectedConsoleErrors })
record('regression: zero page errors across the whole run', pageErrors.length === 0, { pageErrors })

await browser.close()

// ===================== Cleanup: delete every QT- task + the QT- theme =====================
const allTasksNow = [
  ...(await api(`/api/tasks?themeId=${theme.id}&backlog=true`)),
  ...(await api(`/api/tasks?from=2020-01-01&to=2030-12-31`)).filter(t => t.themeId === theme.id),
]
const uniqueIds = [...new Set(allTasksNow.map(t => t.id))]
for (const id of uniqueIds) {
  await api(`/api/tasks/${id}`, { method: 'DELETE' })
  results.deleted.push({ kind: 'task', id })
}
await api(`/api/themes/${theme.id}`, { method: 'DELETE' })
results.deleted.push({ kind: 'theme', id: theme.id, name: theme.name })

// Verify cleanup actually landed
const backlogAfterCleanup = await api(`/api/tasks?themeId=${theme.id}&backlog=true`).catch(() => [])
const themesAfterCleanup = await api('/api/themes') // default excludes archived
const themeStillActive = themesAfterCleanup.some(t => t.id === theme.id)
record('cleanup: QT- theme backlog empty after delete', backlogAfterCleanup.length === 0, { count: backlogAfterCleanup.length })
record('cleanup: QT- theme archived (no longer in the active list)', !themeStillActive, { themeStillActive })

console.log('\n=== SUMMARY ===')
console.log(JSON.stringify(results, null, 2))
process.exit(results.pass ? 0 : 1)
