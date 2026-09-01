/**
 * Rate-limit configuration — a single global throttle keyed by caller (authenticated
 * subject, else client IP), plus a per-address ceiling so a forged subject can't buy an
 * unlimited number of empty buckets.
 */
import type { ThrottlerOptions } from '@nestjs/throttler';

export const THROTTLE_TTL_MS = 60_000;
export const SUBJECT_LIMIT = 120;
export const IP_CEILING = 300;

export function clientIp(req: Record<string, unknown>): string {
  return typeof req.ip === 'string' ? req.ip : 'unknown';
}

/** The `sub` claim of the bearer token, WITHOUT verifying the signature — used only to key
 *  the rate-limit bucket; the `ip` ceiling below is what makes a forged value harmless. */
export function bearerSubject(req: Record<string, unknown>): string | undefined {
  const headers = req.headers as Record<string, unknown> | undefined;
  const raw = headers?.authorization;
  if (typeof raw !== 'string') return undefined;
  const match = /^Bearer\s+([\w-]+)\.([\w-]+)\.([\w-]+)$/.exec(raw.trim());
  if (!match?.[2]) return undefined;
  try {
    const json = Buffer.from(match[2], 'base64url').toString('utf8');
    const sub = (JSON.parse(json) as { sub?: unknown }).sub;
    if (typeof sub !== 'string' || !sub || sub.length > 64) return undefined;
    return sub;
  } catch {
    return undefined;
  }
}

export function isDevelopmentRun(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== 'production';
}

/** Express `trust proxy` — no proxy locally, so never trust X-Forwarded-For in dev. */
export function trustProxyHops(nodeEnv = process.env.NODE_ENV): number | false {
  return isDevelopmentRun(nodeEnv) ? false : 1;
}

export const THROTTLERS: ThrottlerOptions[] = [
  { name: 'default', ttl: THROTTLE_TTL_MS, limit: SUBJECT_LIMIT },
  {
    name: 'ip',
    ttl: THROTTLE_TTL_MS,
    limit: IP_CEILING,
    getTracker: (req: Record<string, unknown>) =>
      Promise.resolve(`ip:${clientIp(req)}`),
  },
];
