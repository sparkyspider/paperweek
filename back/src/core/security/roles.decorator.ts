import { SetMetadata } from '@nestjs/common';

/** The three project roles provisioned by auth/bootstrap-productivity.sh. `admin` is a tier
 *  above `user`; `agent` is a separate, non-tier capability (a service account acting on a
 *  named owner's behalf via X-On-Behalf-Of), not a privilege level over `user`. */
export const TIER_RANK: Record<string, number> = {
  admin: 1,
  user: 0,
};

export const ROLES_KEY = 'auth:roles';

/** Require one of these roles on the handler. A tier role (`admin`/`user`) is satisfied by
 *  an equal-or-higher tier; `agent` needs an exact match. */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
