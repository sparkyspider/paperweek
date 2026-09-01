<script setup lang="ts">
/** A soft watercolor-blob swatch: two translucent, slightly offset irregular blob layers in
 *  the theme color, rather than a flat circle. Purely decorative — `aria-hidden`. */
const props = withDefaults(defineProps<{ color: string; size?: number }>(), { size: 22 })

// A fixed hand-picked irregular blob path (viewBox 0 0 100 100) — varying it per-instance
// isn't worth the complexity; the two offset/rotated layers already keep it from reading flat.
const blobPath =
  'M50 8c14 0 22 10 30 20s16 20 8 33-24 20-38 21-30-6-36-20S6 32 16 20 36 8 50 8z'
</script>

<template>
  <svg
    :width="props.size"
    :height="props.size"
    viewBox="0 0 100 100"
    aria-hidden="true"
    class="shrink-0"
  >
    <path :d="blobPath" :fill="props.color" opacity="0.55" transform="rotate(8 50 50) scale(0.94)" transform-origin="50 50" />
    <path :d="blobPath" :fill="props.color" opacity="0.65" transform="rotate(-14 50 50) scale(0.82)" transform-origin="50 50" />
  </svg>
</template>
