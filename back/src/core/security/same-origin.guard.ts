/**
 * SameOriginGuard — CSRF defence for cookie-credentialed endpoints (`/auth/refresh`,
 * `/auth/logout`). Those authenticate by the httpOnly refresh cookie, so a cross-site page
 * could try to drive them in the user's browser. `SameSite=lax` already blocks the cookie on
 * cross-site POSTs; this is the belt-and-braces second check.
 *
 * Rule: if a browser `Origin` (or `Referer`) is present, it MUST match `FRONT_BASE_URL`.
 * Absent Origin (server-to-server / curl / tests) is allowed.
 */
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { frontBaseUrls } from '../config/front-base-url';

@Injectable()
export class SameOriginGuard implements CanActivate {
  private readonly logger = new Logger('SameOrigin');

  constructor(private readonly config: ConfigService) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const allowed = frontBaseUrls(this.config);

    const origin = req.headers.origin;
    const referer = req.headers.referer;

    if (!origin && !referer) return true;

    if (origin) {
      if (allowed.includes(origin)) return true;
    } else if (referer && allowed.some((a) => referer.startsWith(`${a}/`))) {
      return true;
    }

    this.logger.warn(
      `rejected cross-origin request (origin=${origin ?? '-'}, referer=${referer ?? '-'})`,
    );
    throw new ForbiddenException('Cross-origin request rejected');
  }
}
