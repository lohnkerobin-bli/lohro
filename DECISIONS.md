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

## D27 — Generated key visuals (Higgsfield) baked into the app
**Decision:** 27 cinematic stills generated with Higgsfield Soul 2.0 (~3.3 credits total, anamorphic/teal-amber/35mm-grain house style): one key visual per seeded film (12, asset key = film id → cover in the list + hero on the detail page), 9 Ideas-Vault category stills (rendered heavily darkened behind idea cards so text stays readable), 4 Brain tab banners and 2 vision tiles (trophy, red carpet). PIL-compressed into `data/assets/` (356 KB total) and embedded via the seed. The film detail page gets a "✨ Generate still" button — the static app can't call Higgsfield itself, so it copies a ready-made request to the clipboard for Robin to paste to Claude.

## D28 — Linked Brain notes with access-strengthened edges
**Decision:** New `js/graph.js` builds a knowledge graph over ideas, films, brand notes and meetings: "Linked in Brain" chips (keyword overlap ranking, German+English stopwords) appear in idea/brand/meeting modals and on film detail pages. Opening a linked note strengthens that edge (`linkGraph` keyed map, weight+1 per use, ranking = overlap + 2×weight; chips get visually bolder at weight 1/2/3). Team merges keep the strongest weight either side has learned.

## D29 — WIKI.md: Claude reads it first, keeps it current
**Decision:** `WIKI.md` is the always-current one-page summary of Robin (who/mission/team/projects/communication rules). CLAUDE.md instructs every session to read it before answering and to update it in the same working step whenever a new insight lands in the Second Brain; the Thursday routine folds findings in too.

## D30 — Client work lives in the Command Center (Säntis)
**Decision:** Adopted Simon's Säntis handover system: the whole client project is now in the app — `data/company.json` seeds 7 client projects (Testfilme deadline 14.07., 5 Brand-Filme with shoot dates, Miraval/Maison Rosé) as type "client" in Projects; upcoming client deadlines show on the dashboard's Up-next card. The full handover is archived as `data/meetings/2026-07-09-saentis-handover.md`; the transferable process lessons (test films before shooting, cost-ceiling phase table, proactive budget checkpoints, explicit risk register) became a Team-Playbook brand note.

## D31 — Script-anchored storyboard + shot list (StudioBinder-style, offline)
**Decision:** Storyboard frames anchor to selected script passages (film.storyboard[] = {id, text, url, caption}) — select text, "+ Frame from selection". Frames render in script order, take an https image or a Claude-generated still, and the shot list (.md, grouped by scene headings with checkboxes) is derived locally from script + storyboard at zero credits. Dossier export includes the storyboard.

