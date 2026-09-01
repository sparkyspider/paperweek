<script setup lang="ts">
/** The planner — an endless horizontal day strip on the right, sidebar of life-themes on the
 *  left. */
definePageMeta({ middleware: 'auth' })

import { ref, computed, onMounted } from 'vue'
import { useThemesStore } from '~/stores/themes'
import { useAuthStore } from '~/stores/auth'

const themes = useThemesStore()
const auth = useAuthStore()

const stripRef = ref<{ scrollToToday: (smooth?: boolean) => void } | null>(null)

onMounted(() => {
  themes.fetchThemes()
})

const loadIssue = computed(() => (themes.unreachable ? themes.error : null))

async function signOut() {
  await auth.logout()
  await navigateTo('/login')
}
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[var(--paper)]">
    <ThemeSidebar />

    <main class="flex h-full flex-1 flex-col overflow-hidden">
      <header class="edge-bottom z-10 flex shrink-0 items-center justify-between bg-[var(--paper)]/95 px-6 py-3 backdrop-blur">
        <p v-if="loadIssue" class="text-sm text-[var(--danger)]">{{ loadIssue }}</p>
        <p v-else class="text-sm text-[var(--ink-soft)]">Your week, one gentle page at a time.</p>

        <div class="flex items-center gap-3">
          <button type="button" class="pill-btn" @click="stripRef?.scrollToToday()">Today</button>
          <span v-if="auth.user" class="text-sm text-[var(--ink-soft)]">{{ auth.user.name }}</span>
          <button type="button" class="pill-btn" @click="signOut">Sign out</button>
        </div>
      </header>

      <DayStrip ref="stripRef" class="min-h-0 flex-1" />
    </main>
  </div>
</template>
