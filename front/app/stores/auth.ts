/**
 * Auth store — a deliberately small cousin of co-sy-v2's `stores/auth.ts`. Same shape of idea
 * (JWT in memory via `apiSession`, silent hydrate from an httpOnly refresh cookie, the BFF
 * owns the actual identity provider so the front never talks to it directly) with everything
 * org/invitation/MFA shaped stripped out — this app is single-org, single identity.
 *
 * The real BFF surface (co-sy-v2's password-BFF pattern — Zitadel's Login V2 hosted UI isn't
 * deployed on the shared instance, so there is no OIDC redirect leg here):
 *   POST /auth/login    {email, password} -> { accessToken }   sets the httpOnly refresh cookie
 *   POST /auth/refresh                    -> { accessToken }   rotate the refresh cookie
 *   GET  /auth/me                          -> { id, name?, email? }  best-effort richer profile
 *   POST /auth/logout                      -> {}               clear the refresh cookie
 * If the backend's real routes differ, only this file and apiSession.ts need to change.
 */
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { useApi } from '~/composables/useApi'
import { useApiSession } from '~/stores/apiSession'

export interface AuthUser {
  id: string
  name: string
  email: string
}

export const useAuthStore = defineStore('auth', () => {
  const session = useApiSession()
  const { api, messageOf, isUnreachable } = useApi()

  const user = ref<AuthUser | null>(null)
  const isAuthenticated = computed(() => user.value !== null)
  const pending = ref(false)
  const error = ref<string | null>(null)
  const unreachable = ref(false)

  function decodeJwt(token: string): Record<string, unknown> | null {
    try {
      const payload = token.split('.')[1]
      if (!payload) return null
      return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    } catch {
      return null
    }
  }

  /** Store the token, then hydrate identity — richer `/auth/me` first, JWT claims as the
   *  fallback so a session still "works" even before that endpoint exists. The header must
   *  never show a literal "You": prefer a real display name, then the email, then a neutral
   *  "Signed in" — never a placeholder pronoun. */
  async function applyAccessToken(token: string): Promise<void> {
    session.setAccessToken(token)
    const claims = decodeJwt(token)
    try {
      const me = await api<{ sub: string; email?: string; displayName?: string }>('/auth/me')
      user.value = { id: me.sub, name: me.displayName || me.email || 'Signed in', email: me.email ?? '' }
    } catch {
      const sub = (claims?.sub as string) ?? 'you'
      const email = (claims?.email as string) ?? ''
      const name = (claims?.name as string) || email || 'Signed in'
      user.value = { id: sub, name, email }
    }
  }

  function clearSession(): void {
    session.setAccessToken(null)
    user.value = null
  }

  /** Silent hydrate: refresh cookie -> access JWT -> identity. Idempotent; the middleware
   *  awaits it before deciding whether to bounce to /login. */
  async function hydrate(): Promise<boolean> {
    if (!import.meta.client) return false
    if (user.value) return true
    const r = await session.refresh()
    if (!r.ok) { clearSession(); return false }
    try {
      await applyAccessToken(r.accessToken)
      return true
    } catch {
      clearSession()
      return false
    }
  }

  /** Email + password sign-in against the BFF. A 401 (bad credentials) is shown as a plain
   *  friendly sentence — no lockout-counter UI, the backend owns any rate-limiting. */
  async function login(email: string, password: string): Promise<boolean> {
    error.value = null; unreachable.value = false; pending.value = true
    try {
      const r = await api<{ accessToken: string }>('/auth/login', {
        method: 'POST', body: { email, password }, auth: false,
      })
      await applyAccessToken(r.accessToken)
      return true
    } catch (e) {
      unreachable.value = isUnreachable(e)
      error.value = messageOf(e, 'That email and password didn’t match — try again.')
      return false
    } finally {
      pending.value = false
    }
  }

  async function logout(): Promise<void> {
    try { await api('/auth/logout', { method: 'POST' }) } catch { /* best-effort */ }
    clearSession()
  }

  return {
    user, isAuthenticated, pending, error, unreachable,
    hydrate, login, logout,
  }
})
