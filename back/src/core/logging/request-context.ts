/**
 * Per-request context carried through async calls via AsyncLocalStorage. Holds the
 * `requestId` minted once per HTTP request (request-id.middleware.ts) so any log line —
 * however deep in the call tree — can be joined to the client's response envelope
 * (`meta.requestId`). Adapted from co-sy-v2 (trimmed: no `actorSub`/test-mode machinery —
 * this app has no RLS org-context to bind).
 */
import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestStore {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestStore>();
