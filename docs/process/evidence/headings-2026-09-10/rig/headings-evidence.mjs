#!/usr/bin/env node
/* Evidence run for "bold tasks become headings" (2026-09-10).
 *
 * Runs entirely inside two THROWAWAY themes (HDG A / HDG B) created for the run and removed
 * after it. The first version of this script drove Mark's real theme cards and, through the
 * wrong-row bug this run exists to prove is fixed, renamed one of his tasks. Nothing here touches
 * a pre-existing row again. */
// Playwright lives in the view-website skill's node_modules, not here. ESM resolves bare
// specifiers relative to the IMPORTING FILE, not the cwd, so this is a path, not a package name —
// which also means the rig can be run from anywhere:
//   node docs/process/evidence/headings-2026-09-10/rig/headings-evidence.mjs <email> <password>
import { chromium } from '../../../../../.claude/skills/view-website/node_modules/playwright/index.mjs'

const OUT = '/Users/sparkyspider/IdeaProjects/paperweek/docs/process/evidence/headings-2026-09-10'
const EMAIL = process.argv[2]
const PASS = process.argv[3]
const FRIDAY = '2026-09-11'
const FRIDAY_LABEL = 'September 11'

const consoleErrors = []
const pageErrors = []
const log = []

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1500 } })
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
page.on('pageerror', e => pageErrors.push(e.message))

