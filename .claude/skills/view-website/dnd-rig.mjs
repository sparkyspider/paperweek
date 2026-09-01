#!/usr/bin/env node
// dnd-rig.mjs — reusable rig for testing REAL HTML5 drag-and-drop in Paperweek with Playwright.
//
// METHOD (established by dnd-spike.mjs): headless Chromium DOES fire native dragstart / drag /
// dragenter / dragover / dragleave / drop / dragend events for HTML5 `draggable` elements, via
// BOTH page.dragAndDrop() and manual page.mouse.down() -> N x mouse.move() -> mouse.up(). We use
// the manual-steps method here (humanDrag) because it's the closer analogue of a real mouse:
// it crosses the browser's drag-start pixel threshold over several small moves (not one jump),
// it lets dragover fire repeatedly along the path (needed for auto-scroll / line-highlight
// logic that reads e.clientX/Y per-move), and it lets us screenshot mid-drag. headless:false
// (headed) was NOT needed — headless Chromium's native DnD worked in the spike — so this rig
// defaults to headless and only takes --headed as an override for visual debugging.
//
// Exports for use from a driver script:
//   launch(), login(), instrument(page), getLog(page), humanDrag(page, source, target, opts),
//   shot(page, path), apiClient(token), verifyTask(token, id)
//
// CLI (single ad-hoc drag, for debugging):
//   node dnd-rig.mjs <email> <password> <sourceSelectorOrText> <targetSelector> [--headed]
import { chromium } from 'playwright'

export async function launch({ headed = false } = {}) {
  return chromium.launch({ headless: !headed })
}

/** Log in through the real UI (fills the form, submits) so Pinia + cookies are populated,
 *  exactly like a real session — NOT the fetch-in-page shortcut login.mjs uses, because we
 *  need the actual app SPA state (auth store, planner mounted) for DnD to have anything to
 *  grab. Returns the accessToken too (read out of localStorage) for API-side verification. */
