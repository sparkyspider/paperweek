/**
 * The PAPERWEEK_DELETE right, granted to agent accounts (084-Q8), proved through the REAL `SatelliteAuthGuard` over the real controllers'
 * metadata: the two hard delete routes need BOTH PAPERWEEK_USER (controller) and PAPERWEEK_DELETE
 * (route); soft delete and every other route need PAPERWEEK_USER only. The verifier is a stand-in
 * that returns a person with the roles given, as a verified token would carry them; the role
 * check itself is the package's own.
 */
import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

// jose (the guard's key library) is ESM-only and Jest's CommonJS loader cannot require it.
// Nothing here verifies a signature: the verifier below is a stand-in.
jest.mock('jose', () => ({}));
import { SatelliteAuthGuard } from '@co-sy/satellite-guard/nest';
import { ThemesController } from '../../themes/themes.controller';
import { TasksController } from '../../tasks/tasks.controller';
import { PAPERWEEK_DELETE_ROLE, PAPERWEEK_ROLE } from './satellite-auth.config';

type Handler = (...args: never[]) => unknown;

function guardFor(roles: string[]): SatelliteAuthGuard {
  const verifier = {
    verifyAuthorizationHeader: jest
      .fn()
      .mockResolvedValue({ sub: 'agent-1', roles }),
  };
  return new SatelliteAuthGuard(
    new Reflector(),
    verifier as unknown as ConstructorParameters<typeof SatelliteAuthGuard>[1],
  );
}

function ctx(
  controller: { prototype: object },
  handler: string,
): ExecutionContext {
  const req = { headers: { authorization: 'Bearer stand-in' } };
  return {
    getHandler: () =>
      (controller.prototype as Record<string, Handler>)[handler],
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

async function statusOf(
  roles: string[],
  controller: { prototype: object },
  handler: string,
) {
  try {
    return (await guardFor(roles).canActivate(ctx(controller, handler)))
      ? 200
      : 0;
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : -1;
  }
}

const HARD = [
  [ThemesController, 'hardDelete'],
  [TasksController, 'hardDelete'],
] as const;

describe('PAPERWEEK_DELETE right guarding (084-Q8)', () => {
  it.each(HARD)('%p.%s: PAPERWEEK_USER alone is refused 403', async (c, h) => {
    expect(await statusOf([PAPERWEEK_ROLE], c, h)).toBe(403);
  });

  it.each(HARD)('%p.%s: PAPERWEEK_DELETE alone is refused 403', async (c, h) => {
    expect(await statusOf([PAPERWEEK_DELETE_ROLE], c, h)).toBe(403);
  });

  it.each(HARD)('%p.%s: no Paperweek role is refused 403', async (c, h) => {
    expect(await statusOf([], c, h)).toBe(403);
  });

  it.each(HARD)('%p.%s: BOTH roles pass the guard', async (c, h) => {
    expect(await statusOf([PAPERWEEK_ROLE, PAPERWEEK_DELETE_ROLE], c, h)).toBe(
      200,
    );
  });

  it.each([
    [ThemesController, 'archive'],
    [TasksController, 'softDelete'],
  ] as const)(
    '%p.%s (soft delete): PAPERWEEK_USER alone still passes',
    async (c, h) => {
      expect(await statusOf([PAPERWEEK_ROLE], c, h)).toBe(200);
    },
  );

  it.each(['co-space.json', 'co-space.production.json'])(
    'auth/%s declares exactly the two roles the code checks, the agent one as app-user',
    (name) => {
      const file = JSON.parse(
        readFileSync(join(__dirname, '../../../../auth', name), 'utf8'),
      ) as { rights: { key: string; words: string; kind: string }[] };
      expect(file.rights.map((r) => r.key).sort()).toEqual(
        [PAPERWEEK_DELETE_ROLE, PAPERWEEK_ROLE].sort(),
      );
      const agent = file.rights.find((r) => r.key === PAPERWEEK_DELETE_ROLE);
      expect(agent).toEqual({
        key: 'PAPERWEEK_DELETE',
        words: 'Permanently delete own themes and tasks',
        kind: 'app-user',
      });
    },
  );
});
