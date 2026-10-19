import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { bearerSubject, clientIp } from './throttler.config';

/**
 * Global rate-limit guard. Keys on the bearer subject (unverified — verification happens
 * downstream in the satellite guard (SatelliteAuthGuard); this guard runs first so a flood is rejected before any JWKS
 * work) so an authenticated caller spends their own budget, falling back to client IP.
 */
@Injectable()
export class ThrottlerTrackerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const subject = bearerSubject(req);
    if (subject) return Promise.resolve(`sub:${subject}`);
    return Promise.resolve(`ip:${clientIp(req)}`);
  }
}
