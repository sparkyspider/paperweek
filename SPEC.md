# Productivity Tools — Spec

A TeuxDeux-inspired weekly planner. Google Calendar felt messy; this is the calm alternative — a pretty, art-paper week view with life-theme task backlogs. Fun, but by no means messy.

## Users

- Mark (mark@flyh2.com) and Tarryn — each with their **own** themes and tasks (per-user data, single Zitadel org "Productivity").
- AI agents are first-class users: a `prod-agent` service account can call the NestJS API directly (with `X-On-Behalf-Of`) to manage themes/tasks on a person's behalf. See `AGENTS.md`.

## Core concepts

- **Life-themes** — user-defined, not hardcoded. Mark's seeded set: FlyH2, Co-Sy, Positive Polar, RT7 Digital, Life Balance, Admin, Personal. Add / remove / rename — but *softly*: archive with undo, never hard delete.
- **Theme taxonomy philosophy**: a theme earns its lane when it competes for the week's attention. Exactly **one** friction-free catch-all (Personal) — never several fuzzy buckets. Admin absorbs Budgets & Tax. Findhorn work lives inside Co-Sy until big enough to promote (promotion is cheap: themes are just a field on tasks). Cross-cutting concerns use a free-form `#hashtag` convention in task titles — no schema, no obligation, searchable.
- **Theme backlogs** — tasks live under a theme in the left sidebar until you're ready, then get **pulled (dragged) into the week**.
- **Dayparts, not timeslots** — tasks aren't time-bound. Each day offers lines for **Morning / Afternoon / Evening / Notes**.

## The day-strip view (v2 — replaced the two-week grid)

- **One endless horizontal strip of day cards** — flick/scroll left and right to move nearer or further into the future (and back into the recent past). Starts on today; a "Today" affordance jumps back.
- Day cards take the **full vertical height**. Generous width — never squashed.
- Each card has four sections: Morning, Afternoon, Evening, Notes. **Section headings take no vertical space**: big, right-aligned, faint watermark text that content is written *over* — after a day of use you know which section is which.
- No "Add a task" labels: each section shows a few **faint ruled lines**, like a paper diary — click a line and write on it. Task writing uses the handwriting font (Architects Daughter).
- Weekends are ordinary cards, subtly tinted (no collapsing in the strip).
- Today is softly highlighted.
- The header shows who's signed in by name — never a literal "You".

## The governing principle: it IS paper

The UI looks and feels like writing on paper. When something is written, it's on a line. When something is added, it's written on a line. **There are no checkboxes, no chips, no boxes around tasks, no buttons-per-task** — task text is handwriting sitting directly on a ruled line. Completing a task = crossing it out: click/tap the written words and an ink strikethrough draws through them (click again to un-cross). Typing on an empty line writes and autosaves — no Add button. Every control that can be a paper gesture should be one; UI chrome that paper doesn't have must justify itself.

**Two voices** (ruled 2026-09-01): the page has a stationer's voice — everything pre-printed (ruling, dates, structural labels → Lora serif / Inter) — and a writer's voice — everything the user writes (tasks, notes, theme names → Caveat). Day names are a deliberate exception: technically pre-printed, kept handwritten as v1's signature.

**Filters and the capture/placement rule** (ruled 2026-09-01): a theme's swatch toggles its visibility — a per-browser view filter (localStorage). Capture never changes visibility (typing into a muted theme's backlog leaves it muted); placement always does (scheduling a muted theme's task onto the week auto-unmutes it). **Residue rule**: when a muted theme has tasks already scheduled on the week, their lines are not blanked — each keeps its ghosted margin dot (no text, line not writable) so absence reads as "filtered", never as "gone". Silent absence is forbidden anywhere in the app.

Refinement (ruled 2026-09-01): the ban is on **permanent** chrome, not on affordances. Faint ink glyphs (the `×` to delete, the `✎` to edit) may appear **only under the hand that's already reaching** — hover-revealed, at the end of the line, gone otherwise. The gesture budget: the commonest action gets the cheapest gesture (click = cross out), and every state carries the minimum signals that make it unambiguous.

## Look & feel

Art paper: slight parchment warmth (TeuxDeux-like), watercolor/gouache accents. Watercolor blob swatches per theme, hand-lettered display type (Caveat/Kalam-style) over a clean body font, gouache-pen underlines, subtle paper grain. Elegant and calm — not cartoonish, not cluttered.

## Stack

Nuxt 4 + Vue 3.5 + Tailwind 4 (front, port **3200**) · NestJS 11 + Prisma 6 + PostgreSQL (back, port **3201**, database `productivity`)

> Ports 3100/3101 are RESERVED by the co-sy-v2 "board" launchd services (`org.co-sy.board-web`/`board-api` in `~/Library/LaunchAgents`) — never use or kill them. Co-sy's port allocator also owns 3010–3099. This app lives on 3200/3201. · Zitadel OIDC login (shared local instance from co-sy-v2, `http://localhost:8080`, own org "Productivity"). Plumbing inherited from co-sy-v2 — see `CLAUDE.md` for rules/architecture/decisions.

## Soft-delete philosophy

Everything user-created (themes, tasks) is soft-deleted/archived with undo. Agents may change themes/tasks via the DB or (preferably) the API — never destructively.