export async function login(page, email, password) {
  await page.goto('http://localhost:3200/login', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(500)
  await page.waitForSelector('input[type=email]', { timeout: 10000 })
  await page.click('input[type=email]')
  await page.type('input[type=email]', email, { delay: 20 })
  await page.click('input[type=password]')
  await page.type('input[type=password]', password, { delay: 20 })
  await Promise.all([
    page.click('button[type=submit]'),
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
  ])
  // Let the SPA mount + the day-strip's settle-then-dock finish (ResizeObserver + 120ms timer).
  await page.waitForTimeout(2000)
}

/** Capture-phase window listeners for every DnD event type, timestamped, with a short
 *  description of e.target and the client coordinates — this is how we PROVE dragstart/
 *  dragover/drop actually fire in the page (vs. a script that merely dispatches synthetic
 *  events and assumes the app reacted). Call getLog() after a gesture to retrieve + it also
 *  resets the buffer for the next gesture. */
export async function instrument(page) {
  await page.evaluate(() => {
    window.__dndLog = []
    const describe = (el) => {
      if (!el || !el.tagName) return String(el)
      const day = el.closest?.('[data-date]')?.dataset?.date
      const cls = (el.className || '').toString().slice(0, 60)
      const text = (el.textContent || '').trim().slice(0, 40)
      return `${el.tagName.toLowerCase()}${day ? `[date=${day}]` : ''}.${cls} "${text}"`
    }
    const types = ['dragstart', 'drag', 'dragenter', 'dragover', 'dragleave', 'drop', 'dragend']
    for (const t of types) {
      window.addEventListener(t, (e) => {
        window.__dndLog.push({
          type: t, target: describe(e.target), x: e.clientX, y: e.clientY, t: performance.now(),
        })
      }, true)
    }
  })
}

export async function getLog(page) {
  return page.evaluate(() => window.__dndLog || [])
}

export async function resetLog(page) {
  await page.evaluate(() => { window.__dndLog = [] })
}

/** The manual-mouse-steps drag: down on source center, N interpolated moves toward target
 *  center (crossing the native drag threshold and letting dragover re-fire along the path),
 *  a short dwell over the target, then up. Returns {srcBox, tgtBox, midPoint} for screenshot
 *  bookkeeping. `onMid(x,y)` is called once the pointer is ~halfway there, before continuing —
 *  use it to take the "mid-drag" screenshot the mission asks for. */
export async function humanDrag(page, source, target, opts = {}) {
  const steps = opts.steps ?? 8
  const stepDelay = opts.stepDelay ?? 40
  const settleDelay = opts.settleDelay ?? 300
  const onMid = opts.onMid

  // boundingBox() does NOT auto-scroll (unlike .click()) — an element below the fold (e.g. a
  // theme card far down the sidebar list) would otherwise hand back an off-viewport y and
  // page.mouse.move() would silently target a point outside the rendered window. A real user
  // scrolls the relevant panel into view before grabbing/aiming a drag, so this mirrors that.
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  await page.waitForTimeout(100)

  const srcBox = await source.boundingBox()
  const tgtBox = await target.boundingBox()
  if (!srcBox) throw new Error('humanDrag: source has no bounding box (not visible/attached?)')
  if (!tgtBox) throw new Error('humanDrag: target has no bounding box (not visible/attached?)')

  const startX = srcBox.x + srcBox.width / 2
  const startY = srcBox.y + srcBox.height / 2
  const endX = tgtBox.x + Math.min(20, tgtBox.width / 2)
  const endY = tgtBox.y + tgtBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.waitForTimeout(60) // dwell — real mice don't teleport off mousedown instantly

  for (let i = 1; i <= steps; i++) {
    const x = startX + (endX - startX) * (i / steps)
    const y = startY + (endY - startY) * (i / steps)
    await page.mouse.move(x, y)
    if (i === Math.ceil(steps / 2) && onMid) await onMid(x, y)
    await page.waitForTimeout(stepDelay)
  }
  await page.waitForTimeout(60) // dwell over target — lets dragover/dragenter settle
  await page.mouse.up()
  await page.waitForTimeout(settleDelay)

  return { srcBox, tgtBox }
}

export async function shot(page, path) {
  await page.screenshot({ path })
}

// ---- API-side verification (same envelope shape as front/app/composables/useApi.ts) ----
const API = 'http://localhost:3201'

/** The SPA keeps its access JWT in memory only (apiSession.ts — deliberately never
 *  localStorage), so we can't read it out of the page. Get an independent token for
 *  verification with a plain server-to-server fetch (no browser needed) — same credentials,
 *  same /auth/login the app itself uses. */
export async function freshToken(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const env = await res.json()
  if (!res.ok) throw new Error(`login failed: ${JSON.stringify(env.error)}`)
  return env.data.accessToken
}

export function apiClient(token) {
  return async function api(path, opts = {}) {
    const res = await fetch(`${API}${path}`, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    })
    const env = await res.json()
    if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(env.error)}`)
    return env.data
  }
}

/** Fetch one task's current server-side state by id (via a wide date range so it's found
 *  whether scheduled or not — GET /api/tasks needs either a range or a themeId+backlog flag,
 *  so we pull the theme's backlog AND a wide range and find it in whichever list has it). */
export async function verifyTask(api, taskId, themeId) {
  const [range, backlog] = await Promise.all([
    api('/api/tasks?from=2020-01-01&to=2030-12-31'),
    themeId ? api(`/api/tasks?themeId=${themeId}&backlog=true`) : Promise.resolve([]),
  ])
  return [...range, ...backlog].find(t => t.id === taskId) ?? null
}

// ---- CLI: one ad-hoc drag for debugging ----
if (process.argv[1] && process.argv[1].endsWith('dnd-rig.mjs')) {
  const argv = process.argv.slice(2)
  const headed = argv.includes('--headed')
  const positional = argv.filter(a => a !== '--headed')
  const [email, password, sourceText, targetSelector] = positional
  if (!email || !password || !sourceText || !targetSelector) {
    console.error('Usage: node dnd-rig.mjs <email> <password> <sourceTaskTitleText> <targetCssSelector> [--headed]')
    process.exit(2)
  }
  const browser = await launch({ headed })
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
    await login(page, email, password)
    await instrument(page)
    const source = page.locator('[draggable="true"]', { hasText: sourceText }).first()
    const target = page.locator(targetSelector).first()
    await shot(page, '/tmp/dnd-rig-before.png')
    await humanDrag(page, source, target, {
      onMid: async () => { await shot(page, '/tmp/dnd-rig-mid.png') },
    })
    await shot(page, '/tmp/dnd-rig-after.png')
    const log = await getLog(page)
    console.log(JSON.stringify({ events: log.map(l => l.type), fullLog: log }, null, 2))
  } finally {
    await browser.close()
  }
}
