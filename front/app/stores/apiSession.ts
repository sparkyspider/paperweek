/**
 * The credential kernel — adapted from co-sy-v2's `stores/apiSession.ts`. Holds the
 * short-lived access JWT IN MEMORY ONLY (never localStorage) and owns the one single-flight
 * refresh against the BFF's httpOnly refresh cookie. A Pinia store rather than a module-level
 * ref for the same reason co-sy uses one: SSR gives one instance per request, so a
 * module-level variable can never leak between concurrent server renders.
 *
 * This app has no acting-org concept (single-org, unlike co-sy's multi-tenant front) — that
 * whole slice of co-sy's version is deliberately not here.
 */
import { ref } from 'vue'
import { defineStore } from 'pinia'
import { ApiError, toApiError } from '~/composables/apiEnvelope'

export type RefreshResult =
  | { ok: true; accessToken: string }
  | { ok: false; cause: ApiError }

export const useApiSession = defineStore('apiSession', () => {
  const accessToken = ref<string | null>(null)
  const lastRequestId = ref<string | null>(null)
  const refreshCount = ref(0)

  const base = (): string =>
    (useRuntimeConfig().public.backendBase as string) || 'http://localhost:3201'

  function setAccessToken(token: string | null): void {
    accessToken.value = token
  }

  function noteRequestId(id: string | null | undefined): void {
    if (id) lastRequestId.value = id
  }

  /** The one refresh in flight, shared by every caller that asks while it is running. */
  let inflight: Promise<RefreshResult> | null = null

  /** Re-mint the access token from the httpOnly refresh cookie. Single-flight: concurrent
   *  callers share the same promise so the cookie rotates exactly once. Deliberately a raw
   *  `$fetch`, not `useApi()` — this IS the call `useApi` makes when it needs a token. */
  async function refresh(): Promise<RefreshResult> {
    if (!import.meta.client) {
      return {
        ok: false,
        cause: new ApiError({
          status: 0, envelope: null, meta: null, method: 'POST', path: '/auth/refresh',
          unreachableMessage: 'There is no session to refresh on the server side.',
        }),
      }
    }
    if (inflight) return inflight
    const attempt = (async (): Promise<RefreshResult> => {
      try {
        const r = await $fetch<{ data: { accessToken: string }; meta?: { requestId?: string } }>(
          `${base()}/auth/refresh`,
          { method: 'POST', credentials: 'include' },
        )
        noteRequestId(r.meta?.requestId)
        setAccessToken(r.data.accessToken)
        refreshCount.value += 1
        return { ok: true, accessToken: r.data.accessToken }
      } catch (cause) {
        const err = toApiError(cause, { method: 'POST', path: '/auth/refresh' })
        noteRequestId(err.requestId)
        return { ok: false, cause: err }
      }
    })()
    inflight = attempt
    void attempt.finally(() => {
      if (inflight === attempt) inflight = null
    })
    return attempt
  }

  return { accessToken, lastRequestId, refreshCount, base, setAccessToken, noteRequestId, refresh }
})
