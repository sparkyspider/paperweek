# Productivity Tools — Spec

A TeuxDeux-inspired weekly planner. Google Calendar felt messy; this is the calm alternative — a pretty, art-paper week view with life-theme task backlogs. Fun, but by no means messy.

## Users

- Mark (mark@flyh2.com) and Tarryn — each with their **own** themes and tasks (per-user data, single Zitadel org "Productivity").
- AI agents are first-class users: a `prod-agent` service account can call the NestJS API directly (with `X-On-Behalf-Of`) to manage themes/tasks on a person's behalf. See `AGENTS.md`.

## Core concepts

- **Life-themes** — user-defined, not hardcoded. Mark's seeded set: FlyH2, Co-Sy, Positive Polar, RT7 Digital, Life Balance, Admin, Personal. Add / remove / rename — but *softly*: archive with undo, never hard delete.
- **Theme taxonomy philosophy**: a theme earns its lane when it competes for the week's attention. Exactly **one** friction-free catch-all (Personal) — never several fuzzy buckets. Admin absorbs Budgets & Tax. Findhorn work lives inside Co-Sy until big enough to promote (promotion is cheap: themes are just a field on tasks). Cross-cutting concerns use a free-form `#hashtag` convention in task titles — no schema, no obligation, searchable.
- **Theme backlogs** — tasks live under a theme in the left sidebar until you're ready, then get **pulled (dragged) into the week**.
- **Dayparts, not timeslots** — tasks aren't time-bound. Each day offers a few lines for **Morning / Afternoon / Evening**.

## The week view

- **Two weeks visible**, one week per row: this week on top, next week below. Weeks start Monday.
- Generous columns — **never squashed**. Horizontal scroll beats cramming.
- **Weekends are collapsible**: Sat + Sun fold into a slim expandable stub per week row (state remembered).
- Today is softly highlighted.
- Complete a task → satisfying ink strikethrough, fades but stays; un-check restores.

## Look & feel

Art paper: slight parchment warmth (TeuxDeux-like), watercolor/gouache accents. Watercolor blob swatches per theme, hand-lettered display type (Caveat/Kalam-style) over a clean body font, gouache-pen underlines, subtle paper grain. Elegant and calm — not cartoonish, not cluttered.

## Stack

Nuxt 4 + Vue 3.5 + Tailwind 4 (front, port **3200**) · NestJS 11 + Prisma 6 + PostgreSQL (back, port **3201**, database `productivity`)

> Ports 3100/3101 are RESERVED by the co-sy-v2 "board" launchd services (`org.co-sy.board-web`/`board-api` in `~/Library/LaunchAgents`) — never use or kill them. Co-sy's port allocator also owns 3010–3099. This app lives on 3200/3201. · Zitadel OIDC login (shared local instance from co-sy-v2, `http://localhost:8080`, own org "Productivity"). Plumbing inherited from co-sy-v2 — see `CLAUDE.md` for rules/architecture/decisions.

## Soft-delete philosophy

Everything user-created (themes, tasks) is soft-deleted/archived with undo. Agents may change themes/tasks via the DB or (preferably) the API — never destructively.
