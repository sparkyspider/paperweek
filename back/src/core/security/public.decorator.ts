import { SetMetadata } from '@nestjs/common';

/**
 * Marks a route (or a whole controller) as anonymously reachable, opting it OUT of the
 * global `JwtAuthGuard`. Default posture is deny: every route requires a valid JWT unless
 * explicitly made public — so a new controller with no decorator is protected automatically.
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
