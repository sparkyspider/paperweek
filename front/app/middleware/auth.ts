/**
 * Route guard for the planner (`/`). Adapted from co-sy-v2's `middleware/auth.ts` with every
 * org-switching / role / invitation concern removed — single-org, single page, so there is
 * nothing to branch on beyond "is anyone signed in".
 *
 * Runs client-only: the JWT lives in memory, so SSR has nothing to check. `routeRules` in
 * nuxt.config.ts already renders `/` with `ssr: false` for the same reason.
 */
import { useAuthStore } from '~/stores/auth'

export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return

  const auth = useAuthStore()
  await auth.hydrate()

  if (!auth.isAuthenticated) {
    return navigateTo('/login')
  }
})
