---
name: view-website
description: >
  Use when you need to actually SEE or READ a web page — the running Paperweek app
  (ports 3200/3201) or a local HTML file — and describe or learn from it. Drives Chromium
  headless via Playwright to (a) screenshot the page, and (b) extract its RENDERED content
  after JS runs: the full DOM HTML and the visible page text. Reports HTTP status + console/page
  errors. For authenticated pages, use login.mjs/authed-shot.mjs (credentials at
  auth/.machinekey/mark-initial-password.txt). This is Paperweek's standard visual-verification
  path.
allowed-tools: Bash, Read, Write
---

# view-website — see & read a page with Playwright (Chromium)

Use this whenever the goal is to **look at or extract** something rendered in a browser
and tell the user what's there: reviewing the Paperweek UI, verifying a change rendered,
or studying a local prototype before rebuilding it. You drive **headless Chromium via
Playwright** and can hand back any of three things about the *rendered* page (after its
JS has run):

- a **screenshot** (`shot.mjs`) — what it looks like;
- the **rendered DOM HTML** (`read.mjs`) — the real markup Nuxt/Vue produced, not the
  raw source file (useful for learning structure/classes/copy);
- the **visible page text** (`read.mjs`) — the whole page as plain text.

For authenticated pages (the planner, settings, etc.), use `authed-shot.mjs` after
logging in with your credentials (stored at `auth/.machinekey/mark-initial-password.txt`).

## When to reach for it

- "Show me / what does X look like" for any URL, the Paperweek app, or local `.html`.
- Verify a front-end change renders (part of QA).
- Screenshot authenticated pages of the running Paperweek app (ports 3200/3201).
- Study a reference design or prototype before building.

## One-time setup (first run only)

Playwright + a Chromium build live inside this skill folder (gitignored). Install once:

```bash
cd /Users/sparkyspider/IdeaProjects/productivity-tools/.claude/skills/view-website
npm install
npx playwright install chromium
```

If the Chromium download is blocked by a TLS-inspecting network, retry, or set
`PLAYWRIGHT_DOWNLOAD_HOST` / use a system Chrome via `channel: 'chrome'` in `shot.mjs`.

## Capturing a page

`shot.mjs` opens one URL, screenshots it, and prints a JSON summary (final URL, HTTP
status, console errors/warnings, page errors, title, screenshot path).

```bash
cd /Users/sparkyspider/IdeaProjects/productivity-tools/.claude/skills/view-website
# the Paperweek login page (ungated, no auth needed):
node shot.mjs http://localhost:3200/login
# a local HTML file — pass an absolute path OR a file:// URL:
node shot.mjs ~/path/to/prototype.html
# custom output path + viewport:
node shot.mjs <url> /path/out.png --width 1440 --height 3000
```

Options: `--width` / `--height` (viewport, default 1440×2000), `--full` off with
`--no-full` (default captures the full scrollable page), `--wait <ms>` extra settle
time. Output PNG defaults to `./shot.png` in this folder — pass a second arg to place
it in the scratchpad or a task folder instead.

## Capturing an authenticated page

`authed-shot.mjs` logs in using the credentials from CLI args, then navigates to a
given authenticated route and screenshots it. It drives the real UI (fills the form,
submits, waits for navigation to the app) so that the Pinia auth store gets populated.

```bash
cd /Users/sparkyspider/IdeaProjects/productivity-tools/.claude/skills/view-website
# Screenshot the planner (/) as mark@flyh2.com:
node authed-shot.mjs mark@flyh2.com <password> / ./planner.png
# The password is stored at: auth/.machinekey/mark-initial-password.txt
```

Options: `--width` / `--height` (viewport, default 1440×2000), `--wait <ms>` extra
settle time. Output PNG defaults to `./authed-shot.png`.

## Reading a page (rendered HTML + text)

`read.mjs` loads the page, lets its JS run, then extracts the **rendered** DOM
(`page.content()`) and the **visible text** (`document.body.innerText`) — so you see
what the browser actually built, not the pre-hydration source. It writes files and
prints a JSON summary (status, title, byte/char sizes, paths, console/page errors).

```bash
cd /Users/sparkyspider/IdeaProjects/productivity-tools/.claude/skills/view-website
# write both page.html (rendered DOM) + page.txt (visible text) to the scratchpad:
node read.mjs http://localhost:3200/login /path/to/scratchpad/login
# just the rendered HTML file:
node read.mjs <url|path> <outBase> --html only
# just the text file:
node read.mjs <url|path> <outBase> --text only
# stream one straight to stdout (nothing written) — handy for a quick, small page:
node read.mjs <url|path> --stdout text
node read.mjs <url|path> --stdout html
```

Then **`Read` the written file** (`<outBase>.html` / `<outBase>.txt`) to inspect or
learn from it. `--wait <ms>` adds settle time for slow client rendering. Rendered HTML
can be large — prefer writing to a file over `--stdout html` unless the page is small.

## The loop (what you actually do)

1. Pick the tool for the question: **see it** → `shot.mjs` (PNG); **learn its
   structure / copy** → `read.mjs` (rendered HTML and/or text). You can run both.
2. **`Read` the output** — the PNG to see it, or the `.html` / `.txt` to inspect it —
   then **tell the user in prose what's there** (layout, sections, colours, components,
   copy, DOM structure). That description IS the success signal: the user confirms the
   skill works by hearing it.
3. When verifying **our own app**, also report the JSON: it passes only on **HTTP 200
   with zero console/page errors**. For a `file://` prototype, status is `null` (no HTTP)
   — that's expected; still surface any console/page errors.
4. Need another view (a sub-page, a different viewport, the text of a panel)? Re-run
   with different args. Don't over-explore — get what answers the question, then stop.

## Screenshots in task folders

Name screenshots using the convention `<number>-<description>.png` (e.g.
`1-login-form.png`, `2-planner-week-view.png`) and save them to task folders so
they appear in the task context. Keep ad-hoc screenshots in the session scratchpad.

## Known gotchas

- **fullPage + hasTouch**: If you use `--no-full` and see missing/wrong content near
  the bottom of a mobile viewport, the page might be responding to simulated touch
  events; re-run with `--full` or a taller `--height`.
- **30-second timeout**: Playwright has a 30s default timeout on navigation. If a page
  is slow, use `--wait <ms>` to add extra settle time after the page loads.

Keep screenshots out of the repo unless they belong to a task folder — default them to
the session scratchpad.
