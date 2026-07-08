# DECISIONS.md — WAY TO OSCAR Command Center

Autonomous build session, 2026-07-07. All decisions made without user input, documented here.

## D1 — Zero-build static app (no framework, no bundler)
**Decision:** Plain HTML/CSS/JS, no React/Vite, no npm dependencies.
**Why:** The core requirement is team sharing via Dropbox. A zero-build app means Simon and Jasmin can double-click `index.html` straight from the Dropbox folder — no Node, no install, no build step, works on any machine. It also removes supply-chain/build breakage for years to come.
**Trade-off:** No component framework; mitigated by a small hand-rolled view/store architecture.

## D2 — Works via `file://` (no ES modules, no fetch for seed data)
**Decision:** Classic `<script>` tags (not `type="module"`), and seed data shipped as `data/seed.js` (a JS file assigning `window.SEED`) instead of fetched JSON.
**Why:** Browsers block ES-module imports and `fetch()` of local files under `file://`. Classic scripts + a JS seed file are the only patterns that work when the app is opened directly from disk (the Dropbox workflow).
**Note:** Canonical data lives in `data/*.json`; `scripts/build-seed.py` regenerates `data/seed.js` from them.

## D3 — localStorage as working store, JSON files as team exchange format
**Decision:** All edits persist to the browser's localStorage instantly. Export produces a single `way-to-oscar-data.json` snapshot (all collections + metadata); Import loads such a file and replaces or merges state.
**Why:** localStorage gives autosave without a server. The JSON snapshot is the Dropbox handoff artifact: Robin exports → drops the file in the team Dropbox → Simon/Jasmin import it (and vice versa).
**Merge semantics:** Import offers "Replace" (take file as truth) and "Merge" (union by id, newer `updatedAt` wins) so two people can work in parallel with minimal loss.

## D4 — Data collected from Notion is snapshotted, not synced
**Decision:** Notion content (ideas, video pipeline, YouTube pipeline) was extracted once into `data/notion-*.json` and baked into the seed. The app has no live Notion connection.
**Why:** A client-only static app cannot hold Notion credentials safely, and the session is time-boxed. The Ideas vault is fully editable in-app afterwards, so Notion remains the "inbox" and this app the working surface.

## D5 — Festival data: researched July 2026, estimates flagged
**Decision:** `data/festivals.json` contains ~15–20 Oscar-qualifying festivals with deadlines/fees researched via web. Where 2027 dates weren't announced yet, dates are extrapolated from the previous edition and flagged `estimated: true`; the UI shows an "est." badge.
**Why:** A roadmap needs concrete dates now; flagged estimates are more useful than blanks. Robin should re-verify each deadline ~3 months out (README explains).

## D6 — Oscar countdown target: 98th Academy Awards ceremony window, configurable
**Decision:** The dashboard countdown targets a user-editable date, defaulting to 2028-03-05 (estimated 100th-ceremony-era date for the 2028 Oscars, i.e. the first ceremony his 2027 festival wins could feed into). Editable in Settings because the Academy announces exact dates late.
**Why:** Track A timeline: daily shorts from 15 Jul 2026 → festival wins in 2027 → Oscar eligibility for the ceremony in early 2028.

## D7 — Color system mapped to CSS custom properties
**Decision:** True Black `#0A0A0A` (background), Set Red `#E63946` (primary accent/CTAs), Stage Teal `#2A9D8F` (success/positive), Stage Blue `#457B9D` (info/secondary), Cream `#F1FAEE` (text). Dark-only theme — no light mode.
**Why:** The brief says cinematic + dark; a fixed dark theme keeps contrast control exact. Exact hexes weren't specified, so I chose film-industry-adjacent values that satisfy WCAG AA against True Black.

## D8 — Challenge tracker generates days on demand, starts 2026-07-15
**Decision:** The Daily Short Film Challenge view shows a day grid from 15 Jul 2026 up to today (+ 7 days lookahead), each day editable: title, idea, status (planned/shooting/editing/published/skipped), link, learnings. Streak + completion stats computed live.
**Why:** Pre-generating 365 empty rows would bloat exports; generating lazily keeps the JSON snapshot small and the grid infinite-friendly.

