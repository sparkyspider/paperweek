<script setup lang="ts">
import { useToast } from '~/composables/useToast'

const { toasts, dismiss } = useToast()

function act(t: { id: number; onAction?: () => void }) {
  t.onAction?.()
  dismiss(t.id)
}
</script>

<template>
  <div class="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4">
    <TransitionGroup name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="pointer-events-auto flex items-center gap-3 rounded-none bg-[var(--ink)] px-4 py-2.5 text-sm text-[var(--paper)] shadow-lg"
      >
        <span>{{ t.message }}</span>
        <button
          v-if="t.actionLabel"
          type="button"
          class="font-semibold text-[var(--wc-ochre)] underline decoration-dotted underline-offset-2 hover:text-white"
          @click="act(t)"
        >
          {{ t.actionLabel }}
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
