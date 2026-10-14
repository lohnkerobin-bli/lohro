"""Raw cut for the shark short (05_KURZFILM_RAWCUT_FLOW): scenes in script order, best take per scene,
missing scenes as slates, burned-in timecode + scene/clip label, clip audio only (no grade/music/fx).
usage: rawcut.py ROOT OUTDIR"""
import json, os, subprocess, sys

ROOT, OUT = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2])
os.makedirs(OUT, exist_ok=True); TMP = os.path.join(OUT, "_tmp"); os.makedirs(TMP, exist_ok=True)
FONT = os.path.join(ROOT, "fonts", "f3_normal_600_normal.ttf")
R, A = os.path.join(ROOT, "dl", "v2v"), os.path.join(ROOT, "dl", "ai")
SITZT = os.path.join(ROOT, "dl", "hai", "jonas_sitzt.mp4")

# (scene, label, source file | None for slate, in, out, display name in Dropbox)
V1 = [
 (1, "Jonas greift nach oben, Panik im Schnee", f"{R}/3_jonas_handgranate.mp4", 0.00, 7.00, "echt/3 jonas handgranate.mp4"),
 (2, "DANGER-Schild am Pfosten (echt)", None, 0, 2.0, None),
 (3, "Jonas laeuft durchs Tal", f"{R}/1_JONAS_LAUFEN.mp4", 0.00, 6.36, "echt/1 JONAS LAUFEN.mp4"),
 (4, "ECU Gesicht / Augen, kalt (echt)", None, 0, 2.0, None),
 (5, "Fischschwaerme vor der Sonne (AI)", None, 0, 2.0, None),
 (6, "Rueckblende: Familie gluecklich", f"{A}/Familie_120715.mp4", 0.00, 4.04, "ai_familie/hf_20260625_120715_f015fd56-....mp4"),
 (7, "Hand haelt altes Foto (echt + AI-Foto)", None, 0, 2.0, None),
 (8, "Jonas sitzt am Boden", SITZT, 0.00, 4.00, "echt/Jonas sitzt.mp4"),
 (8, "Jonas schaut nach oben", f"{R}/2_JONAS_HOCHSCHAUEN.mp4", 0.00, 4.80, "echt/2 JONAS HOCHSCHAUEN.mp4"),
 (9, "Jonas beginnt zu rennen", f"{R}/6_JONAS_RENNEN.mp4", 0.00, 7.20, "echt/6 JONAS RENNEN.mp4"),
 (10, "Hai ueber Bergpanorama, Profil + Maul frontal", f"{A}/Hai_Verfolgung3_episch.mp4", 0.00, 8.04, "ai_hai/hHai Verfolgung3 episch_....mp4"),
 (11, "Wurfbewegung (unsicher, s. Take-Log)", f"{R}/3_jonas_handgranate.mp4", 7.00, 11.80, "echt/3 jonas handgranate.mp4"),
 (12, "Hai fliegt auf Jonas zu (POV)", f"{R}/8_HAI_FLIEGT_AUF_JONAS_ZU.mp4", 0.00, 9.20, "echt/8 HAI FLIEGT AUF JONAS ZU.mp4"),
 (12, "Verfolgung: Hai naehert sich", f"{A}/Hai_Verfolgung2_schnell.mp4", 0.00, 7.04, "ai_hai/Hai Verfolgung2 schnell_....mp4"),
 (12, "Granaten-Flugbahn ins Maul", f"{A}/H02_granate_anflug_maul.mp4", 0.00, 5.00, "ai_hai/02_granate_anflug_maul_eff92c82.mp4"),
 (13, "Jonas schiesst (Wald)", f"{R}/5_JONAS_PISTOLE_SCHIESSEN.mp4", 0.00, 12.52, "echt/5 JONAS PISTOLE SCHIESSEN.mp4"),
 (13, "Schuesse prallen am Hai ab", f"{A}/Hai_Schuesse_prallen_ab.mp4", 0.00, 4.04, "ai_hai/Hai Schuesse prallen ab....mp4"),
 (14, "Verschneiter Hang, Figur klein", f"{R}/7_JONAS_HANDGRANATE_UND_HAI.mp4", 0.00, 7.64, "echt/7 JONAS HANDGRANATE UND HAI.mp4"),
 (15, "Granate im Maul, Feuerball", f"{A}/Granate_ins_Maul_Hai_explodiert.mp4", 0.00, 10.04, "ai_hai/Granate fliegt ins Maul Hai explodiert_....mp4"),
 (15, "Jonas wird geworfen", f"{R}/4_JONAS_EXPLOSION.mp4", 0.00, 4.96, "echt/4 JONAS EXPLOSION.mp4"),
 (16, "Familienfoto liegt im Schnee (AI-Foto)", None, 0, 2.0, None),
]
# alternative takes (Premiere: disabled tracks V2/V3 at the position of the scene's first V1 take)
ALTS = {6: [f"{A}/Familie_115049.mp4"],
        10: [f"{A}/Hai_Verfolgung1.mp4", f"{A}/Hai_dreht_zu_Kamera.mp4", f"{A}/Hai_schwimmt_ueber_Kamera.mp4"],
        13: [f"{A}/H03_hai_ueber_berge.mp4", f"{A}/H04_hai_narbe_detail.mp4"],
        15: [f"{A}/Granate_fliegt_und_Hai_explodiert.mp4", f"{A}/H01_granate_maul_explosion.mp4"]}

