#!/usr/bin/env node
// dnd-matrix.mjs — runs the full DnD defect-hunt matrix against the isolated DND-RIG fixture
// (created by dnd-testdata.mjs) using the rig (dnd-rig.mjs). SAFETY: every source/target
// selector below is scoped to the fixture's own unique task titles / theme names / dates —
// never a generic "first match" selector — so this script cannot touch the user's real themes
// or tasks (FlyH2, Co-Sy, Positive Polar, RT7 Digital, Life Balance, Admin, Personal, Budgets &
// Tax).
//
// Usage: node dnd-matrix.mjs <email> <password> <fixtureJson> <outDir> [--headed]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import * as rig from './dnd-rig.mjs'

const argv = process.argv.slice(2)
const headed = argv.includes('--headed')
const positional = argv.filter(a => a !== '--headed')
const [email, password, fixtureJson, outDir] = positional
if (!email || !password || !fixtureJson || !outDir) {
  console.error('Usage: node dnd-matrix.mjs <email> <password> <fixtureJson> <outDir> [--headed]')
  process.exit(2)
}
mkdirSync(outDir, { recursive: true })

const fixture = JSON.parse(readFileSync(fixtureJson, 'utf8'))
const results = []
let reloadCount = 0 // set by a page.on('framenavigated') listener installed after login below

function shotPath(n, name, suffix = '') { return `${outDir}/${n}-${name}${suffix}.png` }

/** One attempt at a drag case — no retry logic here, that's in runCase. Returns the raw
 *  measurements so runCase can decide whether this looks like an HMR-interrupted run (the
 *  other agent is actively editing front/; a hot reload mid-drag wipes our injected
 *  window.__dndLog listeners and can detach the very elements Playwright is mid-gesture with —
 *  see reloadCount below). */
async function attempt(page, { name, sourceText, sourceScope, targetSelector }, idx, suffix) {
  const source = sourceScope
    ? page.locator(sourceScope).locator('[draggable="true"]', { hasText: sourceText }).first()
    : page.locator('[draggable="true"]', { hasText: sourceText }).first()
  const target = page.locator(targetSelector).first()

  const srcCount = await source.count()
  const tgtCount = await target.count()
  if (srcCount === 0 || tgtCount === 0) {
    return { ok: false, error: `selector miss: source count=${srcCount} target count=${tgtCount}` }
  }

  await rig.resetLog(page)
  await rig.shot(page, shotPath(idx, `${name}-before`, suffix))

  let dragError = null
  try {
    await rig.humanDrag(page, source, target, {
      onMid: async () => { await rig.shot(page, shotPath(idx, `${name}-mid`, suffix)) },
    })
  } catch (e) {
    dragError = e.message
  }
  await rig.shot(page, shotPath(idx, `${name}-after`, suffix))

  const log = await rig.getLog(page)
  const eventTypes = log.map(l => l.type)
  return {
    ok: true, dragError, eventTypes, log,
    firedDragstart: eventTypes.includes('dragstart'),
    firedDrop: eventTypes.includes('drop'),
    screenshots: [shotPath(idx, `${name}-before`, suffix), shotPath(idx, `${name}-mid`, suffix), shotPath(idx, `${name}-after`, suffix)],
  }
}

async function runCase(page, api, spec) {
  const { name, verify } = spec
  console.log(`\n=== ${name} ===`)
  const idx = results.length

  const reloadsBefore = reloadCount
  let a = await attempt(page, spec, idx, '')
  const reloadedDuring = reloadCount > reloadsBefore

  let retried = false
  // Zero events at all despite a completed gesture, OR a reload landed mid-gesture, OR
  // dragstart fired but drop silently didn't (both real-defect-shaped AND HMR-interruption-
  // shaped) — per the mission, re-verify once after a short pause before calling it a defect.
  const looksInterrupted = a.ok && ((a.eventTypes.length === 0) || reloadedDuring || (a.firedDragstart && !a.firedDrop))
  if (looksInterrupted) {
    console.log(`  (first attempt looked interrupted — reloadedDuring=${reloadedDuring}, events=${a.eventTypes.length} — pausing 3s and retrying once)`)
    await page.waitForTimeout(3000)
    await rig.instrument(page) // re-inject in case a reload wiped the window-level listeners
    const reloadsBefore2 = reloadCount
    const b = await attempt(page, spec, idx, '-retry')
    retried = true
    const secondReloaded = reloadCount > reloadsBefore2
    // Prefer the retry's verdict if it completed cleanly; otherwise keep both for the record.
    a = { ...b, firstAttempt: { eventTypes: a.eventTypes, firedDragstart: a.firedDragstart, firedDrop: a.firedDrop, reloadedDuring }, secondReloaded }
  }

  let verifyResult = null
  let verifyOk = null
  if (verify) {
    try {
      verifyResult = await verify(api)
      verifyOk = verifyResult?.ok ?? null
    } catch (e) {
      verifyResult = { error: e.message }
      verifyOk = false
    }
  }

  const r = {
    name, ok: a.ok && !a.dragError && a.firedDragstart && a.firedDrop && (verifyOk !== false),
    retried, error: a.error, dragError: a.dragError,
    firedDragstart: a.firedDragstart, firedDrop: a.firedDrop, eventTypes: a.eventTypes,
    firstAttempt: a.firstAttempt, secondReloaded: a.secondReloaded,
    verifyResult, screenshots: a.screenshots, fullLog: a.log,
  }
  results.push(r)
  console.log(JSON.stringify({ ...r, fullLog: undefined }, null, 2))
  return r
}

