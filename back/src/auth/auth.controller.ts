import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { ApiExcludeController } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LocalLoginDto } from './dto/local-login.dto';
import {
  AccessTokenResponseDto,
  LogoutResponseDto,
  MeResponseDto,
} from './dto/auth-response.dto';
import { Public } from '../core/security/public.decorator';
import { SameOriginGuard } from '../core/security/same-origin.guard';
import { CurrentUser } from '../core/security/current-user.decorator';
import type { AuthUser } from '../core/security/jwt-auth.guard';
import { OidcTokens } from '../core/zitadel/zitadel.service';

const REFRESH_COOKIE = 'productivity_refresh';

/** Cookie scoped to /auth so it only rides on refresh/logout. httpOnly = XSS-safe; `secure`
 *  is env-driven so a prod deploy can't accidentally ship the token over plaintext. */
const refreshCookieOpts = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
};

/** Strict rate limit for the login route — it hits Zitadel to check a password. */
const STRICT_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiExcludeController()
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /auth/login — local email+password login. Sets the httpOnly refresh cookie and
   *  returns the short-lived access JWT for the SPA to hold in memory. */
  @Public()
  @Throttle(STRICT_THROTTLE)
  @Post('login')
  async login(
    @Body() dto: LocalLoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponseDto> {
    const tokens = await this.auth.login(dto.email, dto.password);
    return this.respond(tokens, res);
  }

  /** POST /auth/refresh — swap the httpOnly refresh cookie for a fresh access token. Public:
   *  the caller's access token may already be expired — the refresh cookie is the proof. */
  @Public()
  @UseGuards(SameOriginGuard)
  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AccessTokenResponseDto> {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    const tokens = await this.auth.refresh(cookies?.[REFRESH_COOKIE]);
    return this.respond(tokens, res);
  }

  /** POST /auth/logout — revoke the refresh token at Zitadel (best-effort) and clear the
   *  cookie. Public: logging out must still work with an expired/absent access token. */
  @Public()
  @UseGuards(SameOriginGuard)
  @Post('logout')
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LogoutResponseDto> {
    const cookies = (req as Request & { cookies?: Record<string, string> })
      .cookies;
    await this.auth.logout(cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
    return { ok: true };
  }

  /** GET /auth/me — the caller's lean profile. For human tokens, calls Zitadel's userinfo
   *  endpoint to get email/name claims (which aren't in the access token). Agent tokens
   *  return only the token claims. */
  @Get('me')
  async me(@CurrentUser() user: AuthUser): Promise<MeResponseDto> {
    let email = user.email;
    let name = user.name;

    // For human tokens (not agent), call userinfo to get profile claims
    if (!user.isAgent && user.token) {
      try {
        const userinfo = await fetch('http://localhost:8080/oidc/v1/userinfo', {
          headers: { Authorization: `Bearer ${user.token}` },
        }).then((r) => r.json() as Promise<{
          email?: string;
          name?: string;
          preferred_username?: string;
        }>);
        email = userinfo.email ?? email;
        name = userinfo.name ?? name;
      } catch {
        // Userinfo call failed — fall back to token claims (which may be undefined)
      }
    }

    // displayName: name → email local part → undefined (never sub). If no human-readable
    // identifier, return undefined and let the frontend show a neutral placeholder.
    const displayName =
      name ||
      (email ? email.split('@')[0] : undefined);

    return {
      sub: user.sub,
      email,
      displayName,
      roles: user.roles,
      isAgent: user.isAgent,
    };
  }

  private respond(
    tokens: OidcTokens,
    res: Response,
  ): AccessTokenResponseDto {
    if (tokens.refreshToken) {
      res.cookie(REFRESH_COOKIE, tokens.refreshToken, refreshCookieOpts);
    }
    return { accessToken: tokens.accessToken, expiresIn: tokens.expiresIn };
  }
}
