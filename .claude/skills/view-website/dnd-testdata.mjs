#!/usr/bin/env node
// dnd-testdata.mjs — create/teardown isolated test fixtures for the DnD rig via the API
// (never touching front/back code). Writes fixture IDs to a JSON file so the rig and the
// teardown step agree on what to clean up.
//
// Usage:
//   node dnd-testdata.mjs setup <email> <password> <outJson>
//   node dnd-testdata.mjs teardown <outJson> <email> <password>
import { chromium } from 'playwright'
import { readFileSync, writeFileSync } from 'node:fs'

const API = 'http://localhost:3201'

async function getToken(email, password) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    await page.goto('http://localhost:3200/login', { waitUntil: 'networkidle', timeout: 30000 })
    const result = await page.evaluate(async (args) => {
      const r = await fetch('http://localhost:3201/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ email: args.email, password: args.password }),
      })
      const env = await r.json()
      return { ok: r.ok, accessToken: env.data?.accessToken, error: env.error }
    }, { email, password })
    if (!result.ok) throw new Error('login failed: ' + JSON.stringify(result.error))
    return result.accessToken
  } finally {
    await browser.close()
  }
}

async function api(token, path, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const env = await res.json()
  if (!res.ok) throw new Error(`${opts.method || 'GET'} ${path} -> ${res.status}: ${JSON.stringify(env.error)}`)
  return env.data
}

function todayISO() {
  // Match the app's local-date formatting (fmtISO likely uses local calendar date).
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

async function setup(email, password, outJson) {
  const token = await getToken(email, password)
  const today = todayISO()
  const tomorrow = addDays(today, 1)

  const themeA = await api(token, '/api/themes', { method: 'POST', body: { name: 'DND RIG A', color: '#FF6B6B' } })
  const themeB = await api(token, '/api/themes', { method: 'POST', body: { name: 'DND RIG B', color: '#4ECDC4' } })

  async function mkTask(themeId, title) {
    return api(token, '/api/tasks', { method: 'POST', body: { themeId, title } })
  }

  const backlogTask = await mkTask(themeA.id, 'RIG backlog->day')
  const dayToDay = await mkTask(themeA.id, 'RIG day->day')
  await api(token, `/api/tasks/${dayToDay.id}`, { method: 'PATCH', body: { scheduledOn: today, daypart: 'morning', position: 0 } })

  const dayToDaypart = await mkTask(themeA.id, 'RIG day->daypart')
  await api(token, `/api/tasks/${dayToDaypart.id}`, { method: 'PATCH', body: { scheduledOn: today, daypart: 'morning', position: 1 } })

  const dayToOwnTheme = await mkTask(themeA.id, 'RIG day->owntheme')
  await api(token, `/api/tasks/${dayToOwnTheme.id}`, { method: 'PATCH', body: { scheduledOn: today, daypart: 'evening', position: 0 } })

  const dayToOtherTheme = await mkTask(themeA.id, 'RIG day->othertheme')
  await api(token, `/api/tasks/${dayToOtherTheme.id}`, { method: 'PATCH', body: { scheduledOn: today, daypart: 'notes', position: 0 } })

  // A neighbor task on the SAME line as backlogTask's drop target, to check push-down behavior.
  const dayLineOccupant = await mkTask(themeA.id, 'RIG line-occupant')
  await api(token, `/api/tasks/${dayLineOccupant.id}`, { method: 'PATCH', body: { scheduledOn: today, daypart: 'morning', position: 0 } })

  const fixture = {
    email, today, tomorrow,
    themeIds: [themeA.id, themeB.id],
    themeA: themeA.id, themeB: themeB.id,
    taskIds: [backlogTask.id, dayToDay.id, dayToDaypart.id, dayToOwnTheme.id, dayToOtherTheme.id, dayLineOccupant.id],
    tasks: {
      backlogTask: backlogTask.id,
      dayToDay: dayToDay.id,
      dayToDaypart: dayToDaypart.id,
      dayToOwnTheme: dayToOwnTheme.id,
      dayToOtherTheme: dayToOtherTheme.id,
      dayLineOccupant: dayLineOccupant.id,
    },
  }
  writeFileSync(outJson, JSON.stringify(fixture, null, 2))
  console.log(JSON.stringify(fixture, null, 2))
}

async function teardown(outJson, email, password) {
  const fixture = JSON.parse(readFileSync(outJson, 'utf8'))
  const token = await getToken(email, password)
  for (const id of fixture.taskIds) {
    try { await api(token, `/api/tasks/${id}`, { method: 'DELETE' }) } catch (e) { console.error('task delete failed', id, e.message) }
  }
  for (const id of fixture.themeIds) {
    try { await api(token, `/api/themes/${id}`, { method: 'DELETE' }) } catch (e) { console.error('theme archive failed', id, e.message) }
  }
  console.log('Teardown complete: archived', fixture.taskIds.length, 'tasks and', fixture.themeIds.length, 'themes')
}

const [, , cmd, ...rest] = process.argv
if (cmd === 'setup') {
  const [email, password, outJson] = rest
  await setup(email, password, outJson)
} else if (cmd === 'teardown') {
  const [outJson, email, password] = rest
  await teardown(outJson, email, password)
} else {
  console.error('Usage: node dnd-testdata.mjs setup <email> <password> <outJson>')
  console.error('       node dnd-testdata.mjs teardown <outJson> <email> <password>')
  process.exit(2)
}
