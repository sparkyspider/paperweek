# Bold tasks become headings — prediction & evidence, 2026-09-10

Feature: a task with `bold = true` is a **heading**. It loses its theme dot entirely and wears
its theme colour as a watercolor highlighter wash behind the words. Put it in edit mode and one
dot comes back — the picker trigger, so a heading's theme can still be changed. No hierarchy: a
heading does not own the lines beneath it.

## The prediction

1. A bold line has **no dot** in backlog or grid; its text sits on a theme-colour highlight stroke.
2. **Plain lines under it keep their dots.**
3. **Cmd+B toggles the heading look live** (no reload).
4. **Clicking into a heading gives it back its theme control**; choosing a different theme
   recolours the highlight immediately, and in the backlog the task moves to that theme's card.
   (Originally written as "shows theme swatches"; Mark's ruling replaced the swatch row with one
   dot + the named picker — see the next section. The predicted *outcome* is unchanged.)

## How it was run

`rig/headings-evidence.mjs`:

```
node docs/process/evidence/headings-2026-09-10/rig/headings-evidence.mjs mark@flyh2.com <password>
```

(It imports Playwright by path from the view-website skill's `node_modules`, so it runs from
anywhere.)

It logs in through the real form, creates **two throwaway themes (HDG A / HDG B)**, does all the
work inside them, and removes them afterwards. Every reading below is a live DOM measurement
(`querySelector` for `.line-dot` / `.wash-highlight`, `getComputedStyle(...).getPropertyValue('--wash')`)
taken beside the screenshot, not read off the picture.

**Why throwaway themes:** an earlier version of this rig drove Mark's own theme cards and, through
the bug recorded at the bottom of this file, renamed one of his real tasks. See **Incident**.

## The edit-mode gesture (Mark's ruling, 2026-09-10 — `RULINGS.md`)

The first build put a row of one-circle-per-theme swatches beside the input. Mark's call:

> I'd prefer that there is 1 dot in bold edit mode and the same drop-down. One may end up with
> too many dots. And it's hard to see the difference in colours between light pastel colours in a
> small dot. So the labels are useful.

Built as ruled: **no swatch row**. A heading in edit mode shows **exactly ONE dot** in its theme
colour, in the ordinary place — inline in the backlog, on the line in the grid — and clicking it
opens the **same swatch + NAME picker** the day card's margin dot opens. Resting heading unchanged
(no dot, wash only). Plain lines unchanged.

That popover was lifted out of `DaySection.vue` into `shared/ThemePickerPopover.vue` so both dots
drive one implementation.

## Does it hold? — per screenshot

| # | Screenshot | What it shows | Holds? |
|---|---|---|---|
| 1 | `1-backlog-heading-no-dot.png` | HDG A backlog: **"Week ahead"** bold, no inline dot, on a pale-blue wash; the two plain lines beneath each keep their dot | **YES** — prediction 1 + 2 |
| 2 | `2-grid-heading-no-margin-dot.png` | Friday 11 Sep, Morning: **"Morning block"** bold, **no margin dot**, on the wash; "Read the KIPP draft" and "Reply to Hugo" below with dots | **YES** — prediction 1 + 2 |
| 3 | `3-edit-mode-one-dot.png` | Backlog heading in edit mode: **exactly one** dot in HDG A's blue, then the input on its wash | **YES** — prediction 4 (first half), as ruled |
| 3b | `3b-backlog-picker-open-with-names.png` | That dot clicked: the picker, **eleven named options**, HDG A marked `aria-selected` | **YES** |
| 4 | `4-after-pick-recoloured-moved.png` | After picking HDG B: **the heading is on the HDG B card**, wash recoloured terracotta, no dot at rest | **YES** — prediction 4 (second half) |
| 4b | `4b-source-card-after-move.png` | HDG A after the move: heading gone, two plain lines intact, **no orphaned input** | **YES** |
| 6 | `6-cmdb-live-toggle-on.png` | "Reply to Hugo" after one Cmd+B, no reload: dot gone, wash present | **YES** — prediction 3 |
| 7 | `7-grid-edit-one-dot.png` | Grid heading in edit mode: one dot, **at the same x as the plain rows' margin dots** below it | **YES** |
| 7b | `7b-grid-picker-open-with-names.png` | Same named picker off the grid heading's dot | **YES** |
| 8 | `8-grid-after-pick-recoloured.png` | Grid heading after picking HDG B: recoloured **in place** (a scheduled task does not move) | **YES** |
| 9 | `9-dirty-title-survives-retheme.png` | Typed " (revised)", then picked: **"Week ahead (revised)"** landed in HDG A, appended at the END of that backlog | **YES** |
| 9b | `9b-picker-flips-above-near-foot.png` | The same picker opened from a dot near the foot of the window: it **flips above** the dot instead of running off-screen | **YES** — see the fix below |
| 5 | `5-full-page-after.png` | Whole page, for context | — |

