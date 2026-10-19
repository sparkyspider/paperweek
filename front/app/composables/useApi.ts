/**
 * `useApi` — the one client for the backend's `{ data, meta, error }` envelope, adapted from
 * co-sy-v2's `app/composables/useApi.ts`. Every `/api/*` call goes through here:
 *   • attaches the person's Co-Sy satellite token, from `@co-sy/satellite-auth`
 *     (`getFreshToken()` renews it first when it is about to expire);
 *   • sends no cookies: Paperweek's back end holds no session of its own;
 *   • on a 401 from a call that carried a token, asks the module for a fresh token once
 *     (`getFreshToken(refused)`, the same settle-aware re-mint Co-Sy's own calls share) and
 *     replays exactly once. If the replay is refused too, the person is sent to sign in —
 *     never a loop.
 *
 * Two doors, same as co-sy: `api<T>()` returns the payload or throws `ApiError`; `request<T>()`
 * returns the full result and never throws.
 */
import { getFreshToken, useCosySatelliteAuth } from '#imports'
import type { ApiEnvelope, ApiEnvelopeMeta, ApiError as ApiErrorType } from '~/composables/apiEnvelope'
import { toApiError, messageOf, isUnreachable, codeOf } from '~/composables/apiEnvelope'

export interface ApiRequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
  headers?: Record<string, string>
  fallback?: string
  unreachableMessage?: string
  retryOnExpiry?: boolean
}

export interface ApiResult<T> {
  ok: boolean
  status: number
  data: T | null
  meta: ApiEnvelopeMeta | null
  error: ApiErrorType | null
  request: { method: string; path: string }
}

/** The back end's origin. Override with NUXT_PUBLIC_BACKEND_BASE. */
export function backendBase(): string {
  return (useRuntimeConfig().public.backendBase as string) || 'http://localhost:3201'
}

export function useApi() {
  // Captured while a Nuxt context exists: `request` reads them after an await.
  const satellite = useCosySatelliteAuth()
  const router = useRouter()

  /** `Authorization` for a hand-made `fetch` (the keepalive flushes at page hide), read
   *  synchronously from the current session, or none when signed out. */
  function authHeaders(): Record<string, string> {
    const token = satellite.session.value?.accessToken
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  async function attempt<T>(path: string, opts: ApiRequestOptions, token: string | null): Promise<ApiResult<T>> {
    const method = (opts.method ?? 'GET').toUpperCase()
    const where = { method, path }
    const headers: Record<string, string> = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    }
    try {
      const res = await $fetch.raw<ApiEnvelope<T>>(`${backendBase()}${path}`, {
        method: method as 'GET',
        headers,
        ...(opts.body !== undefined ? { body: opts.body as Record<string, unknown> } : {}),
        ...(opts.query ? { query: opts.query } : {}),
      })
      const env = res._data
      return { ok: true, status: res.status, data: (env?.data ?? null) as T, meta: env?.meta ?? null, error: null, request: where }
    } catch (cause) {
      const error = toApiError(cause, { method, path, fallback: opts.fallback, unreachableMessage: opts.unreachableMessage })
      return { ok: false, status: error.status, data: null, meta: error.meta, error, request: where }
    }
  }

  /** A call with the one refused-token replay. Never throws. */
  async function request<T>(path: string, opts: ApiRequestOptions = {}): Promise<ApiResult<T>> {
    const tokenUsed = await getFreshToken()
    const first = await attempt<T>(path, opts, tokenUsed)
    if (first.ok || first.status !== 401 || !tokenUsed || opts.retryOnExpiry === false) return first
    const fresh = await getFreshToken(tokenUsed)
    if (!fresh) return first
    const replay = await attempt<T>(path, opts, fresh)
    if (replay.status === 401 && import.meta.client) void satellite.login(router.currentRoute.value.fullPath)
    return replay
  }

  async function api<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    const r = await request<T>(path, opts)
    if (!r.ok && r.error) throw r.error
    return r.data as T
  }

  return { api, request, authHeaders, messageOf, isUnreachable, codeOf }
}
