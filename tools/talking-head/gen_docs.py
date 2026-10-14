"""Write 02_TRANSKRIPT texts (transcript + Schnittliste) for one reel.
usage: gen_docs.py EDL.json ROOT REPORT.json OUTDIR"""
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edl as E

def tc(t):
    fr = int(round(t * 25)); h, fr = divmod(fr, 90000); m, fr = divmod(fr, 1500); s, fr = divmod(fr, 25)
    return f"{h:02d}:{m:02d}:{s:02d}:{fr:02d}"

edl_path, root, rep_path, outdir = sys.argv[1:5]
e = E.load(edl_path, root); rep = json.load(open(rep_path)); clip = e["clip"]
raw = json.load(open(os.path.join(root, "work", "tx", f"{clip}_R.json")))
cut = json.load(open(os.path.join(root, "edit", f"{e['id']}_voice_cut.json")))
words = [w for s in cut["segments"] for w in s["words"]]

# ---- transcript (original clip, source timecode)
lines = [f"TRANSKRIPT  {clip}.MP4  (Original, Quell-Timecode, 25p)",
         "Whisper large-v3 lokal (faster-whisper, int8), Sprache: Englisch, Tonspur: Kanal 2 (Mikro)",
         "Hinweis: Whisper glaettet Fuellwoerter (aehm/uh) teilweise weg; Pausen und gedehnte 'and' wurden",
         "zusaetzlich ueber die Pegelkurve gefunden (siehe Schnittliste).", ""]
for s in raw["segments"]:
    lines.append(f"[{tc(s['start'])} - {tc(s['end'])}]  {s['text'].strip()}")
lines += ["", "FINALER SCHNITT (gesprochen, Record-Timecode):", ""]
lines.append(" ".join(s["text"].strip() for s in cut["segments"]))
open(os.path.join(outdir, f"{clip}.txt"), "w").write("\n".join(lines) + "\n")

# ---- Schnittliste
md = [f"# Schnittliste  {rep['name']}", "",
      f"Quelle: `01_RAW/{clip}.MP4` (S-Log3 / S-Gamut3.Cine, 25p, Ton Kanal 2)  ",
      f"Sequenz: 1080x1920, 25p, Laenge **{rep['duration']:.2f} s** ({int(round(rep['duration']*25))} Frames)  ",
      f"Variante: **{e['variant']}** (untertitel.md)  |  Musik: `{ {'ES_Inbound.wav': 'ES_Inbound - Brendon Moeller.wav', 'ES_Some.mp3': 'ES_Some - Hara Noda.mp3'}[os.path.basename(e['music'])] }` (02_DATEN/02_AUDIO/01_MUSIC) ab {e['music_in']} s, ca. 17 LU unter der Stimme, mit Ducking", "",
      "## Schnitte (harte Schnitte, Quelle -> Timeline)", "",
      "| # | Source IN | Source OUT | Record IN | Record OUT | Dauer | Zoom | Gesprochen |", "|---|---|---|---|---|---|---|---|"]
for i, ((a, b), (r0, r1)) in enumerate(zip(e["segments"], e["rec"])):
    said = " ".join(w["w"].strip() for w in words if r0 <= (w["s"] + w["e"]) / 2 < r1)
    md.append(f"| {i+1} | {tc(a)} | {tc(b)} | {tc(r0)} | {tc(r1)} | {b-a:.2f} s | {int(round(rep['zooms'][i]*100))} % | {said} |")
md += ["", "Zoom = digitaler Punch-in auf das Gesicht (Wechsel nur, wenn seit dem letzten Wechsel >= 2.5 s vergangen sind; kaschiert Jump-Cuts).", ""]
if e.get("cutaways"):
    md += ["## Cutaways (Bild ueberdeckt, Ton laeuft weiter)", ""]
    for c in e["cutaways"]:
        md.append(f"- ab Quelle {tc(c['from_src'])}: `{os.path.basename(c['file'])}` ab {c['in']} s, klein auf Schwarz (nicht hochskaliert). {c['note']}")
    md.append("")
md += ["## Was raus ist und warum", "", "| Quelle | Grund |", "|---|---|"]
for k, v in e["removed"].items(): md.append(f"| {k} s | {v} |")
g = rep["graphics"]
md += ["", "## Grafik-Zustaende (untertitel.md)", "",
       f"- Zustand 2 Headline aufs Hook-Wort: `{e['graphics']['headline']['text']}` {tc(g['headline'][0])} - {tc(g['headline'][1])} (Archivo Condensed ExtraBold, Akzentfarbe)",
       f"- Zustand 3 Karte (genau 1x): `{e['graphics']['card']['text'].replace(chr(92)+'N',' ')}` {tc(g['card'][0])} - {tc(g['card'][1])} (Hartschnitt auf Vollfarbe, Text weiss)",
       f"- Zustand 4 Gefuehlssatz: `{e['graphics']['serif']['text']}` {tc(g['serif'][0])} - {tc(g['serif'][1])} (Instrument Serif Italic, ersetzt dort den laufenden Untertitel)",
       "- Zustand 1 laufender Untertitel: echte Spur aus der .srt (Inter Tight, weiss, mittig unten)", "",
       "## Ton", "", f"- Messung Master: {rep['audio']['final'][0]} LUFS integriert, True Peak {rep['audio']['final'][1]} dBTP",
       "- Kette Stimme: Hochpass 80 Hz, Entrauschen, -2 dB @250 Hz, +2 dB @3.5 kHz, Kompressor 3:1, Loudness -15 LUFS; Musik -31 LUFS mit Sidechain-Ducking; Summe auf -14 LUFS",
       "- Jede Schnittkante mit 8 ms Blende (keine Klicks); Schnittpunkte auf Pegel-Taeler gelegt und auf den leiseren Nachbar-Frame gerastet", ""]
open(os.path.join(outdir, f"{clip}_schnittliste.md"), "w").write("\n".join(md) + "\n")
print("ok", clip)
