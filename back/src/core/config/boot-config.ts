/**
 * Boot-time config assessment, adapted from co-sy-v2's `boot-config.ts`. Refuses to start
 * (naming every missing key at once) rather than let a missing/blank required key surface
 * later as an opaque upstream error. Values are NEVER logged — key NAMES only.
 */

/** Keys the app cannot serve anyone without, in any environment. Mirrors
 *  `ZitadelService.onModuleInit` — listed here too so the operator gets ALL of them at once,
 *  before Nest's DI error wall. */
export const REQUIRED_KEYS = [
  'DATABASE_URL',
  'ZITADEL_ISSUER',
  'ZITADEL_ORG_ID',
  'ZITADEL_PROJECT_ID',
  'ZITADEL_BACK_PAT',
  'ZITADEL_OIDC_CLIENT_ID',
  'OIDC_REDIRECT_URI',
] as const;
// ZITADEL_MGMT_PAT is deliberately NOT here: it is used only by auth/bootstrap-productivity.sh
// and auth/add-user.sh (org/user provisioning), never read by the running app at runtime
// (ZitadelService only holds ZITADEL_BACK_PAT, the least-privilege login-broker credential).

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
