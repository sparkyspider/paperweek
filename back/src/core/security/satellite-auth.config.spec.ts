import { PAPERWEEK_ROLE, satelliteAuthConfig } from './satellite-auth.config';

const env = (vals: Record<string, string>) => ({
  get: <T>(k: string): T | undefined => vals[k] as T | undefined,
});

describe('satelliteAuthConfig', () => {
  it('maps the settings Co-Sy satellite:register prints onto the guard config', () => {
    const cfg = satelliteAuthConfig(
      env({
        COSY_ISSUER: 'http://localhost:8080',
        COSY_API_URL: 'http://localhost:3051/',
        SATELLITE_PROJECT_ID: '111',
        SATELLITE_CLIENT_IDS: '222, 333 ,',
        SATELLITE_OWNER_ORG: '444',
      }),
    );
    expect(cfg).toEqual({
      issuer: 'http://localhost:8080',
      projectId: '111',
      clientIds: ['222', '333'],
      owningOrgId: '444',
      staleCheck: {
        enabled: true,
        url: 'http://localhost:3051/auth/token-status',
      },
    });
  });

  it('never switches the stale check off, whatever the settings say', () => {
    const cfg = satelliteAuthConfig(env({ STALE_CHECK: 'false' }));
    expect(cfg.staleCheck.enabled).toBe(true);
  });

  it('names exactly one admitting role', () => {
    expect(PAPERWEEK_ROLE).toBe('PAPERWEEK_USER');
  });
});
