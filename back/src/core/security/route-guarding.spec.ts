/**
 * Deny by default, proved over the real controllers: every route either needs Paperweek's role
 * (from the verified token) or is one of the two named public health probes. A new route that
 * forgets `@RequireRole` fails here.
 */
import 'reflect-metadata';

// jose (the guard's key library) is ESM-only and Jest's CommonJS loader cannot require it.
// Nothing here verifies a token; only the guard's metadata keys are read.
jest.mock('jose', () => ({}));
import {
  SATELLITE_PUBLIC_KEY,
  SATELLITE_ROLES_KEY,
} from '@co-sy/satellite-guard/nest';
import { AppController } from '../../app.controller';
import { ThemesController } from '../../themes/themes.controller';
import { TasksController } from '../../tasks/tasks.controller';
import { PAPERWEEK_DELETE_ROLE, PAPERWEEK_ROLE } from './satellite-auth.config';

type Ctor = { prototype: Record<string, unknown>; name: string };

function handlers(c: Ctor): string[] {
  return Object.getOwnPropertyNames(c.prototype).filter(
    (n) => n !== 'constructor' && typeof c.prototype[n] === 'function',
  );
}

function roles(c: Ctor, h: string): string[] {
  const own = Reflect.getMetadata(SATELLITE_ROLES_KEY, c.prototype[h] as object) as
    | string[]
    | undefined;
  const cls = Reflect.getMetadata(SATELLITE_ROLES_KEY, c) as string[] | undefined;
  return [...(own ?? []), ...(cls ?? [])];
}

function isPublic(c: Ctor, h: string): boolean {
  return Boolean(
    Reflect.getMetadata(SATELLITE_PUBLIC_KEY, c.prototype[h] as object) ??
      Reflect.getMetadata(SATELLITE_PUBLIC_KEY, c),
  );
}

describe('route guarding', () => {
  it.each([ThemesController, TasksController] as unknown as Ctor[])(
    '%p: every route needs PAPERWEEK_USER and none is public',
    (c) => {
      const hs = handlers(c);
      expect(hs.length).toBeGreaterThan(0);
      for (const h of hs) {
        expect(isPublic(c, h)).toBe(false);
        expect(roles(c, h)).toContain(PAPERWEEK_ROLE);
      }
    },
  );

  it.each([ThemesController, TasksController] as unknown as Ctor[])(
    '%p: only hardDelete carries the PAPERWEEK_DELETE right (084-Q8)',
    (c) => {
      expect(handlers(c).filter((h) => roles(c, h).includes(PAPERWEEK_DELETE_ROLE))).toEqual([
        'hardDelete',
      ]);
    },
  );

  it('only the liveness and health probes are public', () => {
    const c = AppController as unknown as Ctor;
    expect(handlers(c).filter((h) => isPublic(c, h)).sort()).toEqual([
      'getHello',
      'health',
    ]);
  });
});
