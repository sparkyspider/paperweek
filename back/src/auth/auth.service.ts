import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuthUpstreamUnavailableError,
  OidcTokens,
  ZitadelService,
} from '../core/zitadel/zitadel.service';

/** Shown instead of "Incorrect email or password." when Zitadel itself could not be reached
 *  (transport failure) — a down auth service must never present as bad credentials. */
const SIGN_IN_UNREACHABLE_MESSAGE =
  'Sign-in service is unreachable. Check that Zitadel is running (Docker) and try again.';

@Injectable()
export class AuthService {
  constructor(private readonly zitadel: ZitadelService) {}

  /** Local email+password login: Zitadel session check → finalize to OIDC tokens. Wrong
   *  credentials come back from Zitadel as a session-check failure — rendered as a generic
   *  401 rather than leaking which half (email vs password) was wrong. A transport failure
   *  reaching Zitadel is a different condition entirely — rendered as 503, never as 401. */
  async login(email: string, password: string): Promise<OidcTokens> {
    try {
      const { sessionId, sessionToken } = await this.zitadel.createPasswordSession(
        email,
        password,
      );
      return await this.zitadel.finalizeSessionToTokens(sessionId, sessionToken);
    } catch (e) {
      if (e instanceof AuthUpstreamUnavailableError) {
        throw new ServiceUnavailableException(SIGN_IN_UNREACHABLE_MESSAGE);
      }
      throw new UnauthorizedException('Incorrect email or password.');
    }
  }

  async refresh(refreshToken: string | undefined): Promise<OidcTokens> {
    if (!refreshToken) throw new UnauthorizedException('No session to refresh.');
    try {
      return await this.zitadel.refreshTokens(refreshToken);
    } catch (e) {
      if (e instanceof AuthUpstreamUnavailableError) {
        throw new ServiceUnavailableException(SIGN_IN_UNREACHABLE_MESSAGE);
      }
      throw new UnauthorizedException('Session expired — please log in again.');
    }
  }

  /** Revoke the refresh token at Zitadel (best-effort — logout must still succeed and clear
   *  the cookie even if the upstream revoke fails or the token was already dead). */
  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    try {
      await this.zitadel.revokeToken(refreshToken, 'refresh_token');
    } catch {
      // best-effort — the cookie is cleared regardless
    }
  }
}
