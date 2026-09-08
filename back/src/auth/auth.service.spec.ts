import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthUpstreamUnavailableError, ZitadelApiError, ZitadelService } from '../core/zitadel/zitadel.service';

/**
 * Mark hit this live 2026-09-07: with Zitadel (localhost:8080) unreachable, back/ logged
 * "Zitadel unreachable (POST /v2/sessions): fetch failed" and then answered the login page
 * with 401 "Incorrect email or password." — the front rendered that as a bad-credentials
 * message, which is what misled him. The two conditions must never share a response: a
 * transport failure reaching Zitadel is a 503 saying so; genuinely wrong credentials (Zitadel
 * answering, just refusing them) stay 401 "Incorrect email or password."
 */

function buildService(zitadel: Partial<ZitadelService>): AuthService {
  return new AuthService(zitadel as ZitadelService);
}

describe('AuthService.login — Zitadel-unreachable vs bad-credentials', () => {
  it('maps a fetch failure reaching Zitadel to 503 with the exact sign-in-unreachable message', async () => {
    const zitadel = {
      createPasswordSession: jest.fn(() =>
        Promise.reject(new AuthUpstreamUnavailableError('fetch failed')),
      ),
    };
    const service = buildService(zitadel);

    await expect(service.login('mark@co-sy.org', 'whatever')).rejects.toMatchObject({
      status: 503,
      response: {
        message: 'Sign-in service is unreachable. Check that Zitadel is running (Docker) and try again.',
      },
    });
    await expect(service.login('mark@co-sy.org', 'whatever')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('keeps a genuine Zitadel 401 (Zitadel reachable, credentials refused) as 401 "Incorrect email or password."', async () => {
    const zitadel = {
      createPasswordSession: jest.fn(() =>
        Promise.reject(new ZitadelApiError('password does not match', 401)),
      ),
    };
    const service = buildService(zitadel);

    await expect(service.login('mark@co-sy.org', 'wrong-password')).rejects.toMatchObject({
      status: 401,
      response: { message: 'Incorrect email or password.' },
    });
    await expect(service.login('mark@co-sy.org', 'wrong-password')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('AuthService.refresh — the same distinction on the refresh/session path', () => {
  it('maps a fetch failure reaching Zitadel to 503 with the exact sign-in-unreachable message', async () => {
    const zitadel = {
      refreshTokens: jest.fn(() =>
        Promise.reject(new AuthUpstreamUnavailableError('fetch failed')),
      ),
    };
    const service = buildService(zitadel);

    await expect(service.refresh('rt-1')).rejects.toMatchObject({
      status: 503,
      response: {
        message: 'Sign-in service is unreachable. Check that Zitadel is running (Docker) and try again.',
      },
    });
  });

  it('keeps a genuine refresh-token rejection as 401 "Session expired — please log in again."', async () => {
    const zitadel = {
      refreshTokens: jest.fn(() => Promise.reject(new ZitadelApiError('invalid refresh token', 400))),
    };
    const service = buildService(zitadel);

    await expect(service.refresh('rt-1')).rejects.toMatchObject({
      status: 401,
      response: { message: 'Session expired — please log in again.' },
    });
  });
});
