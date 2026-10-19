/**
 * Boot-time config assessment, adapted from co-sy-v2's `boot-config.ts`. Refuses to start
 * (naming every missing key at once) rather than let a missing/blank required key surface
 * later as an opaque upstream error. Values are NEVER logged — key NAMES only.
 */

/** Keys the app cannot serve anyone without, in any environment — named all at once,
 *  before Nest's DI error wall. */
export const REQUIRED_KEYS = [
  'DATABASE_URL',
  // Co-Sy satellite settings (core/security/satellite-auth.config.ts), as Co-Sy's
  // satellite:register prints them. None of them is a secret.
  'COSY_ISSUER',
  'COSY_API_URL',
  'SATELLITE_PROJECT_ID',
  'SATELLITE_CLIENT_IDS',
  'SATELLITE_OWNER_ORG',
] as const;

/** Keys with a safe localhost default in development that MUST be explicit in production. */
export const PROD_REQUIRED_KEYS = ['FRONT_BASE_URL'] as const;

export interface BootAssessment {
  /** Required keys that are unset or blank — non-empty means REFUSE TO START. */
  missing: string[];
}

const isBlank = (v: string | undefined): boolean => !v || v.trim() === '';

export function assessBootConfig(
  env: Record<string, string | undefined>,
  nodeEnv: string | undefined,
): BootAssessment {
  const production = nodeEnv === 'production';
  const missing: string[] = REQUIRED_KEYS.filter((k) => isBlank(env[k]));
  if (production) {
    missing.push(...PROD_REQUIRED_KEYS.filter((k) => isBlank(env[k])));
  }
  return { missing };
}

export function formatMissingConfig(missing: string[]): string {
  return [
    'REFUSING TO START — required configuration is missing or blank:',
    ...missing.map((k) => `  - ${k}`),
    'Set these in back/.env (see back/.env.example for what each one is), then restart.',
    'Values are never printed here, only the key names.',
  ].join('\n');
}
