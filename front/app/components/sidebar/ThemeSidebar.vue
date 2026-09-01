<script setup lang="ts">
/** The left sidebar: every life-theme, each with its watercolor swatch and backlog, plus the
 *  "add a theme" affordance at the bottom. */
import { ref, nextTick } from 'vue'
import { THEME_PALETTE, useThemesStore } from '~/stores/themes'

const themes = useThemesStore()

const adding = ref(false)
const draftName = ref('')
const draftColor = ref<string>(THEME_PALETTE[0])
const nameInput = ref<HTMLInputElement | null>(null)

async function reveal() {
  adding.value = true
  draftName.value = ''
  draftColor.value = THEME_PALETTE[Math.floor(Math.random() * THEME_PALETTE.length)]!
  await nextTick()
  nameInput.value?.focus()
}

async function submit() {
  const name = draftName.value.trim()
  if (!name) { cancel(); return }
  await themes.addTheme(name, draftColor.value)
  cancel()
}

function cancel() {
  adding.value = false
  draftName.value = ''
}
</script>

<template>
  <aside class="edge-right no-scrollbar flex h-full w-[280px] shrink-0 flex-col gap-3 overflow-y-auto bg-[var(--paper)] p-4">
    <h1 class="font-hand px-1 text-[30px] font-bold leading-none text-[var(--ink)]">
      Paperweek
    </h1>
    <p class="gouache-underline font-hand mb-1 inline-block w-fit px-1 text-lg font-semibold text-[var(--ink-soft)]">
      Life themes
    </p>

    <p v-if="themes.unreachable" class="px-1 text-xs text-[var(--danger)]">
      {{ themes.error }}
    </p>
    <p v-else-if="themes.loaded && !themes.active.length && !adding" class="px-1 text-xs italic text-[var(--ink-faint)]">
      No themes yet — add your first one below.
    </p>

    <ThemeCard v-for="t in themes.active" :key="t.id" :theme="t" />

    <div v-if="adding" class="paper-card flex flex-col gap-2 p-3">
      <input
        ref="nameInput"
        v-model="draftName"
        type="text"
        placeholder="Theme name…"
        class="w-full border-0 border-b border-dashed border-[var(--accent-ink)] bg-transparent text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
        @keyup.enter="submit"
        @keyup.esc="cancel"
      >
      <div class="flex flex-wrap items-center gap-1.5">
        <button
          v-for="c in THEME_PALETTE"
          :key="c"
          type="button"
          class="h-5 w-5 rounded-full border-2 transition-transform hover:scale-110"
          :style="{ background: c, borderColor: draftColor === c ? 'var(--ink)' : 'transparent' }"
          :aria-label="`Pick color ${c}`"
          @click="draftColor = c"
        />
      </div>
      <div class="flex justify-end gap-3 pt-1">
        <button type="button" class="text-xs text-[var(--ink-faint)] hover:text-[var(--ink)]" @click="cancel">Cancel</button>
        <button type="button" class="text-xs font-semibold text-[var(--accent-ink)] hover:text-[var(--accent-ink-dark)]" @click="submit">Add theme</button>
      </div>
    </div>
    <button
      v-else
      type="button"
      class="rounded-none px-2 py-1.5 text-left text-sm font-medium text-[var(--accent-ink)] opacity-80 transition-opacity hover:opacity-100"
      @click="reveal"
    >
      + add a theme
    </button>
  </aside>
</template>
