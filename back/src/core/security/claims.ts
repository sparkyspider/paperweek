/**
 * Zitadel token claim keys — dependency-free (no `jose`, no Nest) so it can be imported
 * anywhere, including plain unit tests.
 */

/**
 * The project-roles claim: `{ roleKey: { orgId: orgDomain } }` (projectRoleAssertion=true on
 * the "Productivity Platform" project). Single-org app — flattened to a role-key list, the
 * org grouping is not consulted.
 *
 * Zitadel stamps this under TWO DIFFERENT KEY SHAPES depending on how the token was minted —
 * verified live against this instance (2026-09-01):
 *   - human BFF login (authorization_code, via the OIDC app): generic
 *     `urn:zitadel:iam:org:project:roles`.
 *   - `prod-agent` client-credentials grant (scope `urn:zitadel:iam:org:projects:roles`):
 *     PROJECT-ID-namespaced `urn:zitadel:iam:org:project:{projectId}:roles`.
 * The guard checks both shapes (see ROLES_CLAIM_PATTERN) rather than picking one.
 */
export const ROLES_CLAIM = 'urn:zitadel:iam:org:project:roles';

/** Matches either claim-key shape above; used to flatten role keys off the verified token
 *  regardless of which grant minted it. */
export const ROLES_CLAIM_PATTERN = /^urn:zitadel:iam:org:project:(?:roles|\d+:roles)$/;

/** Header a caller holding the `agent` role may set to act on another user's data — the
 *  named user's Zitadel subject (id). Ignored (refused) for any caller that is not an agent. */
export const ON_BEHALF_OF_HEADER = 'x-on-behalf-of';
