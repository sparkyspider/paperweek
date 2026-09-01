import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';

/** OIDC tokens minted for a session. */
export interface OidcTokens {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  expiresIn: number;
}

const b64url = (b: Buffer): string =>
  b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * Thin client for Zitadel's APIs, authenticated as the least-privilege `prod-back` machine
 * user (IAM_LOGIN_CLIENT). The only place back/ talks to Zitadel at runtime; AuthService
 * composes these calls into the login flow. Never exposes the PAT. Single-org app — no
 * org-scoping logic (co-sy-v2's multi-tenant machinery is deliberately stripped).
 */
@Injectable()
export class ZitadelService implements OnModuleInit {
  private readonly logger = new Logger('Zitadel');
  private issuer!: string;
  private orgId!: string;
  private pat!: string;
  private projectId!: string;
  private clientId!: string;
  private redirectUri!: string;
  private readonly scope = 'openid profile email offline_access';

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.issuer = this.req('ZITADEL_ISSUER');
    this.orgId = this.req('ZITADEL_ORG_ID');
    this.pat = this.req('ZITADEL_BACK_PAT');
    this.projectId = this.req('ZITADEL_PROJECT_ID');
    this.clientId = this.req('ZITADEL_OIDC_CLIENT_ID');
    this.redirectUri = this.req('OIDC_REDIRECT_URI');
  }

  get issuerUrl(): string {
    return this.issuer;
  }
  /** Accepted JWT audiences: the SPA's OIDC client id (human login) and the project id
   *  (machine-user client-credentials tokens carry the project as audience). */
  get audiences(): string[] {
    return [this.clientId, this.projectId];
  }
  get platformOrgId(): string {
    return this.orgId;
  }

  private req(key: string): string {
    const v = this.config.get<string>(key);
    if (!v) throw new Error(`Missing required config: ${key}`);
    return v;
  }

  private async upstreamFetch(url: string, init?: Parameters<typeof fetch>[1]): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (e) {
      this.logger.warn(
        `Zitadel unreachable (${init?.method ?? 'GET'} ${new URL(url).pathname}): ${(e as Error).message}`,
      );
      throw new AuthUpstreamUnavailableError((e as Error).message);
    }
  }

  private async api<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.pat}`,
      'Content-Type': 'application/json',
      'x-zitadel-orgid': this.orgId,
    };
    const res = await this.upstreamFetch(`${this.issuer}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = (json as { message?: string })?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`${method} ${path} → ${res.status}: ${msg}`);
      throw new ZitadelApiError(msg, res.status);
    }
    return json as T;
  }

  // ── Sessions ────────────────────────────────────────────────────────────

  async createPasswordSession(
    loginName: string,
    password: string,
  ): Promise<{ sessionId: string; sessionToken: string }> {
    return this.api('POST', '/v2/sessions', {
      checks: { user: { loginName }, password: { password } },
    });
  }

  async getSessionUser(sessionId: string): Promise<{ userId: string; loginName: string }> {
    const r = await this.api<{
      session?: { factors?: { user?: { id?: string; loginName?: string } } };
    }>('GET', `/v2/sessions/${sessionId}`);
    const u = r.session?.factors?.user;
    if (!u?.id) throw new ZitadelApiError('session has no verified user', 502);
    return { userId: u.id, loginName: u.loginName ?? '' };
  }

  // ── Profile ─────────────────────────────────────────────────────────────

  async getUser(userId: string): Promise<{
    id: string;
    userName: string;
    displayName?: string;
    email?: string;
    emailVerified: boolean;
  }> {
    const r = await this.api<{
      user?: {
        userId?: string;
        username?: string;
        human?: {
          profile?: { displayName?: string };
          email?: { email?: string; isVerified?: boolean };
        };
      };
    }>('GET', `/v2/users/${userId}`);
    const u = r.user ?? {};
    return {
      id: u.userId ?? userId,
      userName: u.username ?? '',
      displayName: u.human?.profile?.displayName,
      email: u.human?.email?.email,
      emailVerified: u.human?.email?.isVerified ?? false,
    };
  }

  // ── Session → JWT (OIDC finalize) ──────────────────────────────────────

  async finalizeSessionToTokens(sessionId: string, sessionToken: string): Promise<OidcTokens> {
    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const q = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: this.scope,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: b64url(randomBytes(8)),
    });
    const authRes = await this.upstreamFetch(`${this.issuer}/oauth/v2/authorize?${q}`, {
      redirect: 'manual',
    });
    const loc = authRes.headers.get('location') ?? '';
    const params = new URL(loc, this.issuer).searchParams;
    const authReqId =
      params.get('authRequest') ?? params.get('authRequestID') ?? params.get('authRequestId');
    if (!authReqId) {
      throw new ZitadelApiError(
        `authorize did not return an auth request (loc=${loc || 'none'}) — is redirect URI ${this.redirectUri} registered on the OIDC app?`,
        502,
      );
    }

    const fin = await this.api<{ callbackUrl?: string }>(
      'POST',
      `/v2/oidc/auth_requests/${authReqId}`,
      { session: { sessionId, sessionToken } },
    );
    const code = fin.callbackUrl ? new URL(fin.callbackUrl).searchParams.get('code') : null;
    if (!code) throw new ZitadelApiError('finalize returned no code', 502);

    return this.tokenExchange({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri,
      client_id: this.clientId,
      code_verifier: verifier,
    });
  }

  async refreshTokens(refreshToken: string): Promise<OidcTokens> {
    return this.tokenExchange({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.clientId,
    });
  }

  async revokeToken(token: string, hint: 'refresh_token' | 'access_token' = 'refresh_token'): Promise<void> {
    const res = await this.upstreamFetch(`${this.issuer}/oauth/v2/revoke`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token, token_type_hint: hint, client_id: this.clientId }),
    });
    if (!res.ok) throw new ZitadelApiError('token revocation failed', res.status);
  }

  private async tokenExchange(params: Record<string, string>): Promise<OidcTokens> {
    const res = await this.upstreamFetch(`${this.issuer}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params),
    });
    const j = (await res.json()) as {
      access_token?: string;
      id_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !j.access_token) {
      throw new ZitadelApiError(j.error_description ?? j.error ?? 'token exchange failed', res.status);
    }
    return {
      accessToken: j.access_token,
      idToken: j.id_token,
      refreshToken: j.refresh_token,
      expiresIn: j.expires_in ?? 3600,
    };
  }
}

export class ZitadelApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ZitadelApiError';
  }
}

/** Zitadel itself could not be reached (transport failure) — distinct from Zitadel
 *  answering with an error. Rendered as 503 AUTH_UPSTREAM_UNAVAILABLE. */
export class AuthUpstreamUnavailableError extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = 'AuthUpstreamUnavailableError';
  }
}
