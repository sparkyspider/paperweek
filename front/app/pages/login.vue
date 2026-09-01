<script setup lang="ts">
/** The front door — a charming art-paper email + password form. Auth is the BFF's
 *  password flow (co-sy-v2's pattern; Zitadel's hosted Login V2 UI isn't deployed on the
 *  shared instance, so there is no OIDC redirect leg here). If someone's already signed in
 *  (a live refresh cookie), skip straight through to the planner. */
definePageMeta({ title: 'Sign in' })

import { ref, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'

const auth = useAuthStore()

const email = ref('')
const password = ref('')

onMounted(async () => {
  if (await auth.hydrate()) await navigateTo('/', { replace: true })
})

async function submit() {
  if (!email.value.trim() || !password.value) return
  const ok = await auth.login(email.value.trim(), password.value)
  if (ok) await navigateTo('/', { replace: true })
}
</script>

<template>
  <div class="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--paper)] p-6">
    <!-- Decorative watercolor wash, purely ambient. -->
    <svg class="pointer-events-none absolute -left-24 -top-24 opacity-70" width="360" height="360" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 8c14 0 22 10 30 20s16 20 8 33-24 20-38 21-30-6-36-20S6 32 16 20 36 8 50 8z" fill="var(--wc-sky)" opacity="0.35" />
    </svg>
    <svg class="pointer-events-none absolute -bottom-28 -right-16 opacity-70" width="320" height="320" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 8c14 0 22 10 30 20s16 20 8 33-24 20-38 21-30-6-36-20S6 32 16 20 36 8 50 8z" fill="var(--wc-ochre)" opacity="0.3" transform="rotate(25 50 50)" />
    </svg>

    <div class="paper-card--floating font-ui relative z-10 flex w-full max-w-sm flex-col items-center gap-6 px-8 py-10 text-center">
      <div class="flex flex-col items-center gap-1">
        <h1 class="font-hand text-[44px] font-bold leading-none text-[var(--ink)]">Paperweek</h1>
        <p class="gouache-underline font-hand inline-block w-fit text-lg text-[var(--ink-soft)]">
          your week, one gentle page at a time
        </p>
      </div>

      <WatercolorBlob color="#8fc1e3" :size="56" />

      <form class="flex w-full flex-col gap-4 text-left" @submit.prevent="submit">
        <label class="flex flex-col gap-0.5">
          <span class="font-hand px-1 text-xl font-bold text-[var(--ink-soft)]">Email</span>
          <input
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="font-ui w-full rounded-none border-0 border-b-2 border-b-[rgba(120,84,40,0.32)] bg-transparent px-1 py-2 text-sm text-[var(--ink)] outline-none transition-colors duration-150 focus:border-b-[3px] focus:border-b-[var(--accent-ink)]"
          >
        </label>
        <label class="flex flex-col gap-0.5">
          <span class="font-hand px-1 text-xl font-bold text-[var(--ink-soft)]">Password</span>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="font-ui w-full rounded-none border-0 border-b-2 border-b-[rgba(120,84,40,0.32)] bg-transparent px-1 py-2 text-sm text-[var(--ink)] outline-none transition-colors duration-150 focus:border-b-[3px] focus:border-b-[var(--accent-ink)]"
          >
        </label>

        <button
          type="submit"
          class="font-hand mt-1 w-full rounded-none bg-[#b5382e] px-5 py-3 text-xl font-bold text-[var(--paper-raised)] shadow-[0_2px_8px_rgba(155,47,38,0.25)] transition-all duration-150 hover:-translate-y-0.5 hover:bg-[#9c2f26] hover:shadow-[0_6px_16px_rgba(155,47,38,0.3)] disabled:translate-y-0 disabled:opacity-60 disabled:shadow-none disabled:hover:translate-y-0"
          :disabled="auth.pending"
        >
          {{ auth.pending ? 'Opening the door…' : 'Sign in' }}
        </button>

        <p v-if="auth.error" class="text-center text-sm" :class="auth.unreachable ? 'text-[var(--ink-soft)]' : 'text-[var(--danger)]'">
          {{ auth.error }}
        </p>
      </form>
    </div>
  </div>
</template>
