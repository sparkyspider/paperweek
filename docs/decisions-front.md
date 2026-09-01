# Decisions: Frontend

Durable `front/` decisions. Distilled — conversation in `DISCUSSION.txt`, rules in
`rules-front.md`.

**KEEP TERSE.** Read on every build; every token counts. One line title + 1–2
lines max. Append only; reverse via new entry + `Superseded by`. Promote hard
rules into `rules-front.md`. Status: `Decided` · `Proposed` · `Open` · `Superseded`.

**IDs D-front-001…028 are inherited from co-sy-v2**, where they were made and where the
full superseded chain and business-specific entries (component-hub route history,
the agreements TipTap editor, org-switcher, test-data colour token, "one document one
text" rendering) live. Only the entries still applicable to this project's stack and
UI shape are carried forward here, verbatim where the content is generic, with their
original numbers kept (not renumbered) so they stay traceable back to co-sy-v2 if
needed. New entries for this project start at **D-front-029**.

---

- **D-front-001 · Nuxt 4 + TS strict** — Decided (inherited)
  Latest stable Nuxt 4, strict TS, npm + lockfile. `<script setup lang="ts">`.

- **D-front-002 · Tailwind v4 via @tailwindcss/vite** — Decided (inherited)
  Tailwind v4 through the Vite plugin; `app/assets/css/main.css` = `@import
  "tailwindcss";`. Utilities-first, no other UI lib.

- **D-front-003 · API base from env** — Decided (inherited, port updated)
  Backend URL via `runtimeConfig.public.apiBase` (`NUXT_PUBLIC_API_BASE`, default
  `http://localhost:3201`). No hard-coded URLs; single typed API layer.

- **D-front-011 · State via Pinia; presentational components; mock-first stores** — Decided (inherited)
  Feature domain state + actions live in **Pinia** setup stores (`stores/<feature>.ts`),
  not in components. Functional components stay presentational (props in / events out);
  the typed API layer is the only place HTTP happens. Pinia is SSR-safe, idiomatic Nuxt,
  and enables **mock-first** dev: `useXDemo` (fixtures) vs `useX` (API), same shape, swap
  to go live. Detail: `rules-front.md` §6.

- **D-front-013 · Visual verification = a scripted browser on the dev server** — Decided (inherited, port updated)
  When UI work needs viewing/verifying live, drive the running Nuxt dev server
  (`npm run dev`, `localhost:3200`) with a scripted browser — screenshot the target
  routes, confirm HTTP 200 + zero console/page errors. Detail: `rules-front.md` §4.

- **D-front-015 · Six kinds: split Functional (reusable patterns) vs Dedicated (feature one-offs); one canonical modal** — Decided (inherited)
  **UI** = basic primitives only. **Functional** = reusable, composed patterns with
  behaviour (Alert/Confirm/Prompt/Wizard modals) — one canonical each, flat in
  `components/functional/`. **Dedicated** = feature one-offs (`WeekGrid`,
  `ThemeBacklog`, `TaskCard`), feature-sliced. **Layout** owns the one modal frame:
  `ModalShell` — hand-rolling a modal is a rule violation. Detail: `rules-front.md` §5.

- **D-front-016 · Async UX: pending-status as a prop; primitives render busy; pessimistic for critical writes** — Decided (inherited)
  A request's **pending/error status is data owned by the store** (keyed by action/id)
  and passed to pure components as **props**. Rendered via primitives: `Panel busy` and
  `Button loading`; never hand-rolled. Irreversible/critical writes (delete a Theme,
  complete a Task) are **pessimistic**; drag-and-drop onto the week grid is a
  reasonable place for optimistic updates given a cheap, visible revert. Detail:
  `rules-front.md` §6.

- **D-front-017 · Error-reporting ownership declared by the caller** — Decided (inherited)
  When a page fires a store action off a component's intent event, it declares **who
  surfaces the failure**: centrally (a global modal/toast) or returned to the caller
  for local/inline display — `modalOnError: boolean`, default `true`. The fetcher logs
  centrally regardless. Detail: `rules-front.md` §6.

- **D-front-018 · Dedicated components may bind the feature store directly; Functional stay pure** — Decided (inherited)
  Functional components stay **pure** — props in / events out. Dedicated components
  **MAY** call `use<Feature>()` and bind it via `v-model` / call its actions. Domain
  state still lives **only** in the store. Detail: `rules-front.md` §6.

- **D-front-019 · Front auth is L3 (BFF), not OIDC-PKCE-direct** — Decided (inherited)
  The front renders its **own** login and calls the `back/` **BFF** — Zitadel's hosted
  UI is never used; the front never mints/stores tokens directly (access JWT in Pinia,
  refresh via httpOnly cookie). Applies unchanged here — same shared Zitadel instance,
  same BFF pattern, this project's own org.

- **D-front-021 · Dedicated "helpers/" subfolder for private, single-use sub-parts** — Decided (inherited)
  A dedicated component may break out a **feature-local sub-component that will never
  be reused** into `components/dedicated/<feature>/helpers/`. Not registered in the
  `/components` galleries. Detail: `rules-front.md` §5.

- **D-front-022 · Page-guard: need-to-know nav is page-metadata driven (LINK → PAGE → RIGHT)** — Decided (inherited)
  Each `/app/**` page declares its own nav + required right in `definePageMeta`. The
  sidebar (`useAppNav`) derives its items from the same declaration the `auth`
  middleware guards against, so they can't drift. Detail: `rules-front.md` §11.

- **D-front-023 · Derived landing: rights decide every destination; no hardcoded home** — Decided (inherited)
  Nobody is routed to a page their rights don't allow — including defaults. The landing
  is derived in one place from the same rights the sidebar uses, terminating at a
  named "nothing for you here" stage rather than a blank/broken screen.

- **D-front-027 · PUBLIC routes are server-rendered; the SIGNED-IN app is not — and a 404 under `/app` is a PLASTIC one, deliberately** — Decided (inherited)
  `routeRules: { ssr: false }` on `/app/**` is the SPA fallback that lets a bookmarked
  or shared week-view URL always land on a working page, even cold with no session.
  The trade: `/app/<nonsense>` answers 200 with the shell, then shows a client-side
  not-found — a *plastic 404*, correct to the person, 200 to the machine. Public
  routes keep genuine HTTP 404s. Detail: `rules-front.md` §13.

- **D-front-028 · OPEN (inherited, unresolved) — asset-shaped paths under `/app` (`/app/anything.js`) answer 200 with HTML** — Investigated in co-sy-v2 · **OPEN**
  Same SPA-fallback mechanism as D-front-027 means a request that looks like a static
  file also gets the shell back rather than a 404. The fix would need a Nitro server
  middleware doing an **extension allowlist** (never a bare "any dot" test, since
  free-form id routes may legitimately contain a dot). Not built in co-sy-v2; carried
  here as a known, low-priority gap rather than re-investigated from scratch — revisit
  if it ever actually confuses a crawler or a tool that matters.

---

## New for this project

- **D-front-029 · Art-paper / watercolor design direction, and the TeuxDeux-style weekly-planner UI shape** — Decided 2026-09-01
  This project's founding front-end decision, distinct from co-sy-v2's admin-dashboard
  look: the visual language is **art-paper / watercolor** — warm paper-neutral
  backgrounds, ink-toned text, soft wash colours (not flat corporate hues) for
  distinguishing life-Themes, generous whitespace, and a hand-made rather than
  enterprise-software feel. This is a from-scratch token set on `/components/style-guide`,
  not a re-skin of co-sy-v2's tokens.

  The information architecture: a **Theme** (a life-area — e.g. "Health", "Work",
  "Home") holds a **backlog** of Tasks that have no scheduled day yet. The main
  screen is a **Mon–Sun week grid**, each day split into **morning / afternoon /
  evening** dayparts, with **two weeks visible simultaneously** (this week + next),
  echoing TeuxDeux's paper-planner metaphor rather than a calendar-app metaphor. A
  Task moves from a Theme's backlog onto a grid cell by drag-and-drop (§6, touch
  target rules in `rules-front.md` §3). This shape — Theme → backlog → drag onto
  dayparted week grid — is the single organizing idea of the front end and every
  other UI decision (component taxonomy, state shape, touch targets) serves it.

  **Why not co-sy-v2's design system as-is:** co-sy-v2 is a document/agreements
  product for organisations; its dark, control-dense admin surface is wrong for a
  personal weekly-planning tool meant to feel calm and physical. The *mechanism*
  (tokens → gallery → components, D-front-015, the async/touch/nav rules) transfers
  wholesale; the *values* do not.
