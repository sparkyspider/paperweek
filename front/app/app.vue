<script setup lang="ts">
// Single root: no layouts needed for a two-page app (login + planner).

/** Cmd+Z / Ctrl+Z, app-wide (D-front-038) — ONE listener here rather than one per component, so
 *  it works regardless of what's focused. Never intercepts inside an input/textarea/
 *  contenteditable (`isEditableTarget`) — native text undo must keep working while editing a
 *  task or theme name. Cmd+Shift+Z/redo is out of scope (`isUndoShortcut` excludes it). */
import { onMounted, onBeforeUnmount } from 'vue'
import { isUndoShortcut, isEditableTarget } from '~/utils/textInputKeys'
import { useUndo } from '~/composables/useUndo'

function onUndoKeydown(e: KeyboardEvent): void {
  if (!isUndoShortcut(e)) return
  if (isEditableTarget(e.target)) return
  e.preventDefault()
  void useUndo().undoLast()
}

onMounted(() => document.addEventListener('keydown', onUndoKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onUndoKeydown))
</script>

<template>
  <div>
    <NuxtPage />
    <ToastHost />
  </div>
</template>
