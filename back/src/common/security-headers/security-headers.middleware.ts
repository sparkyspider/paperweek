/**
 * Protective response headers, sent on every response. Adapted from co-sy-v2's
 * security-headers middleware: anti-framing (X-Frame-Options + CSP frame-ancestors),
 * MIME-sniff lockdown, referrer clamp, locked-down Permissions-Policy, and HSTS in
 * production only (a cached HSTS pin on localhost would break other local projects).
 */
import type { NextFunction, Request, Response } from 'express';
import { isDevelopmentRun } from '../throttler/throttler.config';

export function buildSecurityHeaders(
  nodeEnv = process.env.NODE_ENV,
): Readonly<Record<string, string>> {
  const base: Record<string, string> = {
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };

  if (!isDevelopmentRun(nodeEnv)) {
    base['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
  }

  return Object.freeze(base);
}

const SECURITY_HEADERS = buildSecurityHeaders();

export function securityHeadersMiddleware(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    res.setHeader(name, value);
  }
  next();
}
