# Talking-Head-Flow – Pipeline (Lohro, Spur B)

Automatisiert den Weg Rohclip → fertiges 9:16-Reel, nach den Vorgaben in Dropbox
`Projekte/Lohro/23-01-12 Vlog Wöchentlich/04_TALKING_HEAD_FLOW/00_VORGABEN/` (WORKFLOW.md, untertitel.md,
branding.md, musik.md). Erstmals gelaufen: KW42 (14.10.2026), Bericht: `2026-KW42/BERICHT.md` in der Dropbox.

## Was die Skripte machen
| Skript | Aufgabe |
|---|---|
| `transcribe.py` | Whisper large-v3 lokal (faster-whisper), Wort-Zeitstempel → JSON |
| `vad.py` | Pegelkurve / Sprechpausen (Whisper verschluckt Pausen und Fuellwoerter) |
| `edl.py` | Schnittliste laden, auf 25p rasten (leiserer Nachbar-Frame), Quelle → Record-Zeit |
| `audio_edit.py` | Tonspur nach Schnittliste schneiden (8 ms Blenden) → zur Gegenprobe nochmals transkribieren |
| `face.py` | Gesichtsposition pro Segment (OpenCV < 5, Haar) fuer den 9:16-Ausschnitt |
| `grade.py` / `fit_grade.py` | Brand-LUT anwenden, Gawx-Werte messen, Korrektur pro Clip fitten, LUT backen |
| `render.py` | Segmente graden/croppen (ProRes), Cutaways, Ton (Stimme -15 LUFS, Musik -31 LUFS, Ducking, Summe -14 LUFS), Untertitel (.srt, phrasenbasiert), Grafik-Zustaende 2-4 (ASS: Archivo Condensed, Karte, Instrument Serif), Master (Untertitel als Soft-Spur), Vorschau (eingebrannt), Overlay-MOV, Stills, Report |
| `premiere_xml.py` | FCP7-XML-Sequenz fuer Premiere (1080x1920, Schnitte, Motion, Musik -20 dB, Overlay V2) |
| `make_jsx.py` | `build_premiere_KW42.jsx`: Projekt anlegen, XML importieren, Motion exakt setzen, .srt als echte Untertitelspur (`createCaptionTrack`) |
| `gen_docs.py` | Transkript + Schnittliste (Markdown, Timecodes) |
| `run_in_premiere.command` | schickt das .jsx an Premiere (`<Premiere-Binary> /C es.processFile <jsx>`) |

## Ordnerlayout (ROOT)
```
ROOT/dl/<clip>.MP4, dl/LUT_SLog3_Kodak250D.cube, dl/music/..., dl/v2v/... (Cutaways)
ROOT/work/<clip>_R.wav (Kanal 2), work/tx/<clip>_R.json, work/grade_params.json
ROOT/edit/<A>.json (Schnittliste), edit/<A>_voice_cut.wav/.json, edit/<A>_faces.json
ROOT/fonts/  (Inter Tight, Archivo Condensed ExtraBold, Instrument Serif Italic – Google Fonts)
```
Die Schnittlisten von KW42 liegen in `kw42/` (inkl. Begruendung pro entferntem Stueck).

## Ablauf pro Clip
1. Ton Kanal 2 extrahieren, `transcribe.py large-v3`, `vad.py` → Schnittpunkte in Pegel-Taelern waehlen (Pausen > 0.4 s, Fuellwoerter, Restarts)
2. Schnittliste als JSON (siehe kw42/), `audio_edit.py` + nochmals `transcribe.py` = Gegenprobe (kein Wort angeschnitten)
3. `face.py` (bei Fehldetektion: `framing.mode = fixed`)
4. `fit_grade.py` → `grade_params.json`
5. `render.py EDL ROOT OUT` (`--reuse` = nur neu encodieren)
6. `premiere_xml.py`, `gen_docs.py`, `make_jsx.py`

Voraussetzungen: ffmpeg mit libass/libx264, Python 3 mit numpy, pillow, faster-whisper, `opencv-python-headless<5`.
Der Dehancer-LUT ist lizenziert (nur Robin) und liegt bewusst NICHT im Repo.