## D32 — Filmwissen: McKee coaching questions, never solutions
**Decision:** Every film dossier shows a "Filmwissen" card with craft questions (Robert McKee's Story: premise/structure/scene/visual/rewrite) filtered by film status, rotating daily. Per Robin's explicit wish, Claude's script feedback style is questions and pointers, never finished examples — the ideas must stay his (rule in CLAUDE.md, question bank in data/filmcraft.json).

## D33 — Locations library with EXIF pipeline
**Decision:** New Locations view + `locations` collection (seeded from data/locations.json with Sebis Body Bar, Wiese Peter und Paul, Klosterplatz). Robin sends photos → Claude reads EXIF GPS cloud-side, files the location; film dossiers auto-suggest matching locations via the knowledge graph (film↔location links strengthen on use).

## D34 — Brain graph view + daily social output log
**Decision:** Brain → Graph renders the whole second brain as a client-side force-directed canvas map (zero credits): dots by type, grey lines = shared themes, amber lines thicken with learned link weight; click opens the note. New daily Routine (07:30 CH, trig_01JsxHbVR2iP97PQDbkvVmJ1) logs new posts per platform into data/social-log.json; the dashboard charts videos/week and the Thursday routine compiles the weekly growth overview.

## D35 — ZENTRALE: Rebrand + Brain-Restrukturierung + Challenge-Ende
**Decision:** App heisst jetzt **ZENTRALE** (Untertitel "Way to Oscar · Kollektiv Oskar"). Brain-Aufteilung wie in Notion: Nav-Tab **Second Brain** (ex "Ideas" — Robins eigene Ideen/Erkenntnisse) und neuer Tab **Externes Brain** (fremde Quellen: Transkripte, Videos, Artikel; `externalInsights`-Collection, gespiegelt mit EXTERNE-ERKENNTNISSE.md, Original-Link Pflicht + Duplikat-Check). Der bisherige "Brain"-Tab heisst **Brand** (Interpretation von Robins diktiertem "Brent"). Daily-Challenge-Reiter entfernt (Challenge 15.–24.07. durchgezogen, Tracking kam nie zustande): Route→Films-Alias, Dashboard-Ring jetzt Films-Slate, Daily-Post-Check-Trigger gelöscht, challengeDays-Daten bleiben erhalten. Locations: Foto-Upload direkt in der App mit clientseitigem EXIF-GPS-Parser (Koordinaten automatisch aus dem Bild) + Canvas-Kompression in localStorage. Second-Brain-Sweep: 8 neue Film-Dossiers (Why People Don't Dance, Neue Identität, Perfekt Live, Jack das Schwein, AirPods Spec, Shark Attack Meta-Zweiteiler, Robin × Robin, KO Showreel) → 22 Filme.

## D36 — Brain-Telefon: Sprachanruf mit dem CLAUDE BRAIN (autonomer Build-Test-Loop)
**Decision:** Neuer Tab **Brain-Telefon** (`#/phone`): grosser Anruf-Button → Mikrofon → Transkript → Claude durchsucht das CLAUDE BRAIN in der Dropbox → Antwort wird vorgelesen und erscheint als Transkript; der volle Verlauf wird bei jedem Turn mitgeschickt (API stateless), Auflegen beendet. Reine Logik in `js/brain-telefon-core.js` (Node-testbar), UI/Adapter in `js/brain-telefon.js`.
**Transport:** In der Claude-Artifact-Version läuft die Anfrage über die Artifact-Runtime (`claude.use("sample")` mit den Seiten-Tools `brain_search`/`brain_read`, die per `claude.use("mcp")` den Dropbox-Connector `search`/`fetch` auf `/KOLLEKTIV OSKAR/CLAUDE BRAIN` aufrufen) — kein API-Key nötig, Robins Claude-Login zahlt. Ein direkter `POST /v1/messages`-Aufruf (Modell `claude-sonnet-4-6`, `mcp_servers` Dropbox + `mcp_toolset`, Beta `mcp-client-2025-11-20`) ist als zweiter Transport gebaut, greift aber nur ausserhalb des Artifacts mit einem Anthropic-Key aus den Settings — die Artifact-Sandbox blockiert fremde Hosts per CSP.
**Stufen:** Basis = Web Speech (`de-CH`, Fallback `de-DE`) + `speechSynthesis`; Pro = Whisper (`whisper-1`, MediaRecorder + Stille-Erkennung) + ElevenLabs. Keys nur in `localStorage` (`zentrale-brain-phone-keys-v1`), nie im Store/Export. Die Stufe wird pro Anruf entschieden und fällt bei Laufzeitfehlern automatisch auf Basis zurück; im Artifact ist Pro prinzipiell nicht erreichbar (CSP) → Badge sagt das. Konsequenz: Pro lohnt sich nur in der lokalen `way-to-oscar.html`.
**Fehlerfälle** (alle gesprochen UND sichtbar): Mikro verweigert, API-Fehler, leere Brain-Suche, Netz weg (vor und während der Anfrage), dazu Dropbox nicht verbunden, keine Freigabe, Rate-Limit, kein Transport.
**Loop-Log:**
- *Runde 1* — gebaut: Core, View, CSS, Nav, Settings, 23 Unit-Tests, 49 Smoke-Checks. Gefunden: `role:"notice"`-Einträge rutschten in den API-Verlauf (Unit-Test rot); versteckte Buttons sichtbar, weil `.ph-side{display:flex}` das `hidden`-Attribut schlägt; Sprachausgabe-Fehler brach den ganzen Turn ab; Test-Mock konnte `speechSynthesis` nicht ersetzen. Gefixt: Notices gefiltert, `[hidden]{display:none!important}`, `speak()` rejected nie mehr, Mock via `defineProperty`.
- *Runde 2* — Bewertung „fühlt sich an wie ein Telefonat?“: auf 390 px überlagerte das Dock den Live-Streifen und die Seite scrollte; Timer nur ganze Sekunden; Latenz (3 Modell-Runden: suchen, lesen, antworten) ist der grösste Feind. Gefixt: Ein-Screen-Layout mobil (Header schrumpft im Gespräch, Transkript flext, Dock in der Daumenzone), Zehntelsekunden, gesprochene Zwischenmeldung nach 7 s („Moment, ich schau im Brain nach.“, einmal pro Turn), Prompt verlangt parallele Reads in einer Runde, aktiver Nav-Tab scrollt ins Bild. 53/53.
- *Runde 3* — Robustheits-Review: „Stopp“ während „Brain denkt“ brach die Anfrage nicht ab (Antwort kam später ins Hören rein); Tab-Wechsel liess das Mikro laufen; iOS blockiert die erste Sprachausgabe ohne Geste; Leere-Suche-Flag zählte über Turns hinweg; Sprechen-Button während des Denkens sinnlos. Gefixt: Abbruch per AbortController, Auflegen bei `hashchange`, stummer Unlock-Utterance beim Tippen auf Anrufen, Zähler pro Turn, Button ausgeblendet. 57/57 Smoke, 23/23 Unit.
- *Runde 4 (08.09., nach Robins erstem echten Anruf)* — Befund vom iPhone: das Brain antwortet im Artifact (sample + Dropbox laufen), aber das Mikrofon ist im claude.ai-iframe auf iOS blockiert („Mikrofon blockiert“ bei jedem Versuch). Lösung: **SpeakApp-Modus**. Robin nimmt die Frage in der SpeakApp auf, die ZENTRALE holt das Transkript über den SpeakApp-Connector (`list_recordings` alle 4 s, nur Aufnahmen NEUER als die Baseline beim Start, `get_recording` → `renderedText`, „Speaker 1:“ entfernt) und stellt sie dem Brain. Bei blockiertem Mikro schaltet das Telefon automatisch um (gesprochen + sichtbar), ein Chip „Mikro / SpeakApp“ erlaubt den Wechsel jederzeit, „Holen“ nimmt die neueste fertige Aufnahme. Artifact-Manifest um SpeakApp (`list_recordings`, `get_recording`) erweitert. Beobachtete TOON-Antwortform in Unit-Tests festgehalten. 27/27 Unit, 66/66 Smoke.
**Offen / nicht ohne Robin entscheidbar:** (1) Echte Schweizerdeutsch-Qualität Basis vs. Pro — Testplan im Abschlussbericht. (2) Der reale API-Ende-zu-Ende-Lauf konnte in dieser Session nicht ausgeführt werden (kein Anthropic-Key in der Cloud-Session); `tests/brain-telefon.e2e.js` führt ihn mit `ANTHROPIC_API_KEY` aus und prüft die Sprech-Tauglichkeit — der erste echte Lauf passiert im Artifact mit Robins Login. (3) Ob das Artifact-iframe den Mikrofonzugriff durchreicht, entscheidet claude.ai — falls nicht, greift die Mikro-Meldung mit Tipp-Fallback.
