/**
 * One structured log line per HTTP request: method, path, status, duration, client ip,
 * requestId. Adapted from co-sy-v2. Logged when the RESPONSE has gone out (`finish`/`close`),
 * not when the handler returns — a request the exception filter turns into a 500 must not log
 * as a cheerful 200.
 */
import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';

/** Query keys whose value is a credential — redacted before the line is written. */
const SECRET_QUERY_KEYS = new Set([
  'token',
  'code',
  'secret',
  'password',
  'access_token',
  'id_token',
  'refresh_token',
]);

const REDACTED = '[redacted]';

export function redactUrl(originalUrl: string): string {
  const cut = originalUrl.indexOf('?');
  if (cut === -1) return originalUrl;
  const path = originalUrl.slice(0, cut);
  try {
    let touched = false;
    const pairs = originalUrl
      .slice(cut + 1)
      .split('&')
      .map((pair) => {
        const eq = pair.indexOf('=');
        const rawKey = eq === -1 ? pair : pair.slice(0, eq);
        let key: string;
        try {
          key = decodeURIComponent(rawKey);
        } catch {
          key = rawKey;
        }
        if (!SECRET_QUERY_KEYS.has(key.toLowerCase())) return pair;
        touched = true;
        return `${rawKey}=${REDACTED}`;
      });
    return touched ? `${path}?${pairs.join('&')}` : originalUrl;
  } catch {
    return path;
  }
}

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Request');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const start = Date.now();

    let logged = false;
    const emit = () => {
      if (logged) return;
      logged = true;
      const line = {
        method: req.method,
        path: redactUrl(req.originalUrl ?? req.url),
        status: res.statusCode,
        durationMs: Date.now() - start,
        ip: req.ip,
      };
      if (res.statusCode >= 500) this.logger.warn(line);
      else this.logger.log(line);
    };
    res.once('finish', emit);
    res.once('close', emit);

    return next.handle();
  }
}
