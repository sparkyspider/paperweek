/**
 * The canonical response envelope. Every backend response — success and error alike —
 * is this shape, applied globally (response interceptor + exception filter).
 */

export interface EnvelopeMeta {
  status: 'ok' | 'error';
  code: number;
  requestId: string;
  messages?: string[];
}

/** One field-level validation failure. `field` is the JSON key as submitted. */
export interface FieldError {
  field: string;
  message: string;
  code?: string;
}

/** The error half of the envelope. Everything here is safe to show a user. */
export interface EnvelopeError {
  code: string;
  message: string;
  fields?: FieldError[];
}

export interface Envelope<T> {
  data: T | null;
  meta: EnvelopeMeta;
  error: EnvelopeError | null;
}
