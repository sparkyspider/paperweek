import type { ConfigService } from '@nestjs/config';

/** Dev-only default for FRONT_BASE_URL — boot-config requires it explicitly in production. */
export const FRONT_BASE_URL_DEV_DEFAULT = 'http://localhost:3200';

/** The one place FRONT_BASE_URL is read with its dev fallback (CORS origin, CSRF check,
 *  and any outbound links the BFF composes). */
export function frontBaseUrl(config: Pick<ConfigService, 'get'>): string {
  return config.get<string>('FRONT_BASE_URL') ?? FRONT_BASE_URL_DEV_DEFAULT;
}
