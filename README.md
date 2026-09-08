# 🏆 WAY TO OSCAR — Command Center

A cinematic, dark, zero-dependency web app for Robin Lohnke's ("Lohro") road to the Oscars.
Built for Kollektiv Oskar — Robin, Simon & Jasmin.

**Two tracks, one goal:**
- **Track A** — festival short films + mentors → Oscar-qualifying festival win → shortlist
- **Track B** — personal brand (YouTube "Way to Oscar", Instagram @lohro) → 1M followers

## What's inside

| View | What it does |
|---|---|
| **Dashboard** | Live countdown to the Oscar target date, Instagram/YouTube follower tracker with 1M-goal projection, milestones for both tracks, next festival deadlines, strategy briefing distilled from the Notion master plan |
| **Daily Challenge** | Day-by-day board for the daily-short-film challenge (starts **15 July 2026**): title, idea, status, link, learnings per day. Streak, hit-rate and learnings log |
| **Festivals** | Database of Oscar-qualifying short film festivals (researched July 2026) with deadlines calendar, fees, premiere rules, and your per-festival submission plan |
| **Ideas** | Idea vault imported from the Notion Second Brain + Ideen-Schrank, searchable, filterable, extendable |
| **Projects** | Everything from the Notion video/YouTube pipelines: short films, features, reels, YouTube episodes |
| **Brain** | The team backend: **Brand Core** (values, do's & don'ts, CTA strategy, brand assets, team playbook — editable), **Knowledge** (searchable base from the ChatGPT export) and **Meetings & Reports** (paste meeting transcripts, one-click weekly report for the Robin+Simon meeting) |
| **Brain-Telefon** | Voice call with the CLAUDE BRAIN: tap, speak (Swiss German ok), Claude searches the Dropbox brain and answers out loud; Basis tier needs no keys, Pro tier (Whisper + ElevenLabs) via Settings |
| **Data & Settings** | Export/Import for the Dropbox team workflow, goal settings, reset, optional Brain-Telefon keys (browser-only) |

## Run it

No build, no install, no server needed:

1. **Double-click `index.html`** — works straight from disk (also from a Dropbox folder), or
2. **single file:** `dist/way-to-oscar.html` is the whole app (CSS, JS, all data) in ONE file — the easiest thing to drop into Dropbox and share, or
3. serve it locally for a nicer URL: `npx serve .` or `python3 -m http.server 8080` → http://localhost:8080

Rebuild the single file after changes: `python3 scripts/build-standalone.py`

Everything is plain HTML/CSS/JS. Works on desktop and mobile browsers.

## Deploy (optional)

The repo is a static site — deploy the folder as-is:

- **GitHub Pages:** Settings → Pages → deploy from branch → done.
- **Netlify / Vercel / Cloudflare Pages:** point at the repo, no build command, publish directory = root.
- **Dropbox only:** skip deploying entirely; the app runs from the shared folder (see below).

## Team workflow via Dropbox (Simon + Jasmin)

**Team folder:** `Kollektiv Oskar Dropbox/KOLLEKTIV OSKAR/CLAUDE BRAIN/` — this is where the app file (`way-to-oscar.html`), data exports, weekly reports and meeting transcripts live.

Your edits are saved automatically in the **browser's localStorage** — per person, per browser. To share state through the team Dropbox:

1. Put this whole app folder into the team Dropbox (or just share the data files).
2. When you finish a work session: **Data & Settings → Export data file** → save `way-to-oscar-data-YYYY-MM-DD.json` into the Dropbox folder.
3. Simon/Jasmin open the app (same folder), click **Import (replace)** and pick the newest file. They now see your exact state.
4. If two people edited in parallel: use **Import (merge)** instead — items are merged by id and the newer edit wins, nothing is silently lost.
5. Agree on a simple rule: *always export after editing, always import before editing.*

## Data & maintenance

- Canonical seed data lives in `data/*.json`:
  - `notion-ideas.json` — ideas exported from Notion (Second Brain + Ideen-Schrank)
  - `notion-projects.json`, `notion-youtube.json`, `notion-films.json` — the Notion pipelines
  - `festivals.json` — festival database incl. Academy rules (researched July 2026)
  - `strategy.json` — distilled master-plan strategy shown on the dashboard
  - `notion-masterplan.md` — human-readable digest of the Notion master plan
- The app loads seed data from `data/seed.js` (generated). After editing any JSON:
  `python3 scripts/build-seed.py`
- **Festival deadlines:** entries marked `est.` were extrapolated from the previous edition. **Re-verify every deadline on the festival's own site ~3 months before submitting.** The Academy's qualifying festival list changes yearly — check oscars.org each season.
- The seed is only applied on first launch (or after **Reset to seed data**). Your local edits always win afterwards.

## Testing

`node scratchpad/smoke-test.mjs` style Playwright checks were run during development (all routes, CRUD, export, persistence). To re-run manually, open the app and try: add follower point → reload (persists), log a challenge day, export → import in a private window.

## Architecture (short)

- Zero-build static app, classic script tags — works via `file://` so it runs straight from Dropbox (see `DECISIONS.md` for all decisions and trade-offs).
- State: single object in localStorage; export = versioned JSON snapshot; merge = per-item, newest-`updatedAt`-wins.
- No external requests, no fonts, no CDN — fully offline-capable and private.
