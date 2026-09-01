# Rules: System (cross-cutting)

Cross-cutting rules for the whole repository. **Everyone reads this**, whatever
area they work in. Area-specific rules live in the other `rules-*.md` files.
The system's *shape* (what the pieces are and how they fit) lives in
[`architecture-system.md`](architecture-system.md) — read that first, then these.

## 1. Repository shape

Repo layout and the topology are described in
[`architecture-system.md`](architecture-system.md). The enforceable rules:

- **The root holds `CLAUDE.md`, `SPEC.md`, `README.md`/`AGENTS.md` (where present),
  `docs/`, and the three sub-project folders (`front/`, `back/`, `auth/`)**, plus
  VCS/editor dotfiles. No configs, scripts, lockfiles, `.env`, or stray docs at the root.
- **Single repo (not multi-repo).** Unlike co-sy-v2, `front/`, `back/`, and `auth/`
  are plain folders inside this one git repository — not independent checkouts.
  There is no per-folder `CLAUDE.md`; this repo's `CLAUDE.md` is the one entry point.
- **Commit & push only on explicit request** — suggest it, then wait; never
  auto-commit or push.
- Each of `front/`, `back/`, `auth/` is **self-contained**: its own dependencies,
  its own config, its own `.env.example`.
- There is **no** shared root `package.json` or monorepo tool unless a task
  explicitly introduces one (and updates these rules).

## 2. Single source of truth (MAJOR RULE)

Every fact — a decision, a rule, a value, a convention — has **exactly one
canonical home**. Other docs **link** to it; they never copy it.

- **Never duplicate the detail.** Copying the authoritative content (values, full
  lists, exact rules) into a second place is the problem — it drifts and becomes a
  confident lie. If you are about to paste the detail, stop and link instead.
- **A signpost is fine; a copy is not.** A heading, a line or two saying what a
  thing means, then a link to its canonical home — that is allowed and often good
  for clarity. The test: if the canonical home changes, a signpost stays true, a
  copy goes stale. **If it would go stale, don't write it.**
- **Point from less-detailed to more-detailed.** The layering is
  `decisions-<area>.md` (settled what/why) → `rules-<area>.md` (enforceable).
  A higher layer states a thing once and points down; it does not restate the detail.
- **One home per fact.** A config value lives in one `.env.example`; a role model
  in one `rules-*.md`; a rationale in one decision entry. Elsewhere, signpost it —
  do not echo the detail.
- **Change the one home.** When a fact moves or changes, update its canonical
  home only; every link stays correct for free. That is the point of the rule.
- **Applies to code too:** shared shapes are shared by contract, not copied (§3);
  no second store of something that already has an owner.

## 3. Boundaries between the pieces

The topology (who talks to whom) is drawn in
[`architecture-system.md`](architecture-system.md); the enforceable constraints:

- `front/` talks to `back/` **only over HTTP** (the API). It never imports
  backend code directly.
- `back/` never imports frontend code.
- Authentication is delegated to `auth/` (Zitadel). Neither `front/` nor `back/`
  rolls its own login, password storage, or token issuing. See
  [`rules-auth.md`](rules-auth.md) and [`rules-users.md`](rules-users.md).
- Anything shared between front and back (e.g. DTO shapes) is shared by
  **contract**, not by importing across folders. If real code-sharing becomes
  necessary, it needs these rules to be updated first.

## 4. Configuration & secrets

- Config comes from environment variables. Each sub-project ships a committed
  `.env.example` documenting every variable it reads.
- **Never commit real secrets.** `.env` files are git-ignored inside each sub-project.
- Ports, hostnames, and URLs are configurable — no hard-coded `localhost:3200`/`3201`
  scattered through the code.
- **The full secrets discipline lives in [`rules-security.md`](rules-security.md)** (SSOT):
  Secret Manager as the source of truth, identity over downloaded keys, secretless local
  dev/onboarding, rotation. Every area rule defers there.

## 5. Language & tooling baseline

- **TypeScript everywhere.** No plain `.js` source files in `front/` or `back/`
  (config files that must be JS are the only exception).
- `strict` mode is on in every `tsconfig.json`.
- Formatting and linting are enforced per sub-project (Prettier + ESLint).
  Code is committed already formatted.
- Pinned stack: **Nuxt 4 + Vue 3.5 + Tailwind 4** (front, port 3200),
  **NestJS 11 + Prisma 6 + PostgreSQL** (back, port 3201, database `productivity`).
  Pin exact versions in each sub-project's `package.json`.

## 6. Definition of done (applies to every task)

A task is done only when:
1. It meets its stated acceptance criteria.
2. The relevant sub-project builds/type-checks cleanly.
3. Lint passes.
4. The change respects these rules and the area `rules-*.md`.

## 7. Agent skills

Reusable agent procedures (e.g. driving a browser, a release step) are **skills**,
each a folder `.claude/skills/<name>/SKILL.md` at the repo root, committed and shared
— every agent gets the skills automatically.

- **Auto-discovered = the folder is the registry.** Claude Code surfaces each skill's
  `name` + `description` (its `SKILL.md` frontmatter) on its own. So there is **no
  hand-maintained list of skills** anywhere — that would drift (SSOT, §2). Make the
  `description` state clearly *when* to use the skill; that is how it gets found.
- **Keep skills self-contained.** A skill's own deps/artifacts stay inside its folder
  and are gitignored; they never leak to the root.

## 8. When rules conflict

Order of precedence, highest first:
1. The task's explicit acceptance criteria.
2. `rules-system.md` (this file).
3. The area `rules-*.md`.

If you find a genuine conflict, say so rather than quietly picking one.

## 9. No hardcoding without explicit sign-off

**Nothing is hardcoded without explicit permission.** A special case baked into
code — a fixed route, a magic value, a named entity treated specially, an
if-for-this-one-case — is a decision the system can no longer make for itself,
and it will silently go wrong when the context changes.

- **Derive, don't declare.** Behaviour follows from data the system already
  holds — the current user's `ownerId`, configuration, ordering — never from a
  literal that happens to be true today (e.g. never hardcode "Mark" or "Tarryn"
  anywhere in `back/` or `front/` logic; both are just users with an `ownerId`).
- **If you believe a hardcode is genuinely warranted**, ask first, and record the
  ok (task note or a decision entry) so the permission is auditable.
- Configuration values already have their home (§4); this rule covers the
  subtler kind — behavioural special-casing hidden in code paths.
