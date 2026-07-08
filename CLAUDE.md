# WAY TO OSCAR Command Center — instructions for Claude

This repo is Robin Lohnke's ("Lohro", Kollektiv Oskar, St. Gallen) command center
on his road to winning an Oscar. Zero-build static web app: open `index.html` or
the single-file build `dist/way-to-oscar.html` directly in a browser.

## What "Brain" means

When Robin says **"Brain"** (e.g. "leg das ins Brain", "schau im Brain nach",
"Brain durchsuchen"), he means the team knowledge backend of this app. It has
three parts:

| Part | Canonical data | In-app view |
|---|---|---|
| **Brand Core** (values, do's/don'ts, CTA strategy, assets, team playbook) | `data/brand.json` (seed) — user edits live in the app/exports | Brain → Brand Core |
| **Knowledge base** (mission, strategy, film craft, routines — from his ChatGPT export) | `data/knowledge.json`, original in `data/WAYTOOSCARKNOWLEDGE.pdf` | Brain → Knowledge |
| **Meetings & weekly reports** (transcripts, decisions, action items) | app localStorage → exported to `way-to-oscar-data-*.json` in the team Dropbox | Brain → Meetings |

Routing rules for Claude:
- "leg X ins Brain (Brand/Werte/CTA...)" → add/edit an entry in `data/brand.json`
  (stable `id`, correct `section`: core/values/dos/donts/cta/assets/team), then
  run `python3 scripts/build-seed.py && python3 scripts/build-standalone.py`.
- "leg dieses Wissen ab" → extend `data/knowledge.json` (same rebuild).
- Meeting transcripts: Robin pastes them into the app himself (Brain → Meetings
  → Add meeting). If he gives Claude a transcript to file, summarize it into
  decisions + action items and either update the exported JSON he provides, or
  store it as `data/meetings/YYYY-MM-DD-title.md` for the record.
- Weekly report: the app generates it locally (Brain → Meetings → Generate
  weekly report) at zero cost. Only involve Claude for analysis on top.

## Be credit-efficient

- **Never read `data/seed.js` or `dist/way-to-oscar.html`** — they are generated
  (200–300 KB). Canonical data is the small JSONs in `data/`.
- Grep the specific file (`data/brand.json`, `data/knowledge.json`,
  `data/festivals.json`, `data/strategy.json`) instead of reading everything.
- `data/notion-ideas.json` / `notion-projects.json` are large snapshots — grep,
  don't full-read.
- After any `data/*.json` edit: `python3 scripts/build-seed.py` then
  `python3 scripts/build-standalone.py` (build fails loudly if inlining breaks).

## Architecture (short)

- Classic-script SPA (works via `file://`), hash routes: dashboard, challenge,
  festivals, ideas, projects, brain, settings. Views in `js/*.js`, store in
  `js/store.js` (localStorage + JSON export/import with per-item merge).
- User data collections are declared in `ID_COLLECTIONS`/`KEYED_MAPS` in
  `js/store.js` — new collections must be added there or merges drop them.
- Design: dark cinematic, Oura-inspired (score rings, soft cards). Palette in
  `css/style.css` `:root`. UI English, Robin's content stays German.
- Decisions log: `DECISIONS.md`. Team workflow: `README.md`.

## Conventions

- Branch: work stays on `claude/oscar-command-center-gzj8uu` unless told otherwise.
- Test with Playwright (`/opt/pw-browsers/chromium`, file:// URLs) before pushing.
- Robin's tone: direct, German; answer him in German, keep the UI English.