const browser = await rig.launch({ headed })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
  page.on('console', (msg) => { if (msg.type() === 'error') console.log('[console error]', msg.text()) })
  page.on('pageerror', (err) => console.log('[pageerror]', err.message))

  // Track full-page reloads/navigations while the matrix runs — the other agent is actively
  // editing front/, and a Vite HMR full-reload mid-drag would silently wipe our injected
  // window.__dndLog listeners (the SPA's in-memory-only access token means we can't read it out
  // of the page anyway — see rig.freshToken — so this is purely for the interruption-detection
  // heuristic in runCase).
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) reloadCount++ })

  await rig.login(page, email, password)
  await rig.instrument(page)
  reloadCount = 0 // don't count the login navigation itself

  // The SPA's access JWT is deliberately in-memory only (apiSession.ts), never localStorage —
  // get an independent token via the same /auth/login the app uses, for API-side verification.
  const token = await rig.freshToken(email, password)
  const api = rig.apiClient(token)
  console.log('Got independent API token for verification:', !!token)

  const today = fixture.today
  const tomorrow = fixture.tomorrow
  const themeACard = `.paper-card:has(h3:text-is("DND RIG A"))`
  const themeBCard = `.paper-card:has(h3:text-is("DND RIG B"))`

  // 1. Backlog -> day line (specific line targeting: today's morning, line 1 — pushes the
  //    existing occupant at line 0 down, per the "write anywhere / push down" model).
  await runCase(page, api, {
    name: '1-backlog-to-day-line',
    sourceText: 'RIG backlog->day',
    targetSelector: `[data-date="${today}"] .day-section:nth-of-type(1) .ruled-line:nth-of-type(2)`,
    verify: async (api) => {
      const t = await rig.verifyTask(api, fixture.tasks.backlogTask, fixture.themeA)
      return { ok: t?.scheduledOn === today && t?.daypart === 'morning', task: t }
    },
  })

  // 2. Day -> day (move a scheduled task from today to tomorrow, same daypart/line).
  await runCase(page, api, {
    name: '2-day-to-day',
    sourceText: 'RIG day->day',
    targetSelector: `[data-date="${tomorrow}"] .day-section:nth-of-type(1) .ruled-line:nth-of-type(1)`,
    verify: async (api) => {
      const t = await rig.verifyTask(api, fixture.tasks.dayToDay, fixture.themeA)
      return { ok: t?.scheduledOn === tomorrow && t?.daypart === 'morning', task: t }
    },
  })

  // 3. Day -> different daypart, same day (morning -> afternoon).
  await runCase(page, api, {
    name: '3-day-to-different-daypart',
    sourceText: 'RIG day->daypart',
    targetSelector: `[data-date="${today}"] .day-section:nth-of-type(2) .ruled-line:nth-of-type(1)`,
    verify: async (api) => {
      const t = await rig.verifyTask(api, fixture.tasks.dayToDaypart, fixture.themeA)
      return { ok: t?.scheduledOn === today && t?.daypart === 'afternoon', task: t }
    },
  })

  // 4. Day -> own theme card (unschedule back to its own theme's backlog).
  await runCase(page, api, {
    name: '4-day-to-own-theme',
    sourceText: 'RIG day->owntheme',
    targetSelector: themeACard,
    verify: async (api) => {
      const t = await rig.verifyTask(api, fixture.tasks.dayToOwnTheme, fixture.themeA)
      return { ok: t?.scheduledOn === null && t?.themeId === fixture.themeA, task: t }
    },
  })

  // 5. Day -> other theme card (re-theme + unschedule).
  await runCase(page, api, {
    name: '5-day-to-other-theme',
    sourceText: 'RIG day->othertheme',
    targetSelector: themeBCard,
    verify: async (api) => {
      const t = await rig.verifyTask(api, fixture.tasks.dayToOtherTheme, fixture.themeB)
      return { ok: t?.scheduledOn === null && t?.themeId === fixture.themeB, task: t }
    },
  })

  // 6. Theme -> theme: is a theme CARD itself draggable at all? (Might not be implemented.)
  const themeCardDraggable = await page.locator(themeACard).getAttribute('draggable').catch(() => null)
  results.push({ name: '6-theme-to-theme', ok: null, note: `ThemeCard root draggable attr = ${JSON.stringify(themeCardDraggable)} — if null/false, theme-to-theme reordering via drag is not implemented (only task-drag onto a theme card as a drop TARGET exists).` })
  console.log('\n=== 6-theme-to-theme ===')
  console.log(results[results.length - 1])

  writeFileSync(`${outDir}/report.json`, JSON.stringify(results, null, 2))
  console.log(`\nWrote report to ${outDir}/report.json`)
} finally {
  await browser.close()
}
