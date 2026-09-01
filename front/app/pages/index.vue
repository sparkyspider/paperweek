<script setup lang="ts">
/** The planner — this week on top, next week below, sidebar of life-themes on the left. */
definePageMeta({ middleware: 'auth' })

import { computed, onMounted } from 'vue'
import { useThemesStore } from '~/stores/themes'
import { useTasksStore } from '~/stores/tasks'
import { useAuthStore } from '~/stores/auth'
import { startOfWeekMonday, addDays, fmtISO } from '~/utils/dates'

const themes = useThemesStore()
const tasks = useTasksStore()
const auth = useAuthStore()

const today = new Date()
const thisMonday = startOfWeekMonday(today)
const nextMonday = addDays(thisMonday, 7)
const todayISO = fmtISO(today)
const rangeFrom = fmtISO(thisMonday)
const rangeTo = fmtISO(addDays(thisMonday, 13))

onMounted(() => {
  themes.fetchThemes()
  tasks.fetchRange(rangeFrom, rangeTo)
})

const loadIssue = computed(() => {
  if (themes.unreachable || tasks.unreachable) {
    return themes.error || tasks.error || 'We can’t reach the server right now.'
  }
  return null
})

async function signOut() {
  await auth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[var(--paper)]">
    <ThemeSidebar />

    <main class="thin-scroll flex-1 overflow-y-auto">
      <header class="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--line-soft)] bg-[var(--paper)]/95 px-6 py-3 backdrop-blur">
        <p v-if="loadIssue" class="text-sm text-[var(--danger)]">{{ loadIssue }}</p>
        <p v-else class="text-sm text-[var(--ink-soft)]">Your week, one gentle page at a time.</p>

        <div class="flex items-center gap-3">
          <span v-if="auth.user" class="text-sm text-[var(--ink-soft)]">{{ auth.user.name }}</span>
          <button
            type="button"
            class="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-medium text-[var(--ink-soft)] transition-colors hover:border-[var(--accent-ink)] hover:text-[var(--accent-ink)]"
            @click="signOut"
          >
            Sign out
          </button>
        </div>
      </header>

      <div class="flex flex-col gap-8 px-6 py-6">
        <WeekRow label="This week" week-key="this" :monday="thisMonday" :today-i-s-o="todayISO" />
        <WeekRow label="Next week" week-key="next" :monday="nextMonday" :today-i-s-o="todayISO" />
      </div>
    </main>
  </div>
</template>
