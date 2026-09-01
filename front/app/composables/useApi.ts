/**
 * `useApi` — the one client for the backend's `{ data, meta, error }` envelope, adapted from
 * co-sy-v2's `app/composables/useApi.ts`. Every `/api/*` and `/auth/*` call goes through here:
 *   • attaches the bearer token (when we have one) — every `/api/*` call needs one;
 *   • always sends the browser's cookies (`credentials: 'include'`) — the BFF's refresh cookie
 *     and any OIDC state cookie ride on it, so this must be true even for pre-auth calls;
 *   • on a 401 from a call that carried a token, refreshes once (via the session kernel's
 *     single-flight `refresh()`) and replays exactly once — never loops.
 *
 * Two doors, same as co-sy: `api<T>()` returns the payload or throws `ApiError`; `request<T>()`
 * returns the full result and never throws (useful when the caller wants to render an
 * unreachable-vs-refused distinction without a try/catch).
 */
import { useApiSession } from '~/stores/apiSession'
import type { ApiEnvelope, ApiEnvelopeMeta, ApiError as ApiErrorType } from '~/composables/apiEnvelope'
import { toApiError, messageOf, isUnreachable, codeOf } from '~/composables/apiEnvelope'

export interface ApiRequestOptions {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
  headers?: Record<string, string>
  /** `false` — do not attach the bearer token (cookies are still sent). Used by the
   *  pre-session `/auth/login` call. */
  auth?: boolean
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

export function useApi() {
  const session = useApiSession()

  async function attempt<T>(path: string, opts: ApiRequestOptions): Promise<ApiResult<T>> {
    const method = (opts.method ?? 'GET').toUpperCase()
    const where = { method, path }
    const attachToken = opts.auth !== false && !!session.accessToken
    const headers: Record<string, string> = {
      ...(attachToken ? { Authorization: `Bearer ${session.accessToken}` } : {}),
      ...(opts.headers ?? {}),
    }
    try {
      const res = await $fetch.raw<ApiEnvelope<T>>(`${session.base()}${path}`, {
        method: method as 'GET',
        credentials: 'include',
        headers,
        ...(opts.body !== undefined ? { body: opts.body as Record<string, unknown> } : {}),
        ...(opts.query ? { query: opts.query } : {}),
      })
      const env = res._data
      const meta = env?.meta ?? null
      session.noteRequestId(meta?.requestId)
      return { ok: true, status: res.status, data: (env?.data ?? null) as T, meta, error: null, request: where }
    } catch (cause) {
      const error = toApiError(cause, { method, path, fallback: opts.fallback, unreachableMessage: opts.unreachableMessage })
      session.noteRequestId(error.requestId)
      return { ok: false, status: error.status, data: null, meta: error.meta, error, request: where }
    }
  }

  /** A call with the expired-token replay. Never throws. */
  async function request<T>(path: string, opts: ApiRequestOptions = {}): Promise<ApiResult<T>> {
    const tokenUsed = opts.auth !== false ? session.accessToken : null
    const first = await attempt<T>(path, opts)
    if (first.ok || first.status !== 401) return first

    const mayReplay = opts.retryOnExpiry ?? (!!tokenUsed && !path.startsWith('/auth/refresh'))
    if (!mayReplay) return first

    const replay: ApiRequestOptions = { ...opts, retryOnExpiry: false }
    if (session.accessToken && session.accessToken !== tokenUsed) return attempt<T>(path, replay)

    const refreshed = await session.refresh()
    if (!refreshed.ok) return first
    return attempt<T>(path, replay)
  }

  async function api<T>(path: string, opts: ApiRequestOptions = {}): Promise<T> {
    const r = await request<T>(path, opts)
    if (!r.ok && r.error) throw r.error
    return r.data as T
  }

  return { api, request, messageOf, isUnreachable, codeOf, session }
}
