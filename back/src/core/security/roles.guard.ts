import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { AuthUser } from './jwt-auth.guard';
import { ROLES_KEY, TIER_RANK } from './roles.decorator';

/**
 * RolesGuard — enforces `@Roles(...)` from route metadata. Runs after `JwtAuthGuard` (which
 * attaches the verified user). `admin` is a tier above `user`; `agent` is a non-tier
 * capability role and needs an exact match. Kept as reusable infrastructure — the themes/
 * tasks routes in this app are not role-gated beyond "any authenticated caller" (single-org,
 * per-owner data), but a route can opt into `@Roles('admin')` if that ever changes.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = req.user;
    if (!user) throw new UnauthorizedException('Not authenticated');

    const required =
      this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? [];
    if (!required.length) return true;

    const roles = new Set(user.roles);
    const userTier = Math.max(-1, ...[...roles].map((r) => TIER_RANK[r] ?? -1));
    const ok = required.some((r) =>
      r in TIER_RANK ? userTier >= TIER_RANK[r] : roles.has(r),
    );
    if (!ok) throw new ForbiddenException('Insufficient role');
    return true;
  }
}
