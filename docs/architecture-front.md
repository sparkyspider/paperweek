# Architecture: Frontend (`front/`)

**The WHAT** — the shape of the Nuxt frontend. Read this to understand it, then
follow `rules-front.md` (HOW). Why: `decisions-front.md`. Read
[`architecture-system.md`](architecture-system.md) first.

**KEEP TERSE.** A map. Structure once; constraints live in `rules-front.md`, signposted.

---

## Model

Nuxt 4 (Vue 3, TS strict, Tailwind v4), dev/prod on port **3200**. One product surface:
the **planner app** — a TeuxDeux-style weekly view. Life-**Themes** hold a backlog of
**Tasks**; tasks are dragged from the backlog onto a Mon–Sun week grid split into
morning/afternoon/evening dayparts, two weeks visible at once. No public/marketing
surface beyond login — this is a personal-productivity tool, not a multi-tenant SaaS.

## Rendering split — the signed-in app is not server-rendered

One line in `nuxt.config.ts` divides the front end in two, inherited from co-sy-v2
because the reasoning still holds exactly:

```
routeRules: { '/app/**': { ssr: false } }     everything under /app is a client-rendered SPA
                                              every other route (login, errors) is server-rendered
```

The signed-in app is gated by a **client-side** session (the `auth` middleware reads the
Pinia store), so the server cannot know who the caller is; rendering it server-side and
then redirecting in the browser produces a hydration mismatch — and caching a rendered
authed page risks serving one person's week to another. Public routes have no such
problem and keep SSR.

**The consequence.** A dead PUBLIC address is a genuine HTTP **404**. A dead address
**under `/app`** answers **200** carrying the app shell, and only then shows the
not-found page — deliberate: `ssr: false` makes `/app/**` an SPA fallback, so every
direct URL under it (a bookmarked `/app/week/2026-09-07`, say) serves the shell. Under
`/app` the not-found is therefore *plastic*: correct to the person, 200 to the machine
(`rules-front.md` §13).

## The error surface

`app/error.vue` is the **single branded error screen** — one file, no plugin, no route,
no feature flag. Nuxt raises every unmatched route through its own internal catch-all
and hands it to this component. It assumes **no session** (reads no store, calls no
API) and offers a way on as a button to `/`, never a redirect.

## Building blocks & layering

```
pages/<feature>/         routed screens (Nuxt autorouting)
  └─ dedicated/<feature>/ the feature's one-off work (e.g. WeekGrid, ThemeBacklog);
                          exports an agent-tooling descriptor where one is built
       └─ functional      reusable composed patterns (Alert/Confirm/Prompt/Wizard modals)
            └─ layout      places/centres/overlays; the ModalShell frame
                 └─ ui     basic primitives: buttons, fields, badges, pills, stepper
                 └─ icon   single-glyph SVGs
composables/<feature>/   reactive logic
api layer (typed)        single $fetch/composable wrapper → back over HTTP
```

Six component kinds kept in separate homes; feature-sliced one-folder-per-feature for
`pages/`, `dedicated/`, `composables/`. UI/layout/functional/icon are feature-agnostic
and flat. The taxonomy + folder map is the enforceable home in `rules-front.md` §5.

**State flow:** `page → Pinia store (feature model + actions) → dedicated component
(props/events) → ui widget`. Domain state lives in the store, not the component; the
typed API layer is the only fetch site. Mock-first: `useXDemo` (fixtures) vs `useX`
(typed API), same shape, swap to go live. **Async status flows down as props**
(store-owned, keyed by action → `Panel.busy`/`Button.loading`); the action call
**carries an error-report directive up** (central modal vs local display). Rule:
`rules-front.md` §6 (D-front-011/016/017).

## Design system

Tokens (`app/assets/css/main.css`) + component registry (`/components/ui`) + patterns
(`/components/style-guide`) are the single source of truth, read in **code**. Any UI reuses the
registry first, else builds on tokens, else extends the system first (`rules-front.md` §4).
The visual language is **art-paper / watercolor** (D-front-029) — this project's own token
values, not co-sy-v2's admin-dashboard look, even though the mechanism (tokens → gallery →
components) is the same.

**Two floors are global, not per-component**, and both live at the end of `main.css` under
`@media (pointer: coarse)` — a finger, never a mouse: text inputs get a **16px** minimum
(below it iOS Safari zooms the whole page on focus), and anything tappable gets a **44×44px**
minimum target. Both matter more than usual here — dragging a task card between dayparts is a
touch-first interaction. Both grow the BOX and leave the type alone, so a component never has
to remember either one.

## Boundaries

- Backend access only via the typed API layer, base URL from env — no hard-coded
  URLs, no direct DB/back internals (`rules-front.md` §7).
- Auth = **L3** (D-auth pattern, inherited): the front renders its own login and calls the
  `back/` **BFF** (never Zitadel directly); access JWT in Pinia, refresh via httpOnly
  cookie (`rules-front.md` §8).

## Navigation & landing (need-to-know, derived)

One derivation drives three consumers (D-front-022/023): each page declares its own
`requiredRole` (+ optional `navLabel`) in `definePageMeta` — the sidebar (`useAppNav`)
lists only pages the caller's rights allow; the `auth` middleware filters access to the
same rule; and the post-login landing resolves intended-route → first-allowed-page →
a terminal stage. There is NO hardcoded home — what a user sees, where they land, and
what the menu shows all derive from the same rights. The role model is intentionally
small (`user`, `agent` — `rules-users.md`), so this machinery is mostly future-proofing
against the app growing more than a load-bearing need today; it's kept because it's
cheap and prevents menu/access drift. The page filter is UX; the back independently
guards every endpoint.
