<script setup lang="ts">
/** One daypart REGION of the day card's single continuous ruled sheet — Morning / Afternoon /
 *  Evening / Notes. Not its own box: no background, no border, no independent scroll — it's
 *  just a run of `.ruled-line` rows within the card's one shared ruling (see .ruled-paper on
 *  the wrapper in DayCard.vue), marked only by a big, faint, right-aligned watermark sitting
 *  behind the content (see .section-watermark in main.css).
 *
 *  Write anywhere: every empty line is individually clickable and writable (useAutosaveLines
 *  — no Add button; typing autosaves; the task lands ON the line you clicked, not appended to
 *  the end). Writing onto — or dropping onto — an occupied line pushes it and its followers
 *  down one line each. */
import { computed, nextTick, ref } from 'vue'
import type { Daypart } from '~/stores/tasks'
import { useTasksStore } from '~/stores/tasks'
import { useThemesStore } from '~/stores/themes'
import { useAutosaveLines, type DraftLine } from '~/composables/useAutosaveLines'
import { useThemeVisibility } from '~/composables/useThemeVisibility'
import { taskIdFromDrag } from '~/utils/dnd'

const props = defineProps<{ dateISO: string; daypart: Daypart; label: string }>()

const tasks = useTasksStore()
const themes = useThemesStore()
const visibility = useThemeVisibility()
const dragOverIndex = ref<number | null>(null)

/** Only VISIBLE themes' swatches on the typing picker — but never a dead end: if every theme
 *  is hidden, fall back to offering them all. */
const pickerThemes = computed(() => {
  const visible = themes.active.filter(t => visibility.isVisible(t.id))
  return visible.length ? visible : themes.active
})

const { slots, activateLine, onInput, onEnter, onBlur, revert, dropTaskAt } = useAutosaveLines({
  savedList: () => tasks.forCell(props.dateISO, props.daypart).filter(t => visibility.isVisible(t.themeId)),
  defaultThemeId: () => pickerThemes.value[0]?.id ?? themes.items[0]?.id ?? null,
  scheduledOn: () => props.dateISO,
  daypart: () => props.daypart,
})

const activeKey = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)

function colorFor(themeId: string): string {
  return themes.items.find(t => t.id === themeId)?.color ?? 'var(--ink-faint)'
}

function focusDraft(index: number): void {
  const el = root.value?.querySelector<HTMLInputElement>(`[data-line-index="${index}"]`)
  el?.focus()
}

/** Click an empty line: arm it AND focus it in the same gesture — activateLine() alone only
 *  creates the reactive draft, it doesn't pull DOM focus onto the input that then renders. */
async function onClickEmpty(index: number) {
  activateLine(index)
  await nextTick()
  focusDraft(index)
}

async function handleEnter(draft: DraftLine) {
  await onEnter(draft)
  await nextTick()
  focusDraft(draft.lineIndex + 1)
}

function onDropAt(e: DragEvent, index: number) {
  dragOverIndex.value = null
  const id = taskIdFromDrag(e)
  if (!id) return
  dropTaskAt(id, index)
}
</script>

<template>
  <div ref="root" class="day-section">
    <span class="section-watermark font-hand" aria-hidden="true">{{ label }}</span>

    <div class="relative z-[1]">
      <div
        v-for="slot in slots"
        :key="slot.index"
        class="ruled-line"
        :class="[
          dragOverIndex === slot.index ? 'day-section--over' : '',
          slot.kind === 'empty' ? 'cursor-text' : '',
        ]"
        @dragover.prevent
        @dragenter="dragOverIndex = slot.index"
        @dragleave="(e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node | null)) dragOverIndex = null }"
        @drop.prevent="onDropAt($event, slot.index)"
        @click="slot.kind === 'empty' ? onClickEmpty(slot.index) : undefined"
      >
        <TaskChip v-if="slot.kind === 'task'" :task="slot.task" :color="colorFor(slot.task.themeId)" dense />

        <div v-else-if="slot.kind === 'draft'" class="flex w-full items-end gap-1.5" @click.stop>
          <div v-if="activeKey === slot.draft.key || slot.draft.text" class="mb-[3px] flex shrink-0 items-center gap-1">
            <button
              v-for="th in pickerThemes"
              :key="th.id"
              type="button"
              class="h-3 w-3 shrink-0 rounded-full border-2 transition-transform"
              :style="{ background: th.color, borderColor: slot.draft.themeId === th.id ? 'var(--ink)' : 'transparent' }"
              :aria-label="`Assign to ${th.name}`"
              :aria-pressed="slot.draft.themeId === th.id"
              @mousedown.prevent
              @click="slot.draft.themeId = th.id"
            />
          </div>
          <input
            :data-line-index="slot.index"
            type="text"
            :value="slot.draft.text"
            placeholder="Write here…"
            class="diary-input font-write min-w-0 flex-1 text-[16px] leading-[20px] text-[var(--ink)]"
            @input="slot.draft.text = ($event.target as HTMLInputElement).value; onInput(slot.draft)"
            @focus="activeKey = slot.draft.key"
            @keydown.enter.prevent="handleEnter(slot.draft)"
            @keydown.esc="revert(slot.draft); ($event.target as HTMLInputElement).blur()"
            @blur="activeKey = null; onBlur(slot.draft)"
          >
        </div>
      </div>
    </div>
  </div>
</template>