def run(cmd):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode: sys.stderr.write(" ".join(cmd) + "\n" + r.stderr[-2000:]); raise SystemExit(1)

def esc(s): return s.replace("\\", "\\\\").replace(":", "\\:").replace("'", "’")

parts, rec, timeline = [], 0.0, []
for k, (sc, label, src, a, b, disp) in enumerate(V1):
    out = os.path.join(TMP, f"p{k:02d}.mp4"); dur = round(b - a, 3)
    lab = esc(f"SZ {sc} - {label}" + (f"   [{os.path.basename(src)}]" if src else ""))
    if src is None:
        vf = (f"drawtext=fontfile='{FONT}':text='{esc('FEHLT  -  Szene ' + str(sc))}':fontcolor=white:fontsize=72:x=(w-tw)/2:y=h/2-90,"
              f"drawtext=fontfile='{FONT}':text='{esc(label)}':fontcolor=white@0.85:fontsize=44:x=(w-tw)/2:y=h/2+10")
        run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=0x202020:s=1920x1080:r=25:d={dur}",
             "-f", "lavfi", "-i", f"anullsrc=r=48000:cl=stereo", "-t", str(dur), "-vf", vf,
             "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-shortest", out])
    else:
        vf = (f"scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black,fps=25,"
              f"drawtext=fontfile='{FONT}':text='{lab}':fontcolor=white:fontsize=30:box=1:boxcolor=black@0.55:boxborderw=10:x=30:y=h-th-40")
        run(["ffmpeg", "-v", "error", "-y", "-ss", str(a), "-i", src, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
             "-t", str(dur), "-filter_complex", f"[0:v]{vf}[v];[0:a]aresample=48000,aformat=channel_layouts=stereo[a0];[a0][1:a]amix=inputs=2:duration=first:normalize=0[a]",
             "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-crf", "16", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out])
    parts.append(out); timeline.append({"scene": sc, "label": label, "src": src and os.path.basename(src), "dropbox": disp,
                                        "in": a, "out": b, "rec_in": round(rec, 3), "rec_out": round(rec + dur, 3)})
    rec += dur

lst = os.path.join(TMP, "list.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
cat = os.path.join(TMP, "concat.mp4")
run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", cat])
final = os.path.join(OUT, "Haifilm_rawcut_v01.mp4")
tc = f"drawtext=fontfile='{FONT}':timecode='00\\:00\\:00\\:00':rate=25:fontcolor=white:fontsize=40:box=1:boxcolor=black@0.6:boxborderw=10:x=30:y=30"
run(["ffmpeg", "-v", "error", "-y", "-i", cat, "-vf", tc, "-c:v", "libx264", "-preset", "slow", "-b:v", "1400k", "-maxrate", "2500k",
     "-bufsize", "5000k", "-pix_fmt", "yuv420p", "-r", "25", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", final])
json.dump({"timeline": timeline, "alts": {k: [os.path.basename(x) for x in v] for k, v in ALTS.items()}, "duration": round(rec, 3)},
          open(os.path.join(OUT, "rawcut_timeline.json"), "w"), indent=1)
print("ok", final, round(rec, 2), "s")
