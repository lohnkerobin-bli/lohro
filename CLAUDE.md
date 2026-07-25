# WAY TO OSCAR Command Center — instructions for Claude

This repo is Robin Lohnke's ("Lohro", Kollektiv Oskar, St. Gallen) command center
on his road to winning an Oscar. Zero-build static web app: open `index.html` or
the single-file build `dist/way-to-oscar.html` directly in a browser.

## WIKI first

**Before answering Robin, read `WIKI.md`** — the always-current one-page summary
of who he is, his mission, team, active projects and communication rules.
**Keep it updated**: whenever a new insight lands in the Second Brain (new brand
note, meeting, strategy decision, voice note, weekly-report finding), update the
affected WIKI.md section in the same working step and bump its date line.
The Thursday routine must also fold new findings into WIKI.md.

## Canonical storage location (Robin's Mac)

Robin's Brain folder in the team Dropbox is:
`~/Kollektiv Oskar Dropbox/KOLLEKTIV OSKAR/CLAUDE BRAIN/`
That folder holds: `way-to-oscar.html` (the single-file app), the exported
`way-to-oscar-data-*.json` snapshots, weekly reports, meeting transcripts and
brand asset files. When Robin says "leg das im Brain-Ordner ab" he means this
path. Claude sessions run in the cloud and cannot write to his Mac directly —
produce the file, tell him it goes into CLAUDE BRAIN.

## What "Brain" means

When Robin says **"Brain"** (e.g. "leg das ins Brain", "schau im Brain nach",
"Brain durchsuchen"), he means the team knowledge backend of this app. It has
three parts:

| Part | Canonical data | In-app view |
|---|---|---|
| **Brand Core** (values, do's/don'ts, CTA strategy, assets, team playbook) | `data/brand.json` (seed) — user edits live in the app/exports | Brand → Brand Core |
| **Knowledge base** (mission, strategy, film craft, routines — from his ChatGPT export) | `data/knowledge.json`, original in `data/WAYTOOSCARKNOWLEDGE.pdf` | Brand → Knowledge |
| **Meetings & weekly reports** (transcripts, decisions, action items) | app localStorage → exported to `way-to-oscar-data-*.json` in the team Dropbox | Brand → Meetings |
| **Second Brain** (Robins eigene Ideen) | `data/notion-ideas.json` | Second Brain |
| **Externes Brain** (fremde Quellen, Pflicht-Link) | `data/extern-brain.json` + `EXTERNE-ERKENNTNISSE.md` | Externes Brain |

## Das Wort "ZENTRALE" (Dauer-Regel)

