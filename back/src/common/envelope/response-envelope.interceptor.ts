import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Envelope } from './envelope.types';

/** Wraps every successful controller return in the standard envelope. */
@Injectable()
export class ResponseEnvelopeInterceptor<T>
  implements NestInterceptor<T, Envelope<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<Envelope<T>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { requestId?: string }>();
    const res = http.getResponse<Response>();
    const requestId = req.requestId ?? randomUUID();

    return next.handle().pipe(
      map((data) => ({
        data: data ?? null,
        meta: {
          status: 'ok' as const,
          code: res.statusCode,
          requestId,
          messages: [],
        },
        error: null,
      })),
    );
  }
}
