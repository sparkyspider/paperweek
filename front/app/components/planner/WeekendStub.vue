<script setup lang="ts">
/** The collapsed Sat+Sun stub at the end of a week row — a slim paper tab. Click (or the
 *  drag-scheduling of a task, once it's the app's job to detect that — kept simple here as a
 *  plain click target) expands into the two full day columns for that week. */
defineProps<{ satLabel: string; sunLabel: string }>()
const emit = defineEmits<{ expand: [] }>()
</script>

<template>
  <button
    type="button"
    class="paper-card flex min-w-[46px] shrink-0 flex-col items-center justify-center gap-2 self-stretch px-1.5 py-3 text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper-sunken)]"
    :aria-label="`Expand ${satLabel} and ${sunLabel}`"
    @click="emit('expand')"
  >
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" class="shrink-0">
      <path d="M6 3l5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span class="font-hand [writing-mode:vertical-rl] text-lg font-semibold leading-none tracking-wide">
      {{ satLabel }} · {{ sunLabel }}
    </span>
  </button>
</template>
