<script setup lang="ts">
/** The planner — an endless horizontal day strip on the right, sidebar of life-themes on the
 *  left. The header stays the desk (--paper, no white slabs): "Today" is ink text with an
 *  underline that appears on interaction, not a button-shaped card; the user's own name IS the
 *  menu — a signature (Caveat) that opens a small paper popover holding Sign out. */
definePageMeta({ middleware: 'auth' })

import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
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

const menuOpen = ref(false)
const menuRoot = ref<HTMLElement | null>(null)

function toggleMenu(): void {
  menuOpen.value = !menuOpen.value
}
function closeMenu(): void {
  menuOpen.value = false
}
function onDocClick(e: MouseEvent): void {
  if (menuOpen.value && menuRoot.value && !menuRoot.value.contains(e.target as Node)) closeMenu()
}
onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => document.removeEventListener('click', onDocClick))
</script>

<template>
  <div class="flex h-screen w-screen overflow-hidden bg-[var(--paper)]">
    <ThemeSidebar />

    <main class="flex h-full flex-1 flex-col overflow-hidden">
      <header class="edge-bottom z-10 flex shrink-0 items-center justify-between bg-[var(--paper)]/95 px-6 py-3 backdrop-blur">
        <p v-if="loadIssue" class="text-sm text-[var(--danger)]">{{ loadIssue }}</p>
        <p v-else class="text-sm text-[var(--ink-soft)]">Your week, one gentle page at a time.</p>

        <div class="flex items-center gap-4">
          <button
            type="button"
            class="gouache-underline-hover font-hand cursor-pointer text-base text-[var(--ink)]"
            @click="stripRef?.scrollToToday()"
          >
            Today
          </button>

          <div v-if="auth.user" ref="menuRoot" class="relative">
            <button
              type="button"
              class="font-hand cursor-pointer text-lg text-[var(--ink)] transition-opacity hover:opacity-75"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              @click="toggleMenu"
              @keydown.esc="closeMenu"
            >
              {{ auth.user.name }}
            </button>

            <div
              v-if="menuOpen"
              role="menu"
              class="paper-card absolute right-0 top-full z-20 mt-2 min-w-[9rem] p-1.5"
              @keydown.esc="closeMenu"
            >
              <button
                type="button"
                role="menuitem"
                class="font-ui w-full cursor-pointer px-3 py-1.5 text-left text-sm text-[var(--ink-soft)] transition-colors hover:text-[var(--accent-ink)]"
                @click="closeMenu(); signOut()"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </header>

      <DayStrip ref="stripRef" class="min-h-0 flex-1" />
    </main>
  </div>
</template>