Every screenshot above was opened and looked at, not just generated.

## The measurements beside the pictures

```
GRID ROWS (Fri 11 Sep):
  {"txt":"Morning block",      "marginDot":false, "wash":true,  "washColor":"#8fc1e3"}
  {"txt":"Read the KIPP draft","marginDot":true,  "wash":false, "washColor":null}
  {"txt":"Reply to Hugo",      "marginDot":true,  "wash":false, "washColor":null}

CMD+B "Reply to Hugo":
  before      = {"marginDot":true,  "wash":false, "washColor":null}
  after 250ms = {"marginDot":false, "wash":true,  "washColor":"#8fc1e3"}    (no reload)
  Cmd+B again = {"marginDot":true,  "wash":false, "washColor":null}

PLAIN task in edit mode: {"inputs":1,"textSpans":0,"dots":1}      (regression guard, see below)

GRID heading in edit mode:    1 dot(s), title="HDG A"
BACKLOG heading in edit mode: 1 dot(s), title="HDG A"

picker open (both surfaces):
  options  = ["FlyH2","Co-Sy","Positive Polar","RT7 Digital","Life Balance","Admin",
              "Personal","Sport","Findhorn","HDG A","HDG B"]
  selected = ["HDG A"]     onScreen = true

GRID after picking: {"marginDot":false,"wash":true,"washColor":"#cf8a6a","inputLeftBehind":false}

BACKLOG ROWS:
  {"txt":"Week ahead",               "inlineDot":false, "wash":true,  "washColor":"#8fc1e3"}
  {"txt":"Draft the Findhorn note",  "inlineDot":true,  "wash":false, "washColor":null}
  {"txt":"Call back about the venue","inlineDot":true,  "wash":false, "washColor":null}

AFTER BACKLOG PICK:
  headingInA=null  headingInB={"wash":true,"washColor":"#cf8a6a","inlineDot":false}
  inputsInA=0  inputsInB=0  activeElement=BODY
  titlesA=["Draft the Findhorn note","Call back about the venue"]   titlesB=["Week ahead"]

dirty-title dot rect: {"top":1373,"left":32,"w":20,"h":20,"viewportH":1500,"inView":true}
picker flip check:    {"top":1093,"bottom":1365,"viewportH":1500,"fullyOnScreen":true}
DIRTY-TITLE + PICK:   {"landedIn":"HDG A","text":"Week ahead (revised)","washColor":"#8fc1e3",
                       "titles":["Draft the Findhorn note","Call back about the venue",
                                 "Week ahead (revised)"]}
```

Console/page errors: `pageErrors: []`; the only console error is the pre-existing
`401 (Unauthorized)` from the session probe before login, identical on a baseline screenshot
taken before any of this work.

## Two more things the swatch-row removal turned up

- **A broken `v-if`/`v-else` chain.** The swatch-row markup sat *between* the `v-if="editing"`
  input and its `v-else` text span, which silently severed the chain: a PLAIN task in edit mode
  rendered the input **and** the text span at once. Restoring the adjacency fixed it, and the rig
  now asserts it every run — `{"inputs":1,"textSpans":0,"dots":1}`.
- **The picker could open off the bottom of the window.** It is `position: fixed`, so a list that
  overflows the viewport foot cannot be scrolled to — its lower options are simply unreachable. A
  latent flaw in the original margin-dot picker, hit for real once a heading's own dot could sit
  near the foot of a long sidebar. `ThemePickerPopover` now measures itself and flips above the
  trigger (and clamps horizontally). Proven: dot at y=1373 in a 1500px viewport, panel placed
  1093–1365, `fullyOnScreen: true`.

## Incident: the rig renamed one of Mark's real tasks