Sobald Robin **"ZENTRALE"** sagt und eine Änderung beschreibt ("in der Zentrale
soll...", "bau in die Zentrale ein", "Zentrale: ..."), wird sie OHNE Rückfrage
direkt in der App umgesetzt: Code/Daten ändern → rebuild (beide Skripte) →
Playwright-Kurztest → commit + push → Artifact aktualisieren → Screenshot an
Robin (Standing Rule). Selbstständig arbeiten; bei Hindernissen Lösungen suchen
statt fragen; unklare Diktion: beste Interpretation umsetzen und kennzeichnen.

## Externes Brain ↔ Notion (Dauer-Regel)

Das Externe Brain existiert doppelt: in Notion (Robins "externes Brain"-Skill
trägt dort ein) und in der ZENTRALE (`data/extern-brain.json` + App-Tab +
`EXTERNE-ERKENNTNISSE.md`). Regeln:
- Jede externe Erkenntnis, die Claude hier erfasst, landet in ALLEN Zielen
  (extern-brain.json + EXTERNE-ERKENNTNISSE.md; Notion nur wenn Notion-Tools
  verfügbar — sonst vermerken).
- **Sync-Pflicht der Donnerstags-Routine:** Notion "Externes Brain" abfragen,
  neue Einträge (Dedupe per Original-Link) in extern-brain.json +
  EXTERNE-ERKENNTNISSE.md übernehmen, rebuild + push.

Routing rules for Claude:
- **Catch-all (wichtigste Regel):** Sobald Robin "Brain" sagt ("ins Brain",
  "Brain: ...", "leg das ins Brain", "Brain merken"), wird der Inhalt OHNE
  Rückfrage gespeichert. Claude wählt selbst das richtige Ziel: Brand-Note
  (brand.json), Wissen (knowledge.json), Idee (notion-ideas.json), Meeting
  (data/meetings/), Film-Notiz (films-seed.json) oder Location (locations.json)
  — dann rebuild + commit + push, WIKI.md bei neuen Kernfakten mitziehen.
  Antwort an Robin: EIN Satz, was wo abgelegt wurde. Bei unklarer Diktion:
  beste Interpretation speichern und kurz kennzeichnen.
- "leg X ins Brain (Brand/Werte/CTA...)" → add/edit an entry in `data/brand.json`
  (stable `id`, correct `section`: core/values/dos/donts/cta/assets/team), then
  run `python3 scripts/build-seed.py && python3 scripts/build-standalone.py`.
- "leg dieses Wissen ab" → extend `data/knowledge.json` (same rebuild).
- **Externe Erkenntnisse (Dauer-Regel):** Wenn Robin ein YouTube- oder
  Instagram-Video transkribiert/analysiert oder sagt „bau es ins Second Brain
  ein" / „ins Externe Brain", dann automatisch einen Eintrag im definierten
  Format in `EXTERNE-ERKENNTNISSE.md` anlegen (verlinkt aus WIKI.md, Abschnitt
  🌐 EXTERNE ERKENNTNISSE). Der Original-Link ist Pflichtfeld. Eigene Ideen von
  Robin gehören NICHT hierhin, nur Erkenntnisse aus fremden Quellen. Vor dem
  Eintragen prüfen, ob der Link schon vorhanden ist (kein Duplikat anlegen).
  Danach kurz bestätigen: ✅ gespeichert + stärkste Lehre in 1 Satz.
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

- Classic-script SPA (works via `file://`), hash routes: dashboard, films,
  locations, festivals, ideas (= Second Brain), extern (= Externes Brain),
  projects, brain (= Brand tab), settings. App title: ZENTRALE. Views in
  `js/*.js`, store in
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

## Film workflow (script, storyboard, coaching)

- **"Ich arbeite an <Film>" / "Feedback zu <Film>" / voice note with a film idea** →
  fuzzy-match the title against `data/films-seed.json` (and app exports if he sent
  one) and work on THAT film's `script`/`notes` in films-seed.json. After a Claude
  edit, set that film's `updatedAt` to the current ISO-Z time — the seed merge is
  newest-wins, so the change reaches Robin's local app data. Then rebuild both
  scripts. Mobile idea dumps get appended under a dated `IDEEN UNTERWEGS` block in
  notes, woven into the script only when he asks.
- **Coaching style (wichtig):** Robin will Fragen, keine Lösungen. Feedback auf
  Scripts = McKee-Fragen (Story: Controlling Idea, Gap, Value Shifts, Krise/Klimax),
  Hinweise worauf er achten könnte — NIE konkrete fertige Beispiele oder
  ausformulierte Szenen, ausser er verlangt es ausdrücklich. Die Ideen müssen seine
  bleiben. Fragenkatalog: `data/filmcraft.json` (im Film-Dossier als "Filmwissen").
- **Storyboard:** frames are anchored to script passages (film.storyboard[] =
  {id, text, url, caption}). When Robin asks for a frame image, generate it in the
  house style (anamorphic, teal/amber, 35mm grain), then either set the frame's
  `url` to the Higgsfield CDN link in films-seed.json or bake it as an asset.
  Shot list: the app exports it locally from script + storyboard (zero credits).
- **Locations:** when Robin sends photos of a location, read EXIF GPS cloud-side
  (PIL GPSInfo), fill `data/locations.json` (id `loc-*`, name, area, coords
  "lat,lng", tags, vibe, notes) and rebuild. When he shares a film idea, check the
  location library for matches and suggest where it could be shot (the app also
  auto-suggests via keyword match in the film dossier).

## Social output log (historisch)

Die Daily Challenge (15.–24.07.) ist beendet; der tägliche Sandcastles-Post-Check
wurde am 25.07. eingestellt (Trigger gelöscht) — `data/social-log.json` bleibt als
Archiv. Die Donnerstags-Routine läuft weiter.

## Social output log (daily Sandcastles check) — ARCHIVIERT

`data/social-log.json` — one entry per own account per day:
`{date, platform, newPosts, totalIndexed, note}`. A daily Routine (07:30 CH) checks
Sandcastles for new posts on Robin's accounts and appends entries (0 is fine, log it
silently; only message Robin for outliers). The dashboard charts videos/week from
this. The Thursday routine compiles the weekly growth overview (posts + follower
deltas per platform) into the weekly report and folds insights into WIKI.md.
Blocker: as long as the @lohro Sandcastles link is broken, entries may be zero —
still log them, note the blocker.

## Follower pipeline (Sandcastles → app)

`data/followers-log.json` is the automated follower log: the Thursday routine
appends one entry per own account per run (source: sandcastles). Entries with
`verified: true` (plausible: >100 followers AND indexed videos) are baked into
the seed and appear in the app's follower chart; `verified: false` entries stay
for the record only. Manual data points entered in the app always win on merge.
Current blocker: the Sandcastles profile for @lohro ("LOHR") looks mis-linked —
0 videos, 3 followers. Robin needs to fix the link in the Sandcastles app or
provide the correct handles before the feed goes verified.
