import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { ZitadelService } from '../zitadel/zitadel.service';
import { ON_BEHALF_OF_HEADER, ROLES_CLAIM_PATTERN } from './claims';
import { IS_PUBLIC_KEY } from './public.decorator';

/** The verified caller, derived ONLY from validated token claims (never the body). */
export interface AuthUser {
  sub: string;
  email?: string;
  name?: string;
  /** Flat project role keys held in the "Productivity" org (single-org app — no
   *  org-grouping is consulted). */
  roles: string[];
  isAdmin: boolean;
  /** Holds the `agent` role — the prod-agent service account, calling the API directly on
   *  behalf of a named human owner. */
  isAgent: boolean;
  /** Whose data this request may act on. Normally the caller's own `sub`. For an `agent`
   *  caller, the validated `X-On-Behalf-Of` header (a Zitadel user id) — narrowed, never
   *  escalated: a non-agent caller may never act as anyone but themselves. */
  ownerId: string;
  claims: JWTPayload;
  /** Raw JWT token string, for endpoints needing to call userinfo or other token-requiring APIs. */
  token?: string;
}

/**
 * Stateless resource-server guard: validates the Bearer JWT against Zitadel's JWKS (issuer +
 * signature + audience + expiry) and attaches the caller. No server session lookup — the
 * token is the proof. Accepts EITHER audience Zitadel stamps on a token minted for this app:
 * the SPA's OIDC client id (human BFF login) or the "Productivity Platform" project id
 * (machine-user client-credentials tokens requested with the project-audience scope — see
 * `ZitadelService.audiences` and `AGENTS.md`).
 *
 * Deny-by-default: registered as a global `APP_GUARD`, so EVERY route requires a valid JWT
 * unless the handler or its controller carries `@Public()`.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate, OnModuleInit {
  private readonly logger = new Logger('JwtAuthGuard');
  private jwks!: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly zitadel: ZitadelService,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit(): void {
    this.jwks = createRemoteJWKSet(
      new URL(`${this.zitadel.issuerUrl}/oauth/v2/keys`),
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('Missing bearer token');

    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: this.zitadel.issuerUrl,
        audience: this.zitadel.audiences,
      });
      const user = toAuthUser(payload, token);

      const onBehalfOf = headerValue(req.headers[ON_BEHALF_OF_HEADER]);
      if (onBehalfOf) {
        if (!user.isAgent) {
          throw new ForbiddenException(
            `${ON_BEHALF_OF_HEADER} may only be set by a caller holding the agent role`,
          );
        }
        user.ownerId = onBehalfOf;
      }

      req.user = user;
      return true;
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.logger.warn(`token rejected: ${(e as Error).message}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}

function headerValue(v: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(v) ? v[0] : v;
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function toAuthUser(p: JWTPayload, token?: string): AuthUser {
  // Zitadel roles claim shape: { roleKey: { orgId: orgDomain } }. Single org → flatten. The
  // claim KEY differs by grant type (see ROLES_CLAIM_PATTERN) — scan for whichever is present
  // and merge, rather than assuming one shape.
  const roleSet = new Set<string>();
  for (const [key, value] of Object.entries(p)) {
    if (!ROLES_CLAIM_PATTERN.test(key)) continue;
    for (const role of Object.keys((value ?? {}) as Record<string, unknown>)) {
      roleSet.add(role);
    }
  }
  const roles = [...roleSet];
  const sub = String(p.sub);
  return {
    sub,
    email: typeof p.email === 'string' ? p.email : undefined,
    name: typeof p.name === 'string' ? p.name : undefined,
    roles,
    isAdmin: roles.includes('admin'),
    isAgent: roles.includes('agent'),
    ownerId: sub,
    claims: p,
    token,
  };
}
