# Kurzfilm-Raw-Cut – Pipeline (05_KURZFILM_RAWCUT_FLOW)

Baut aus dem Material eines Kurzfilms einen ersten Raw-Cut in Drehbuch-Reihenfolge, nach
`Projekte/Lohro/23-01-12 Vlog Wöchentlich/05_KURZFILM_RAWCUT_FLOW/00_VORGABEN/WORKFLOW.md`.
Erstmals gelaufen: Haifilm (14.10.2026), Projektordner `2026-01-24_Haifilm/` (Kopie von `_VORLAGE_FILM`).

| Skript | Aufgabe |
|---|---|
| `rawcut.py ROOT OUTDIR` | V1-Liste (Szene, Label, Take, In/Out) → MP4 1920x1080 25p mit Timecode-Burn-in und Szenen-/Clip-Label; fehlende Szenen als graue Tafel "FEHLT – Szene n"; nur Clip-Ton (kein Grade, keine Musik, keine FX) |
| `rawcut_xml.py ROOT TIMELINE.json OUT.xml` | FCP7-XML fuer Premiere: V1 beste Takes, V2–V4 Alternativ-Takes (deaktiviert), A1/A2 Clip-Ton, Sequenz-Marker fuer fehlende Szenen; Pfade zeigen auf `02_RAW/` im Projektordner |

`haifilm_rawcut_v01_timeline.json` = Record-Zeiten der v01 (Grundlage fuer Take-Log und XML).
Die Take-Wahl pro Szene steht im Skript (`V1`, `ALTS`) und begruendet in `03_TAKE_LOG/take-log.md` (Dropbox).
