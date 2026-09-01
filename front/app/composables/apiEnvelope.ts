/**
 * The response envelope, adapted from co-sy-v2's front (`app/composables/apiEnvelope.ts`) —
 * every backend response is `{ data, meta, error }`, and this is the one place that turns a
 * failed call into a sentence a screen can render. Trimmed of co-sy's org/invitation-specific
 * codes; the shape and the three-failure-classes idea are unchanged.
 */

export interface ApiFieldError {
  field: string
  message: string
  code?: string
}

export interface ApiEnvelopeMeta {
  status: 'ok' | 'error'
  code: number
  requestId?: string
  messages?: string[]
}

export interface ApiEnvelopeError {
  code: string
  message: string
  fields?: ApiFieldError[]
}

export interface ApiEnvelope<T> {
  data: T | null
  meta?: ApiEnvelopeMeta
  error?: ApiEnvelopeError | null
}

export const GENERIC_FAILURE = 'Something went wrong — please try again.'

/** The service answered nothing at all — different from a refusal, and shown differently. */
export const SERVICE_UNREACHABLE =
  "We can't reach the server right now — check your connection, or try again in a moment."

export class ApiError extends Error {
  readonly status: number
  readonly code: string | null
  readonly fields: ApiFieldError[]
  readonly requestId: string | null
  /** No envelope came back — this was not our backend answering. */
  readonly unreachable: boolean
  readonly envelope: ApiEnvelopeError | null
  readonly meta: ApiEnvelopeMeta | null
  readonly method: string
  readonly path: string
  private readonly unreachableMessage: string
  private readonly defaultFallback: string

  constructor(init: {
    status: number
    envelope: ApiEnvelopeError | null
    meta: ApiEnvelopeMeta | null
    method: string
    path: string
    fallback?: string
    unreachableMessage?: string
    cause?: unknown
  }) {
    super('')
    this.name = 'ApiError'
    this.status = init.status
    this.envelope = init.envelope
    this.meta = init.meta
    this.code = init.envelope?.code ?? null
    this.fields = init.envelope?.fields ?? []
    this.requestId = init.meta?.requestId ?? null
    this.unreachable = !init.envelope
    this.method = init.method
    this.path = init.path
    this.defaultFallback = init.fallback ?? GENERIC_FAILURE
    this.unreachableMessage = init.unreachableMessage ?? SERVICE_UNREACHABLE
    this.cause = init.cause
    this.message = this.resolve()
  }

  resolve(fallback?: string): string {
    if (this.unreachable) return this.unreachableMessage
    return (
      this.envelope?.fields?.[0]?.message
      || this.envelope?.message
      || fallback
      || this.defaultFallback
    )
  }
}

export function toApiError(
  cause: unknown,
  where: { method: string; path: string; fallback?: string; unreachableMessage?: string },
): ApiError {
  const raw = cause as {
    status?: number
    response?: { status?: number }
    data?: ApiEnvelope<unknown>
  }
  return new ApiError({
    status: raw?.status ?? raw?.response?.status ?? 0,
    envelope: raw?.data?.error ?? null,
    meta: raw?.data?.meta ?? null,
    method: where.method,
    path: where.path,
    fallback: where.fallback,
    unreachableMessage: where.unreachableMessage,
    cause,
  })
}

export function messageOf(e: unknown, fallback?: string): string {
  if (e instanceof ApiError) return e.resolve(fallback)
  return fallback ?? GENERIC_FAILURE
}

export function isUnreachable(e: unknown): boolean {
  return e instanceof ApiError ? e.unreachable : true
}

export function codeOf(e: unknown): string | null {
  return e instanceof ApiError ? e.code : null
}
