import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Envelope, EnvelopeError, FieldError } from './envelope.types';
import { ValidationFailedException } from './validation.exception';
import {
  AuthUpstreamUnavailableError,
  ZitadelApiError,
} from '../../core/zitadel/zitadel.service';
import {
  safeErrorDetail,
  safeErrorStack,
} from '../../core/logging/safe-diagnostic';

const SERVER_ERROR = 500;

/**
 * Catches EVERY exception and renders it as the standard error envelope — nothing leaves
 * back/ outside the envelope. Adapted from co-sy-v2. The client gets `error.message` (short,
 * human, safe) + `error.fields` + `meta.requestId`; the server log gets the diagnostic
 * detail, keyed by that same requestId.
 */
@Catch()
export class ExceptionEnvelopeFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? randomUUID();

    const { status, error, detail } = this.describe(exception);

    const logLine = `[${requestId}] ${status} ${error.code}: ${detail ?? error.message}`;
    if (status >= SERVER_ERROR) {
      this.logger.error(logLine, safeErrorStack(exception));
    } else {
      this.logger.warn(logLine);
    }

    const envelope: Envelope<null> = {
      data: null,
      meta: { status: 'error', code: status, requestId },
      error,
    };
    res.status(status).json(envelope);
  }

  private describe(exception: unknown): {
    status: number;
    error: EnvelopeError;
    detail?: string;
  } {
    if (exception instanceof ValidationFailedException) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: {
          code: 'VALIDATION_FAILED',
          message: exception.message,
          fields: exception.fields,
        },
        detail: summariseFields(exception.fields),
      };
    }

    if (exception instanceof AuthUpstreamUnavailableError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        error: {
          code: 'AUTH_UPSTREAM_UNAVAILABLE',
          message: 'Could not contact the authentication service.',
        },
        detail: `Zitadel unreachable: ${exception.message}`,
      };
    }

    if (exception instanceof ZitadelApiError) {
      const status =
        exception.status >= 400 && exception.status < 500
          ? exception.status
          : HttpStatus.BAD_GATEWAY;
      return {
        status,
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'The identity service could not complete the request.',
        },
        detail: `Zitadel ${exception.status}: ${exception.message}`,
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body: unknown = exception.getResponse();
      return {
        status,
        error: {
          code: httpErrorCode(body, status),
          message: httpMessage(body) ?? statusToCode(status),
        },
        detail: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      detail: safeErrorDetail(exception),
    };
  }
}

function httpMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object') {
    const m = (body as { message?: unknown }).message;
    if (typeof m === 'string') return m;
    if (Array.isArray(m)) {
      const first = m.find((x): x is string => typeof x === 'string');
      if (first) return first;
    }
  }
  return undefined;
}

function httpErrorCode(body: unknown, status: number): string {
  if (body && typeof body === 'object') {
    const e = (body as { error?: unknown }).error;
    if (typeof e === 'string') return e.toUpperCase().replace(/\s+/g, '_');
  }
  return statusToCode(status);
}

function statusToCode(status: number): string {
  const name: unknown = HttpStatus[status];
  return typeof name === 'string' ? name : 'ERROR';
}

function summariseFields(fields: FieldError[]): string {
  return fields.map((f) => `${f.field}: ${f.code ?? 'invalid'}`).join(', ');
}
