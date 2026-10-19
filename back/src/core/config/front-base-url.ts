import type { ConfigService } from '@nestjs/config';

/** Dev-only default for FRONT_BASE_URL — boot-config requires it explicitly in production. */
export const FRONT_BASE_URL_DEV_DEFAULT = 'http://localhost:3200';

/** Dev-only second origin: the "sexy" design worktree runs its own front on 3202 (against this
 *  same backend on 3201) alongside the v2 checkout's 3200 — both need to pass CORS/CSRF while
 *  that branch is being built out. Never added in production (see frontBaseUrls below). */
export const FRONT_BASE_URL_DEV_EXTRA = 'http://localhost:3202';

/** The one place FRONT_BASE_URL is read with its dev fallback (CORS origin, CSRF check,
 *  and any outbound links the BFF composes). */
export function frontBaseUrl(config: Pick<ConfigService, 'get'>): string {
  return config.get<string>('FRONT_BASE_URL') ?? FRONT_BASE_URL_DEV_DEFAULT;
}

/** Every origin allowed to talk to this API — the configured FRONT_BASE_URL plus, outside
 *  production, the design-worktree's 3202. Used by CORS and the satellite guard so both stay in
 *  sync on what "same origin" means. */
export function frontBaseUrls(config: Pick<ConfigService, 'get'>): string[] {
  const primary = frontBaseUrl(config);
  const env = config.get<string>('NODE_ENV');
  if (env === 'production') return [primary];
  return Array.from(new Set([primary, FRONT_BASE_URL_DEV_EXTRA]));
}