## D9 — Follower tracker is manual data points
**Decision:** Instagram/YouTube follower counts are entered manually as dated data points; the dashboard renders a progress line toward 1,000,000 (IG) with a simple inline SVG chart, plus growth-rate and "on track?" projection.
**Why:** No API keys in a static app. Manual weekly entry is a 10-second task and gives an honest trend line.

## D10 — English UI, German content preserved
**Decision:** All UI chrome is English (per brief). Notion content (ideas etc.) stays in original German — no machine translation of Robin's own words.

## D11 — Single-page app with hash routing
**Decision:** Views: `#/dashboard`, `#/challenge`, `#/festivals`, `#/ideas`, `#/projects`, `#/settings`. Hash routing works under `file://` and static hosts without server config.

## D12 — ICS calendar export
**Decision:** Festivals view exports all upcoming deadlines as a standards-compliant `.ics` file with a 2-week display alarm per deadline.
**Why:** Deadlines are useless if they only live inside the app; one click puts them into Google/Apple Calendar where Robin actually plans his weeks.

## D13 — Single-file distribution (`dist/way-to-oscar.html`)
**Decision:** `scripts/build-standalone.py` inlines CSS + JS + seed data into one 270 KB HTML file.
**Why:** The simplest possible Dropbox artifact — one file, double-click, no folder structure to keep intact. `</script>` sequences in data are escaped to `<\/script>` to survive inlining.

## D14 — Idea → Challenge pipeline
**Decision:** Every idea has a "→ Challenge day" action that copies it onto the next free challenge day and bumps the idea to "In Arbeit".
**Why:** The daily challenge lives or dies on a full idea pipeline; the vault (98 ideas, 74 marked 🔥 Hoch) is the natural feeder. One click closes the gap between collecting and shooting.

## D15 — Master-plan reality check surfaced, not hidden
**Decision:** The Notion master plan does NOT mention the 15-July daily-film challenge (it plans ONE festival short in Q3 2026 with "one focus project per quarter" as a core principle). The app still builds the challenge as briefed, but the Strategy Briefing on the dashboard quotes the master-plan principles (incl. the one-focus rule and the honesty check) so the tension stays visible.
**Why:** The brief wins over the archive, but hiding the conflict would betray the master plan's own "the story you tell becomes the story you believe" warning.

## D16 — Permissions
**Decision:** Per Robin's mid-session request ("alles immer erlauben"), added `.claude/settings.local.json` (gitignored) with `defaultMode: "dontAsk"` and a broad tool allowlist.

## D17 — Git hygiene
**Decision:** Commit after each major step (scaffold, data, features, polish). Branch `claude/oscar-command-center-gzj8uu` as instructed.

## D18 — Knowledge base from uploaded PDF
**Decision:** Robin's uploaded `WAYTOOSCARKNOWLEDGE.pdf` (consolidated ChatGPT export, parts 01–24) was distilled into `data/knowledge.json` (12 categorized sections, German verbatim) and shipped as a new searchable **Knowledge** view. The original PDF is preserved in `data/` for the team.
**Why:** The export is the densest single source of Robin's operating system (mission chain, content strategy, film craft, decision rules, routines). It also independently confirms the two load-bearing facts the Notion master plan lacked: the Daily Short Film Challenge start (15 July 2026) and the 2026 goal of 1M Instagram followers.

## D19 — Oura-style redesign
**Decision:** Dashboard rebuilt as a health-ring-style home (three animated score rings: Journey / Followers / Challenge, greeting header, clean list rows); soft card style (radius 20, hairline borders) rolled out app-wide. Rings animate in via SVG SMIL, skipped under `prefers-reduced-motion`.
**Why:** Robin asked for a cleaner start page "like the Oura ring app".

