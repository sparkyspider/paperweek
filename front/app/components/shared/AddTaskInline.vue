<script setup lang="ts">
/** The "+ add a task" affordance — used both inside a theme's backlog (theme already known)
 *  and inside a day/daypart cell (theme must be picked, via a small row of swatch dots). */
import { ref, nextTick, computed } from 'vue'
import type { Theme } from '~/stores/themes'

const props = defineProps<{
  /** Fixed theme (backlog context) — when set, no picker is shown. */
  themeId?: string
  /** Choosable themes (day-cell context). */
  themes?: Theme[]
  placeholder?: string
}>()

const emit = defineEmits<{ create: [themeId: string, title: string] }>()

const open = ref(false)
const title = ref('')
const picked = ref<string | null>(null)
const input = ref<HTMLInputElement | null>(null)

const pickerThemes = computed(() => props.themes ?? [])
const effectiveThemeId = computed(() => props.themeId ?? picked.value ?? pickerThemes.value[0]?.id ?? null)

async function reveal() {
  open.value = true
  picked.value = props.themeId ?? pickerThemes.value[0]?.id ?? null
  await nextTick()
  input.value?.focus()
}

function submit() {
  const t = title.value.trim()
  const themeId = effectiveThemeId.value
  if (!t || !themeId) { close(); return }
  emit('create', themeId, t)
  title.value = ''
  close()
}

function close() {
  open.value = false
  title.value = ''
}
</script>

<template>
  <button
    v-if="!open"
    type="button"
    class="mt-0.5 rounded px-1.5 py-1 text-left text-xs font-medium text-[var(--accent-ink)] opacity-70 transition-opacity hover:opacity-100"
    @click="reveal"
  >
    + add a task
  </button>
  <div v-else class="mt-0.5 flex flex-col gap-1.5 rounded-lg bg-[var(--paper-sunken)] p-1.5">
    <input
      ref="input"
      v-model="title"
      type="text"
      :placeholder="placeholder ?? 'Task title…'"
      class="w-full border-b border-dashed border-[var(--accent-ink)] bg-transparent px-0.5 py-0.5 text-sm text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
      @keyup.enter="submit"
      @keyup.esc="close"
    >
    <div v-if="pickerThemes.length" class="flex items-center gap-1.5 px-0.5">
      <button
        v-for="th in pickerThemes"
        :key="th.id"
        type="button"
        class="h-4 w-4 rounded-full border-2 transition-transform"
        :style="{ background: th.color, borderColor: picked === th.id ? 'var(--ink)' : 'transparent' }"
        :aria-label="`Assign to ${th.name}`"
        :aria-pressed="picked === th.id"
        @click="picked = th.id"
      />
    </div>
    <div class="flex justify-end gap-2 px-0.5">
      <button type="button" class="text-xs text-[var(--ink-faint)] hover:text-[var(--ink)]" @click="close">Cancel</button>
      <button type="button" class="text-xs font-semibold text-[var(--accent-ink)] hover:text-[var(--accent-ink-dark)]" @click="submit">Add</button>
    </div>
  </div>
</template>
