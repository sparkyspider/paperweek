/**
 * Paperweek as a Co-Sy satellite (co-sy-v2 task 084, stories 14 and 15): the settings the
 * `@co-sy/satellite-guard` verifier needs, read from configuration and nowhere else.
 *
 * People sign in on Co-Sy's page with their Co-Sy account. Their token reaches this API as
 * `Authorization: Bearer <token>`. The guard believes it only when Co-Sy's published keys signed
 * it, the issuer and Paperweek's project id (audience) match, Paperweek's own sign-in app minted
 * it, it is in date, and Co-Sy has not marked it stale. Access is decided ONLY from the roles in
 * that verified token, under Paperweek's own project claim and granted by the owning
 * organisation: no database or login-service role lookup (co-sy-v2 D-sec-026).
 *
 * Paperweek's data stays in Paperweek's own database; every row is keyed on the token's `sub`.
 *
 * Agents (Mark's ruling 084-Q8, 19 Oct 2026: "yes they may login and create their won crap. And
 * hard delete their OWN test data?") are ordinary Co-Sy accounts. They sign in on Co-Sy's page
 * through the same sign-in app and pass this same guard; there is no client-credentials path, no
 * second client id and no header naming another person (the old `X-On-Behalf-Of` is gone). An
 * agent works only on rows keyed on its own `sub`, like anyone else.
 */
import type { ConfigService } from '@nestjs/config';
import type { SatelliteGuardConfig } from '@co-sy/satellite-guard';

/** The one Paperweek project role that admits a person (the app-user right "use Paperweek"). */
export const PAPERWEEK_ROLE = 'PAPERWEEK_USER';

/**
 * The agent role (084-Q8), declared in `auth/co-space.json` as "Paperweek agent: may hard delete
 * its own data". It adds exactly one thing to {@link PAPERWEEK_ROLE}: the hard delete routes, and
 * only on rows the caller owns. Read, like every role here, only from the verified token's
 * Paperweek project claim, granted by the owning organisation; never looked up in a database.
 */
export const PAPERWEEK_AGENT_ROLE = 'PAPERWEEK_AGENT';

/** Configuration keys, named as Co-Sy's `satellite:register` prints them. */
export const SATELLITE_KEYS = [
  'COSY_ISSUER',
  'COSY_API_URL',
  'SATELLITE_PROJECT_ID',
  'SATELLITE_CLIENT_IDS',
  'SATELLITE_OWNER_ORG',
] as const;

/** Splits a comma-separated list, dropping blanks. */
function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Builds the verifier settings. The stale check is always on: Co-Sy's token-status route is
 * live on Milestone 1 builds, and a requirement is never shipped switched off. The route is
 * Co-Sy's `GET /auth/token-status` (its auth controller is not under `/api/v1`, whatever the
 * guard 0.2.3 README says).
 */
export function satelliteAuthConfig(
  config: Pick<ConfigService, 'get'>,
): SatelliteGuardConfig {
  const get = (k: (typeof SATELLITE_KEYS)[number]): string =>
    (config.get<string>(k) ?? '').trim();
  const cosyApi = get('COSY_API_URL').replace(/\/+$/, '');
  return {
    issuer: get('COSY_ISSUER'),
    projectId: get('SATELLITE_PROJECT_ID'),
    clientIds: list(get('SATELLITE_CLIENT_IDS')),
    owningOrgId: get('SATELLITE_OWNER_ORG'),
    staleCheck: {
      enabled: true,
      url: `${cosyApi}/auth/token-status`,
    },
  };
}