## D20 — "Brain": brand backend, meetings, weekly reports
**Decision:** Knowledge tab renamed and expanded to **Brain** with three sub-areas: Brand Core (editable notes in sections core/values/dos/donts/cta/assets/team, seeded from `data/brand.json`), Knowledge (PDF-derived base), Meetings & Reports (transcript storage as a synced collection + deterministic in-app weekly report generator). `brandNotes` and `meetings` joined the merge registry so they flow through the Dropbox export/import like everything else. Legacy `#/knowledge` route aliases to `#/brain`.
**Why:** Robin wants one place his team pulls brand truth from, plus a weekly Robin+Simon meeting rhythm: generate report → meet → record → paste transcript into Brain. The report is generated locally (zero AI credits).

## D21 — CLAUDE.md as the "Brain" contract for future sessions
**Decision:** Added repo-root `CLAUDE.md` telling future Claude sessions what "Brain" means, where each data type lives, how to file new brand/knowledge entries (edit JSON → rebuild seed), and to grep small canonical JSONs instead of reading generated 200KB+ files.
**Why:** Saying "Brain" to Claude is not magically wired to anything; a CLAUDE.md is the mechanism that makes the word carry meaning in every future session in this repo — no custom skill needed yet.

## D22 — Films: dossier per film, idea→film pipeline
**Decision:** New **Films** view: each film is a full dossier (logline, genre, themes, status, script editor with word count/screen-time estimate, shotdeck/moodboard as https-link references with previews, notes, learnings, .md dossier export). Ideas gain a "Develop as film" action; `films` joined the merge registry. Shotdeck/moodboard stores **references, not binaries** — image files belong in the Dropbox, keeping localStorage and exports small.
**Why:** Robin asked where film ideas grow up. An idea is one line; a film is a dossier — matching the "Filmdatenbank" blueprint in his own knowledge export.

## D23 — Game-style overview + canonical CLAUDE BRAIN folder
**Decision:** Dashboard gains a player card (Director Level + XP from published films, milestones, scripts, submissions, wins; escalating thresholds), bolder typography, tighter spacing so the overview fits one screen. Canonical team storage documented as `Kollektiv Oskar Dropbox/KOLLEKTIV OSKAR/CLAUDE BRAIN/` in README + CLAUDE.md.
**Why:** Robin wants the overview to feel like a game and read better; and he created the CLAUDE BRAIN Dropbox folder as the Brain's physical home.

## D24 — Notion best-of seeded as film dossiers + vision boards
**Decision:** The five strongest film projects from the Notion analysis (Der Junge im Nebel, Der Schrank, Bushaltestelle, Rumänischer Strassenhund, Musikvideo) ship as pre-built Film dossiers with loglines, themes, production notes and known learnings (`data/films-seed.json`). Vision boards (`data/vision.json`): "THE VISION" (from the Notion Vision-Profilbild plan) shows on the dashboard; "FESTIVAL RUN 2027" as second board; both editable in Brain → Vision (text tiles + https image tiles, multiple boards supported).

## D25 — Weekly Thursday auto-report (Sandcastles)
**Decision:** A Routine fires every Thursday 09:00 UTC (= 11:00 Swiss summer time) into this session: analyze the last 7 days via Sandcastles (best post + why, underperformer, 3 insights good/bad/improve), list 7-day growth for all accounts (YouTube via API; IG/TikTok from manual app data or flagged for manual entry), write data/reports/YYYY-MM-DD-weekly.md, commit+push, send the file to Robin proactively.
**Note:** cron is UTC — in Swiss winter time the report arrives at 10:00; adjust the cron to `0 10 * * 4` in November if 11:00 sharp matters.

## D26 — Apple dark-mode design language
**Decision:** Switched the design system to Apple's dark-mode idiom: SF Pro system font stack, big bold sentence-case titles with tight tracking (no more uppercase display titles), flat #1C1C1E surfaces without borders/gradients, iOS-style tinted buttons/badges/nav pills, clean black canvas (vignette removed). Bold weights kept per Robin's "fette Titel" requirement.
