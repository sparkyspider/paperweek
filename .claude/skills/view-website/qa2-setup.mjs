#!/usr/bin/env node
// QA II fixture setup — creates QT- prefixed test data via the API for the 10 retests.
// Writes fixture IDs to qa2-fixture.json for use by test scripts + teardown.
import * as rig from './dnd-rig.mjs'
import { writeFileSync } from 'node:fs'

const EMAIL = 'mark@flyh2.com'
const PW = process.env.PW
if (!PW) throw new Error('set PW env var')

const QT_THEME_ID = '5fd7f647-6ea0-42f2-99e9-cc4d6c5a4865' // QT-SenseTest

const token = await rig.freshToken(EMAIL, PW)
const api = rig.apiClient(token)

async function mk(title, extra = {}) {
  return api('/api/tasks', { method: 'POST', body: { themeId: QT_THEME_ID, title, ...extra } })
}
async function schedule(id, scheduledOn, daypart, position = 0) {
  return api(`/api/tasks/${id}`, { method: 'PATCH', body: { scheduledOn, daypart, position } })
}

const fixture = { themeId: QT_THEME_ID, taskIds: [], tasks: {} }

// T1: End/Home edit-trap probe (day-card + sidebar)
const t1day = await mk('QT-EndHome probe day')
await schedule(t1day.id, '2026-09-08', 'morning', 0)
fixture.tasks.t1day = t1day.id

const t1side = await mk('QT-EndHome probe side')
fixture.tasks.t1side = t1side.id

// T5: unschedule single-PATCH probe
const t5 = await mk('QT-unschedule probe')
await schedule(t5.id, '2026-09-09', 'afternoon', 0)
fixture.tasks.t5 = t5.id

// T6: week-density — control day 0 tasks (2026-09-08, used by t1day, so pick a clean day instead)
// Use 2026-09-14 (Mon) as zero-task control, 2026-09-15 one task, 2026-09-16 two tasks, 2026-09-17 three+ tasks
await schedule((await mk('QT-density 1a')).id, '2026-09-15', 'morning', 0)
await schedule((await mk('QT-density 2a')).id, '2026-09-16', 'morning', 0)
await schedule((await mk('QT-density 2b')).id, '2026-09-16', 'afternoon', 0)
await schedule((await mk('QT-density 3a')).id, '2026-09-17', 'morning', 0)
await schedule((await mk('QT-density 3b')).id, '2026-09-17', 'afternoon', 0)
await schedule((await mk('QT-density 3c')).id, '2026-09-17', 'evening', 0)

// T7: ghost-dot residue probe
const t7 = await mk('QT-ghostdot probe')
await schedule(t7.id, '2026-09-10', 'morning', 0)
fixture.tasks.t7 = t7.id

// T9: strike-calm probe (click-to-strike) + edit probe (dblclick)
const t9strike = await mk('QT-strike calm words here')
await schedule(t9strike.id, '2026-09-11', 'morning', 0)
fixture.tasks.t9strike = t9strike.id
const t9edit = await mk('QT-edit accent probe')
await schedule(t9edit.id, '2026-09-11', 'afternoon', 0)
fixture.tasks.t9edit = t9edit.id

// T10: margin-dot picker probe
const t10 = await mk('QT-margindot probe')
await schedule(t10.id, '2026-09-12', 'morning', 0)
fixture.tasks.t10 = t10.id

// T4: teaching-note drag probe (must stay in backlog, undragged, for the drag)
const t4 = await mk('QT-teach drag probe')
fixture.tasks.t4 = t4.id

// collect all created task ids by re-querying (simplest: gather from above refs)
fixture.taskIds = [
  t1day.id, t1side.id, t5.id, t7.id, t9strike.id, t9edit.id, t10.id, t4.id,
]
// plus density tasks — refetch backlog+range to find them since we didn't keep refs
const range = await api('/api/tasks?from=2026-09-01&to=2026-09-30')
for (const t of range) {
  if (t.title && t.title.startsWith('QT-density') && !fixture.taskIds.includes(t.id)) fixture.taskIds.push(t.id)
}

writeFileSync('./qa2-fixture.json', JSON.stringify(fixture, null, 2))
console.log(JSON.stringify(fixture, null, 2))