**What happened.** While verifying, the rig drove the real sidebar cards. One RT7 Digital backlog
task — `6b8abb26-8408-46d0-a729-ce221f08cc44`, **"Staging Components?"**, created 2026-09-03
11:49:16, position 1 — was renamed to **"Week ahead (revised)"** and then soft-deleted by the
rig's own cleanup (which matched on that title). It is the ONLY pre-existing row that was touched;
a full `updated_at` sweep over the working window shows every other changed row was created by
the rig itself.

**Why.** `TaskChip` is mounted per line SLOT, not per task — both parents key the ruled line by
`slot.index` and hand the component whichever task currently occupies that slot. Re-theming a
backlog task reshuffles both lists, so the task under an already-open editor can change identity
while `draft` still holds the text typed for the previous one; the commit then wrote those words
onto the new occupant's record. The reshuffle itself was made much more likely by the second bug
below.

**Fixed, both halves:**
- `TaskChip.vue` — an `editingTaskId` captured at `startEdit`, a `watch` on `props.task.id` that
  closes the editor the moment the row changes identity, and an owner check in `commitEdit` and
  `pickTheme` that drops a stale draft rather than writing it somewhere wrong.
- `stores/tasks.ts` `setTheme` — a re-themed BACKLOG task is now appended to the END of the
  destination backlog. `position` is a line-SLOT index within one list, so carrying it across
  themes landed the task on an already-occupied slot; duplicate slots tip that whole list out of
  the slot model into `useAutosaveLines`' legacy dense fallback, which silently re-orders every
  row in it. A scheduled task keeps its position (its slot belongs to a day cell).
- `TaskChip.vue` — `@click.stop` on the swatch. Without it the click bubbled to `.ruled-line`,
  whose handler writes a new draft onto any slot that is currently empty; re-theming empties that
  very slot, and a microtask checkpoint runs between listeners, so Vue had already re-bound the
  row's handler by the time the same click reached it. Measured: the source card was left holding
  one focused, empty `.diary-input`. Now `inputsInA=0, activeElement=BODY`.

The re-verification above then ran entirely inside throwaway themes and touched **zero**
pre-existing rows (confirmed by `updated_at` sweep after the run).

**NOT YET RESTORED — needs Mark.** Restoring the row needs a direct DB write, which this session
is not permitted to make. One statement:

```sql
UPDATE task
   SET title = 'Staging Components?', deleted_at = NULL,
       updated_at = '2026-09-03 11:49:16.972'
 WHERE id = '6b8abb26-8408-46d0-a729-ce221f08cc44';
```

(The title is inferred with high confidence: the pre-work baseline screenshot shows RT7 Digital's
backlog as *Make an appointment w… / Staging Components? / Test Mode? / Onno's Email*, and this is
the only RT7 backlog row at position 1, created between its two neighbours at 11:47 and 11:49:19.)

## Things decided here, worth a second opinion

- **The wash is drawn on the words, not the line.** A `::before` behind the text with an
  off-axis gradient that fades at both ends, an asymmetric elliptical `border-radius`, and half a
  degree of rotation — no SVG, no filter, no extra element. Vertical extent is deliberately tiny
  because `.ruled-line` clips to one grid unit.
- **A pale theme colour makes a pale wash.** HDG A's `#8fc1e3` reads clearly; the mint
  `#C7EDE4` of Positive Polar is very faint on cream. The wash is a fixed percentage of the
  theme's own colour, so a pale theme gets a pale heading. Raising the opacity for everyone would
  make the strong themes shout.
- **While the input is open the wash fills the whole input box**, which is wider than the resting
  wash around the words. An `<input>` cannot carry a reliable pseudo-element, so the stroke is
  painted as its own background. It snaps back on commit. (Mark has already called this fine.)
- **Entering edit mode shifts a heading's text right by the dot's width.** Unavoidable given the
  ruling: a resting heading has no dot, an edited one does. In the GRID the dot lands exactly where
  the plain rows' margin dots are. In the BACKLOG the painted circle sits ~7px right of where the
  plain rows' inline dots sit, because the edit dot is the day card's `.line-dot` (a 6px circle
  centred in a 20px hit box) while a plain backlog row uses a bare 6px span. Using one control in
  both places was the deliberate trade — same gesture, same hit area, one implementation — but the
  7px is visible if you look for it.
- **A muted theme's scheduled task keeps its ghost dot even when bold** — it renders no text at
  all, so the dot is its only remaining trace.