async function api(path, opts = {}) {
  return page.evaluate(async (a) => {
    const r = await fetch(`http://localhost:3201${a.path}`, {
      method: a.method || 'GET',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${window.__tok}` },
      body: a.body ? JSON.stringify(a.body) : undefined,
    })
    const j = await r.json().catch(() => null)
    return { status: r.status, data: j?.data ?? j }
  }, { path, ...opts })
}
async function mintToken() {
  return page.evaluate(async (a) => {
    const r = await fetch('http://localhost:3201/auth/login', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: a.email, password: a.password }),
    })
    window.__tok = (await r.json()).data?.accessToken
    return window.__tok
  }, { email: EMAIL, password: PASS })
}

/** The Friday day-card, found by its DATE label — never by the weekday name: the strip renders
 *  many weeks, so "the first card saying Friday" is some other Friday entirely. */
const fridayFinder = `(() => {
  const lines = [...document.querySelectorAll('.day-lines')]
  return lines.map(l => l.parentElement).find(c => c && c.innerText.includes(${JSON.stringify(FRIDAY_LABEL)})) ?? null
})()`
const fridayCard = async () => (await page.evaluateHandle(`(${fridayFinder})`)).asElement()
const gridRows = () => page.evaluate(`(() => {
  const card = ${fridayFinder}
  return [...card.querySelectorAll('.ruled-line')].map(row => {
    const txt = row.innerText.trim(); if (!txt) return null
    const w = row.querySelector('.wash-highlight')
    return { txt, marginDot: !!row.querySelector('.line-dot'), wash: !!w,
             washColor: w ? getComputedStyle(w).getPropertyValue('--wash').trim() : null }
  }).filter(Boolean)
})()`)
const focusGridRow = (t) => page.evaluate(`(() => {
  const card = ${fridayFinder}
  const row = [...card.querySelectorAll('.ruled-line')].find(r => r.innerText.includes(${JSON.stringify(t)}))
  row.querySelector('span[role="button"]').focus()
})()`)
const gridRowState = (t) => page.evaluate(`(() => {
  const card = ${fridayFinder}
  const row = [...card.querySelectorAll('.ruled-line')].find(r => r.innerText.includes(${JSON.stringify(t)}))
  const w = row.querySelector('.wash-highlight')
  return { marginDot: !!row.querySelector('.line-dot'), wash: !!w,
           washColor: w ? getComputedStyle(w).getPropertyValue('--wash').trim() : null,
           inputLeftBehind: !!row.querySelector('input') }
})()`)

/** A viewport clip around the open picker plus the line that opened it — a full-page shot of a
 *  teleported, fixed-positioned popover is mostly empty paper. */
async function pickerClip() {
  const box = await page.evaluate(`(() => {
    const el = document.querySelector('[role="listbox"][aria-label="Choose theme"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.max(0, r.left - 210), y: Math.max(0, r.top - 60),
             width: Math.min(520, window.innerWidth), height: Math.min(r.height + 90, window.innerHeight) }
  })()`)
  return box ?? { x: 0, y: 0, width: 520, height: 320 }
}

let themeA = null, themeB = null
try {
  await page.goto('http://localhost:3200/login', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]')
  await page.click('input[type=email]'); await page.type('input[type=email]', EMAIL, { delay: 20 })
  await page.click('input[type=password]'); await page.type('input[type=password]', PASS, { delay: 20 })
  await Promise.all([page.click('button[type=submit]'), page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => {})])
  await page.waitForTimeout(1500)
  if (!await mintToken()) throw new Error('no access token')

  // strays from an earlier aborted run: same throwaway names, still holding day-cell rows
  const existing = (await api('/api/themes?includeArchived=true')).data
  const strays = (Array.isArray(existing) ? existing : []).filter(t => t.name === 'HDG A' || t.name === 'HDG B')
  if (strays.length) {
    const strayIds = new Set(strays.map(t => t.id))
    const ranged = (await api('/api/tasks?from=2026-09-01&to=2026-09-30')).data
    let n = 0
    for (const t of (Array.isArray(ranged) ? ranged : [])) if (strayIds.has(t.themeId)) { await api(`/api/tasks/${t.id}`, { method: 'DELETE' }); n++ }
    for (const th of strays) await api(`/api/themes/${th.id}`, { method: 'DELETE' })
    log.push(`purged ${n} stray task(s) from ${strays.length} leftover throwaway theme(s)`)
  }

  themeA = (await api('/api/themes', { method: 'POST', body: { name: 'HDG A', color: '#8fc1e3' } })).data
  themeB = (await api('/api/themes', { method: 'POST', body: { name: 'HDG B', color: '#cf8a6a' } })).data
  log.push(`throwaway themes: ${themeA.name}=${themeA.color} / ${themeB.name}=${themeB.color}`)

  async function mk(title, bold, sched) {
    const t = (await api('/api/tasks', { method: 'POST', body: { themeId: themeA.id, title, bold } })).data
    if (sched) await api(`/api/tasks/${t.id}`, { method: 'PATCH', body: sched })
    return t
  }
  await mk('Week ahead', true)
  await mk('Draft the Findhorn note', false)
  await mk('Call back about the venue', false)
  await mk('Morning block', true, { scheduledOn: FRIDAY, daypart: 'morning', position: 0 })
  await mk('Read the KIPP draft', false, { scheduledOn: FRIDAY, daypart: 'morning', position: 1 })
  await mk('Reply to Hugo', false, { scheduledOn: FRIDAY, daypart: 'morning', position: 2 })

  await page.goto('http://localhost:3200/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2500)

  // ================= 2: the grid =================
  let fc = await fridayCard()
  if (!fc) throw new Error(`no day card labelled ${FRIDAY_LABEL}`)
  await fc.screenshot({ path: `${OUT}/2-grid-heading-no-margin-dot.png` })
  log.push('GRID ROWS (Fri 11 Sep): ' + JSON.stringify(await gridRows()))

  // ---- 6: Cmd+B live toggle, no reload ----
  await focusGridRow('Reply to Hugo')
  const cmdbBefore = await gridRowState('Reply to Hugo')
  await page.keyboard.press('Meta+b')
  await page.waitForTimeout(250)
  const cmdbOn = await gridRowState('Reply to Hugo')
  log.push(`CMD+B "Reply to Hugo": before=${JSON.stringify(cmdbBefore)} after 250ms=${JSON.stringify(cmdbOn)}`)
  await page.evaluate('document.activeElement && document.activeElement.blur()')
  await page.waitForTimeout(200)
  fc = await fridayCard(); await fc.screenshot({ path: `${OUT}/6-cmdb-live-toggle-on.png` })
  await focusGridRow('Reply to Hugo')
  await page.keyboard.press('Meta+b')
  await page.waitForTimeout(800)
  log.push('CMD+B again (off) = ' + JSON.stringify(await gridRowState('Reply to Hugo')))

  // ---- regression guard: a PLAIN task in edit mode renders the input and NOTHING ELSE. The
  //      earlier swatch-row markup sat between the `v-if="editing"` input and its `v-else` text
  //      span, breaking that chain, so a plain row in edit mode rendered both at once. ----
  const plainRowEl = (await page.evaluateHandle(`(() => {
    const card = ${fridayFinder}
    return [...card.querySelectorAll('.ruled-line')].find(r => r.innerText.includes('Reply to Hugo')) ?? null
  })()`)).asElement()
  await (await plainRowEl.$('span[role="button"]')).dblclick()
  await page.waitForTimeout(600)
  log.push('PLAIN task in edit mode: ' + JSON.stringify(await plainRowEl.evaluate(r => ({
    inputs: r.querySelectorAll('input').length,
    textSpans: r.querySelectorAll('span[role="button"]').length,
    dots: r.querySelectorAll('.line-dot').length,
  }))))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)

  // ---- 7 + 8: grid heading edit -> swatch row -> recolour in place ----
  const gridRowEl = (await page.evaluateHandle(`(() => {
    const card = ${fridayFinder}
    return [...card.querySelectorAll('.ruled-line')].find(r => r.innerText.includes('Morning block')) ?? null
  })()`)).asElement()
  await (await gridRowEl.$('span[role="button"]')).dblclick()
  await page.waitForTimeout(700)
  const gridEditDots = await gridRowEl.$$('.line-dot')
  log.push(`GRID heading in edit mode: ${gridEditDots.length} dot(s), title="${gridEditDots.length ? await gridEditDots[0].getAttribute('title') : ''}"`)
  fc = await fridayCard(); await fc.screenshot({ path: `${OUT}/7-grid-edit-one-dot.png` })

  // open the picker off that dot — the SAME swatch+name popover the margin dot opens
  await gridEditDots[0].click()
  await page.waitForTimeout(500)
  const gridPicker = await page.evaluate(`(() => {
    const el = document.querySelector('[role="listbox"][aria-label="Choose theme"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { options: [...el.querySelectorAll('[role="option"]')].map(o => o.innerText.trim()),
             selected: [...el.querySelectorAll('[role="option"]')].filter(o => o.getAttribute('aria-selected') === 'true').map(o => o.innerText.trim()),
             onScreen: r.width > 0 && r.height > 0 }
  })()`)
  log.push('GRID picker open: ' + JSON.stringify(gridPicker))
  await page.screenshot({ path: `${OUT}/7b-grid-picker-open-with-names.png`, clip: await pickerClip() })
  await page.click(`[role="option"]:has-text("${themeB.name}")`)
  await page.waitForTimeout(1200)
  log.push('GRID after picking: ' + JSON.stringify(await gridRowState('Morning block')))
  fc = await fridayCard(); await fc.screenshot({ path: `${OUT}/8-grid-after-pick-recoloured.png` })

  // ================= 1/3/4: the backlog =================
  const card = page.locator('.paper-card', { hasText: themeA.name }).first()
  await card.scrollIntoViewIfNeeded(); await page.waitForTimeout(300)
  await card.screenshot({ path: `${OUT}/1-backlog-heading-no-dot.png` })
  const backlogAudit = await page.evaluate((name) => {
    const c = [...document.querySelectorAll('.paper-card')].find(el => el.querySelector('h3')?.textContent.trim() === name)
    return [...c.querySelectorAll('.ruled-line')].map(row => {
      const txt = row.innerText.trim(); if (!txt) return null
      const w = row.querySelector('.wash-highlight')
      return { txt, inlineDot: !!row.querySelector('span.rounded-full[aria-hidden="true"]'), wash: !!w,
               washColor: w ? getComputedStyle(w).getPropertyValue('--wash').trim() : null }
    }).filter(Boolean)
  }, themeA.name)
  log.push('BACKLOG ROWS: ' + JSON.stringify(backlogAudit))

  await card.locator('span[role="button"]', { hasText: 'Week ahead' }).first().dblclick()
  await page.waitForTimeout(700)
  const bDots = await card.locator('.line-dot').elementHandles()
  log.push(`BACKLOG heading in edit mode: ${bDots.length} dot(s), title="${bDots.length ? await bDots[0].getAttribute('title') : ''}"`)
  await card.screenshot({ path: `${OUT}/3-edit-mode-one-dot.png` })

  await bDots[0].click()
  await page.waitForTimeout(500)
  const bPicker = await page.evaluate(`(() => {
    const el = document.querySelector('[role="listbox"][aria-label="Choose theme"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { options: [...el.querySelectorAll('[role="option"]')].map(o => o.innerText.trim()),
             selected: [...el.querySelectorAll('[role="option"]')].filter(o => o.getAttribute('aria-selected') === 'true').map(o => o.innerText.trim()),
             onScreen: r.width > 0 && r.height > 0 }
  })()`)
  log.push('BACKLOG picker open: ' + JSON.stringify(bPicker))
  await page.screenshot({ path: `${OUT}/3b-backlog-picker-open-with-names.png`, clip: await pickerClip() })
  await page.click(`[role="option"]:has-text("${themeB.name}")`)
  await page.waitForTimeout(1500)
  const after = await page.evaluate((n) => {
    const cards = [...document.querySelectorAll('.paper-card')]
    const find = x => cards.find(el => el.querySelector('h3')?.textContent.trim() === x)
    const a = find(n.a), b = find(n.b)
    const rowOf = c => {
      const r = [...c.querySelectorAll('.ruled-line')].find(x => x.innerText.includes('Week ahead'))
      if (!r) return null
      const w = r.querySelector('.wash-highlight')
      return { wash: !!w, washColor: w ? getComputedStyle(w).getPropertyValue('--wash').trim() : null,
               inlineDot: !!r.querySelector('span.rounded-full[aria-hidden="true"]') }
    }
    return { headingInA: rowOf(a), headingInB: rowOf(b),
      inputsInA: a.querySelectorAll('input').length, inputsInB: b.querySelectorAll('input').length,
      activeElement: document.activeElement?.tagName,
      titlesA: [...a.querySelectorAll('.ruled-line')].map(r => r.innerText.trim()).filter(Boolean),
      titlesB: [...b.querySelectorAll('.ruled-line')].map(r => r.innerText.trim()).filter(Boolean) }
  }, { a: themeA.name, b: themeB.name })
  log.push('AFTER BACKLOG PICK: ' + JSON.stringify(after))

  const cardB = page.locator('.paper-card', { hasText: themeB.name }).first()
  await cardB.scrollIntoViewIfNeeded(); await page.waitForTimeout(400)
  await cardB.screenshot({ path: `${OUT}/4-after-pick-recoloured-moved.png` })
  await page.locator('.paper-card', { hasText: themeA.name }).first().screenshot({ path: `${OUT}/4b-source-card-after-move.png` })

  // ---- 9: dirty title + pick — the typed text must land on THIS task and no other ----
  // HDG B is the LAST card in a long sidebar, and the sidebar is its own scroller — Playwright's
  // scrollIntoViewIfNeeded kept reporting the dot "outside of the viewport". Drive the actual
  // scroll container (first ancestor that overflows) to the bottom instead, then verify by reading
  // the dot's own rect before clicking it, so a failure here says which of the two it was.
  await page.evaluate((n) => {
    const c = [...document.querySelectorAll('.paper-card')].find(el => el.querySelector('h3')?.textContent.trim() === n)
    let p = c?.parentElement
    while (p && p.scrollHeight <= p.clientHeight + 2) p = p.parentElement
    if (p) p.scrollTop = p.scrollHeight
    else window.scrollTo(0, document.body.scrollHeight)
    c?.scrollIntoView({ block: 'center' })
  }, themeB.name)
  await page.waitForTimeout(500)
  await cardB.locator('span[role="button"]', { hasText: 'Week ahead' }).first().dblclick()
  await page.waitForTimeout(500)
  await page.keyboard.press('End')
  await page.keyboard.type(' (revised)', { delay: 30 })
  const dotRect = await page.evaluate((n) => {
    const c = [...document.querySelectorAll('.paper-card')].find(el => el.querySelector('h3')?.textContent.trim() === n)
    const d = c?.querySelector('.line-dot')
    if (!d) return null
    const r = d.getBoundingClientRect()
    return { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height),
             viewportH: window.innerHeight, inView: r.top >= 0 && r.bottom <= window.innerHeight }
  }, themeB.name)
  log.push('dirty-title dot rect: ' + JSON.stringify(dotRect))
  await cardB.locator('.line-dot').first().click()
  await page.waitForTimeout(400)
  const flip = await page.evaluate(`(() => {
    const el = document.querySelector('[role="listbox"][aria-label="Choose theme"]')
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), viewportH: window.innerHeight,
             fullyOnScreen: r.top >= 0 && r.bottom <= window.innerHeight }
  })()`)
  log.push('picker near the viewport foot (flip check): ' + JSON.stringify(flip))
  await page.screenshot({ path: `${OUT}/9b-picker-flips-above-near-foot.png`, clip: await pickerClip() })
  await page.click(`[role="option"]:has-text("${themeA.name}")`)
  await page.waitForTimeout(1500)
  const dirty = await page.evaluate((n) => {
    const c = [...document.querySelectorAll('.paper-card')].find(el => el.querySelector('h3')?.textContent.trim() === n)
    const r = [...c.querySelectorAll('.ruled-line')].find(x => x.innerText.includes('Week ahead'))
    const w = r?.querySelector('.wash-highlight')
    return { landedIn: n, text: r?.innerText.trim() ?? null,
             washColor: w ? getComputedStyle(w).getPropertyValue('--wash').trim() : null,
             titles: [...c.querySelectorAll('.ruled-line')].map(x => x.innerText.trim()).filter(Boolean) }
  }, themeA.name)
  log.push('DIRTY-TITLE + PICK: ' + JSON.stringify(dirty))
  await page.locator('.paper-card', { hasText: themeA.name }).first().screenshot({ path: `${OUT}/9-dirty-title-survives-retheme.png` })

  await page.screenshot({ path: `${OUT}/5-full-page-after.png`, fullPage: true })
  console.log(JSON.stringify({ log, consoleErrors, pageErrors }, null, 2))
} catch (err) {
  console.error('ERROR:', err.message, err.stack)
  console.log(JSON.stringify({ log, consoleErrors, pageErrors }, null, 2))
  process.exitCode = 1
} finally {
  try {
    await mintToken()
    const ids = new Set()
    for (const th of [themeA, themeB]) {
      if (!th) continue
      const raw = (await api(`/api/tasks?themeId=${th.id}&backlog=true`)).data
      for (const t of (Array.isArray(raw) ? raw : [])) ids.add(t.id)
    }
    // …and the SCHEDULED ones, which `backlog=true` never returns. An aborted run once left day-cell
    // strays behind that the next run then counted twice.
    const own = new Set([themeA?.id, themeB?.id].filter(Boolean))
    const ranged = (await api('/api/tasks?from=2026-09-01&to=2026-09-30')).data
    for (const t of (Array.isArray(ranged) ? ranged : [])) if (own.has(t.themeId)) ids.add(t.id)
    for (const id of ids) await api(`/api/tasks/${id}`, { method: 'DELETE' })
    for (const th of [themeA, themeB]) if (th) await api(`/api/themes/${th.id}`, { method: 'DELETE' })
  } catch { /* the DB audit after this run reports anything left behind */ }
  await browser.close()
}
