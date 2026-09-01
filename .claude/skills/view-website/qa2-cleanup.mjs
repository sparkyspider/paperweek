#!/usr/bin/env node
// QA II final cleanup: delete every QT- prefixed task (scheduled + backlog) and archive the
// QT-SenseTest test theme, per standing data-hygiene order.
import * as rig from './dnd-rig.mjs'

const PW = process.env.PW
const QT_THEME = '5fd7f647-6ea0-42f2-99e9-cc4d6c5a4865'

const token = await rig.freshToken('mark@flyh2.com', PW)
const api = rig.apiClient(token)

// Wide range covering everything QA II touched (Aug 2026 - Oct 2026), plus the QT theme's backlog.
const [range, backlog] = await Promise.all([
  api('/api/tasks?from=2026-08-01&to=2026-10-31'),
  api(`/api/tasks?themeId=${QT_THEME}&backlog=true`),
])

const all = [...range, ...backlog]
const seen = new Set()
const qtTasks = all.filter(t => {
  if (!t.title || !t.title.startsWith('QT-')) return false
  if (seen.has(t.id)) return false
  seen.add(t.id)
  return true
})

console.log(`Found ${qtTasks.length} QT- tasks to delete.`)
const deleted = []
const failed = []
for (const t of qtTasks) {
  try {
    await api(`/api/tasks/${t.id}`, { method: 'DELETE' })
    deleted.push({ id: t.id, title: t.title })
  } catch (e) {
    failed.push({ id: t.id, title: t.title, error: e.message })
  }
}

console.log(`Deleted: ${deleted.length}, Failed: ${failed.length}`)
if (failed.length) console.log(JSON.stringify(failed, null, 2))

// Archive the QT-SenseTest theme (soft delete, per SPEC's archive-with-undo philosophy).
try {
  await api(`/api/themes/${QT_THEME}`, { method: 'DELETE' })
  console.log('QT-SenseTest theme archived.')
} catch (e) {
  console.log('Theme archive failed:', e.message)
}

// Verify: re-query and confirm no QT- tasks remain anywhere.
const [range2, backlog2] = await Promise.all([
  api('/api/tasks?from=2026-08-01&to=2026-10-31'),
  api(`/api/tasks?themeId=${QT_THEME}&backlog=true`).catch(() => []),
])
const remaining = [...range2, ...backlog2].filter(t => t.title && t.title.startsWith('QT-'))
console.log(`Remaining QT- tasks after cleanup: ${remaining.length}`)
if (remaining.length) console.log(JSON.stringify(remaining.map(t => ({ id: t.id, title: t.title })), null, 2))

const themes = await api('/api/themes')
console.log('Active themes now:', themes.map(t => t.name).join(', '))
