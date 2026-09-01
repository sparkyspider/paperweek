/**
 * Mints (or adopts) one `requestId` per HTTP request and puts it in the async context. Runs
 * first in the express chain so guards, services, the response envelope and the exception
 * filter all share the same id. Adopts an inbound `x-request-id`, else generates one, and
 * echoes it back on the response header.
 */
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from './request-context';

export function requestIdMiddleware(
  req: Request & { requestId?: string },
  res: Response,
  next: NextFunction,
): void {
  const inbound = req.headers['x-request-id'];
  const requestId =
    (Array.isArray(inbound) ? inbound[0] : inbound) || randomUUID();

  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);

  requestContext.run({ requestId }, () => next());
}
