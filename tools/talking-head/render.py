"""Lohro Talking-Head reel renderer (ffmpeg fallback for the Premiere step).

usage: render.py EDL.json ROOT OUTDIR
Reads the EDL (segments, cutaways, graphics, framing), the record-time transcript of the
cut voice (edit/<id>_voice_cut.json), the per-clip grade params and renders:
  master mp4 (graphics burned, subtitles as soft track), preview mp4 (subtitles burned),
  graphics overlay mov (ProRes 4444 alpha, for Premiere V2), srt, stills, report json.
"""
import json, os, subprocess, sys, shutil, re
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edl as E, grade as G

FPS = 25
W, H = 1080, 1920
RED, BLUE = "D02018", "3B7BF2"


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        sys.stderr.write(" ".join(cmd) + "\n" + r.stderr[-3000:]); raise SystemExit(1)
    return r


def probe_size(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:stream_side_data=rotation",
               "-of", "json", path]).stdout
    st = json.loads(out)["streams"][0]; w, h = st["width"], st["height"]
    rot = 0
    for sd in st.get("side_data_list", []) or []:
        if "rotation" in sd: rot = abs(int(sd["rotation"]))
    return (h, w) if rot in (90, 270) else (w, h)


def ass_color(hexrgb, alpha="00"):
    r, g, b = hexrgb[0:2], hexrgb[2:4], hexrgb[4:6]
    return f"&H{alpha}{b}{g}{r}"


def ts_ass(t):
    t = max(0, t); h = int(t // 3600); m = int(t % 3600 // 60); s = t % 60
    return f"{h}:{m:02d}:{s:05.2f}"


def ts_srt(t):
    ms = int(round(t * 1000)); h, ms = divmod(ms, 3600000); m, ms = divmod(ms, 60000); s, ms = divmod(ms, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# ---------------------------------------------------------------- words / subtitles
def load_words(path):
    d = json.load(open(path)); words = []
    for s in d["segments"]:
        for w in s["words"]:
            words.append({"w": w["w"].strip(), "s": w["s"], "e": w["e"]})
    return words


def norm(w): return re.sub(r"[^a-z']", "", w.lower())


def find_span(words, seq):
    seq = [norm(x) for x in seq]
    for i in range(len(words) - len(seq) + 1):
        if [norm(words[i + k]["w"]) for k in range(len(seq))] == seq:
            return i, i + len(seq) - 1
    raise SystemExit(f"words not found: {seq}")


WEAK = {"and", "so", "to", "a", "an", "the", "of", "in", "on", "my", "your", "with", "at", "for", "but",
        "if", "that", "when", "about", "is", "be", "i", "i'm", "really", "more", "any", "or", "as"}


def chunk_words(words, max_words=4, max_chars=22):
    """Phrase-aware subtitle lines. Words are split into 'sentences' at punctuation or pauses > 0.35 s;
    each sentence is cut into 1-3-word lines by dynamic programming that penalises lines ending on a
    weak word (and, to, the, ...) and one-word lines."""
    sents, cur = [], []
    for i, w in enumerate(words):
        cur.append(i)
        nxt = words[i + 1] if i + 1 < len(words) else None
        if nxt is None or w["w"][-1:] in ".,?!" or nxt["s"] - w["e"] > 0.35:
            sents.append(cur); cur = []
    # glue a lone weak word ("and", "but") to the following sentence
    merged = []
    for sidx in sents:
        if merged and len(merged[-1]) == 1 and norm(words[merged[-1][0]]["w"]) in WEAK: merged[-1] += sidx
        else: merged.append(sidx)
    def cost(ids):
        txt = " ".join(words[k]["w"] for k in ids)
        if len(ids) > max_words or (len(txt) > max_chars and len(ids) > 1): return 1e9
        c = 0.0
        if norm(words[ids[-1]]["w"]) in WEAK: c += 3.0
        c += 1.5 * sum(1 for k in ids[1:] if norm(words[k]["w"]) in ("so", "because", "but", "when", "if"))
        if len(ids) == 1: c += 1.6 if len(txt) < 8 else 0.8
        if len(ids) == 2: c += 0.2
        if len(ids) == 4: c += 0.5
        return c
    lines = []
    for ids in merged:
        n = len(ids); best = [0.0] + [1e18] * n; back = [0] * (n + 1)
        for j in range(1, n + 1):
            for k in range(max(0, j - max_words), j):
                v = best[k] + cost(ids[k:j])
                if v < best[j]: best[j], back[j] = v, k
        cuts, j = [], n
        while j > 0: cuts.append((back[j], j)); j = back[j]
        for k, j in reversed(cuts): lines.append(ids[k:j])
    out = []
    for i, c in enumerate(lines):
        s = words[c[0]]["s"]; e = words[c[-1]]["e"]
        if i + 1 < len(lines): e = max(e, min(words[lines[i + 1][0]]["s"], e + 0.25))
        text = " ".join(words[k]["w"] for k in c).rstrip(",.")
        out.append({"s": round(s, 3), "e": round(max(e, s + 0.35), 3), "text": text, "idx": list(c)})
    for i in range(len(out) - 1):
        out[i]["e"] = min(out[i]["e"], out[i + 1]["s"])
    return out


# ---------------------------------------------------------------- main
def main():
    edl_path, root, outdir = sys.argv[1], os.path.abspath(sys.argv[2]), os.path.abspath(sys.argv[3])
    os.makedirs(outdir, exist_ok=True); tmp = os.path.join(outdir, "_tmp"); os.makedirs(tmp, exist_ok=True)
    e = E.load(edl_path, root); cid = e["id"]; clip = e["clip"]
    fonts = os.path.join(root, "fonts")
    accent = BLUE if e["variant"] == "blau" else RED
    name = f"KW42_{e['thema']}_{clip}"
    report = {"name": name, "edl": e["segments"], "rec": e["rec"]}

    # ---- grade LUT (brand LUT + per-clip correction, baked)
    params = json.load(open(os.path.join(root, "work", "grade_params.json")))[e["grade_key"]]
    lut = G.read_cube(os.path.join(root, "dl", "LUT_SLog3_Kodak250D.cube"))
    cube = os.path.join(outdir, f"{clip}_LOHRO_grade.cube")

    def bake():
        n = 33; g = np.linspace(0, 1, n, dtype=np.float32)
        b, gg, r = np.meshgrid(g, g, g, indexing="ij"); grid = np.stack([r, gg, b], -1)
        out = G.full_grade(grid, lut, params)
        with open(cube, "w") as f:
            f.write(f'TITLE "LOHRO {clip} S-Log3 -> Kodak250D + Gawx-Korrektur (KW42)"\nLUT_3D_SIZE {n}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
            for row in out.reshape(-1, 3): f.write(f"{row[0]:.6f} {row[1]:.6f} {row[2]:.6f}\n")
    bake()

    # ---- framing per segment
    sw, sh = probe_size(e["src"])
    fr = e["framing"]
    faces = None
    if fr["mode"] == "faces":
        faces = json.load(open(os.path.join(root, "edit", f"{cid}_faces.json")))
    zooms, last_change, cur = [], -99.0, fr["base_zoom"]
    for i, ((a, b), (r0, r1)) in enumerate(zip(e["segments"], e["rec"])):
        if i > 0 and (r0 - last_change) >= 2.5 and (b - a) > 0.6:
            cur = fr["punch"] if cur == fr["base_zoom"] else fr["base_zoom"]; last_change = r0
        elif i == 0: last_change = r0
        zooms.append(cur)
    report["zooms"] = zooms

    def crop_for(i, z):
        cw = min(sw, sh * 9 / 16) / z; ch = cw * 16 / 9
        if faces and faces[i]["cx"] is not None: cx, cy = faces[i]["cx"] * sw, faces[i]["cy"] * sh
        elif faces: cx, cy = 0.46 * sw, 0.37 * sh
        else: cx, cy = fr["cx"] * sw, 0.45 * sh
        x0 = min(max(cx - cw / 2, 0), sw - cw); y0 = min(max(cy - fr["face_y_out"] * ch, 0), sh - ch)
        even = lambda v: int(v) // 2 * 2
        return even(cw), even(ch), even(x0), even(y0)

    # ---- video pieces (record order)
    pieces = []
    cut_from = {c["from_src"]: c for c in e.get("cutaways", [])}
    first_cut_src = min(cut_from) if cut_from else None
    for i, ((a, b), (r0, r1)) in enumerate(zip(e["segments"], e["rec"])):
        if first_cut_src is not None and b <= first_cut_src + 1e-6:
            pieces.append(("main", a, b, i))
        elif first_cut_src is not None and a < first_cut_src < b:
            pieces.append(("main", a, E.snap(first_cut_src), i))
        elif first_cut_src is None:
            pieces.append(("main", a, b, i))
    total = e["duration"] + e.get("tail", 0.0)
    for c in e.get("cutaways", []):
        r_from = E.src_to_rec(e, E.snap(c["from_src"]))
        r_to = total if c["to_src"] == "END" else E.src_to_rec(e, E.snap(c["to_src"]))
        pieces.append(("cut", os.path.join(root, c["file"]), c["in"], round(r_to - r_from, 4)))
    report["pieces"] = [p if p[0] == "main" else (p[0], os.path.basename(p[1]), p[2], p[3]) for p in pieces]

    REUSE = "--reuse" in sys.argv
    parts = []; crops = []
    for k, p in enumerate(pieces):
        out = os.path.join(tmp, f"p{k:02d}.mov")
        if p[0] == "main":
            _, a, b, i = p; z = zooms[i]; cw, ch, x0, y0 = crop_for(i, z); crops.append([cw, ch, x0, y0])
            if REUSE and os.path.exists(out): parts.append(out); continue
            vf = (f"crop={cw}:{ch}:{x0}:{y0},scale={W}:{H}:flags=lanczos+accurate_rnd:in_range=tv:in_color_matrix=bt709,"
                  f"format=rgb48le,lut3d=file='{cube}':interp=tetrahedral,"
                  f"scale=out_color_matrix=bt709:out_range=tv,format=yuv422p10le")
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{a:.3f}", "-i", e["src"], "-t", f"{b - a:.3f}", "-an",
                 "-vf", vf, "-r", str(FPS), "-c:v", "prores_ks", "-profile:v", "3", out])
        else:
            _, f, tin, dur = p; crops.append(None)
            if REUSE and os.path.exists(out): parts.append(out); continue
            vf = (f"scale={W}:-2:flags=lanczos,pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:black,format=yuv422p10le")
            run(["ffmpeg", "-v", "error", "-y", "-ss", f"{tin:.3f}", "-i", f, "-t", f"{dur:.3f}", "-an",
                 "-vf", vf, "-r", str(FPS), "-c:v", "prores_ks", "-profile:v", "3", out])
        parts.append(out)
    lst = os.path.join(tmp, "list.txt"); open(lst, "w").write("".join(f"file '{p}'\n" for p in parts))
    base = os.path.join(tmp, "base.mov")
    run(["ffmpeg", "-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", base])

    # ---- audio: voice chain + music bed
    voice = os.path.join(root, "edit", f"{cid}_voice_cut.wav")
    vproc = os.path.join(tmp, "voice.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", voice, "-af",
         f"apad=pad_dur={e.get('tail', 0.0)},highpass=f=80,afftdn=nf=-42:nr=10,"
         "equalizer=f=250:t=q:w=1:g=-2,equalizer=f=3500:t=q:w=1.2:g=2,"
         "acompressor=threshold=-22dB:ratio=3:attack=5:release=90:makeup=2,"
         "loudnorm=I=-15:TP=-2:LRA=7", "-ar", "48000", "-ac", "2", vproc])
    mproc = os.path.join(tmp, "music.wav")
    run(["ffmpeg", "-v", "error", "-y", "-ss", str(e["music_in"]), "-t", f"{total:.3f}", "-i", e["music"], "-af",
         f"loudnorm=I=-31:TP=-6:LRA=11,afade=t=in:d=0.4,afade=t=out:st={max(0, total - 1.2):.3f}:d=1.2",
         "-ar", "48000", "-ac", "2", mproc])
    mix = os.path.join(tmp, "mix.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", vproc, "-i", mproc, "-filter_complex",
         "[1:a][0:a]sidechaincompress=threshold=0.04:ratio=3:attack=20:release=300[duck];"
         "[0:a][duck]amix=inputs=2:normalize=0:duration=first,alimiter=limit=0.84:level=false[a]",
         "-map", "[a]", "-ar", "48000", mix])

    def lufs(path):
        r = subprocess.run(["ffmpeg", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                           capture_output=True, text=True).stderr
        I = float(re.findall(r"I:\s+(-?[\d.]+) LUFS", r)[-1]); tp = float(re.findall(r"Peak:\s+(-?[\d.]+) dBFS", r)[-1])
        return I, tp
    I, tp = lufs(mix); gain = -14.0 - I
    gain = min(gain, -1.0 - tp)  # keep true peak <= -1 dBTP
    final_audio = os.path.join(tmp, "final.wav")
    run(["ffmpeg", "-v", "error", "-y", "-i", mix, "-af", f"volume={gain:.2f}dB", "-ar", "48000", final_audio])
    report["audio"] = {"mix_before": [I, tp], "gain_db": round(gain, 2), "final": lufs(final_audio)}

    # ---- subtitles + graphics (record time)
    words = load_words(os.path.join(root, "edit", f"{cid}_voice_cut.json"))
    subs = chunk_words(words)
    gr = e["graphics"]
    hi, _ = find_span(words, [gr["headline"]["word"]])
    hl = (words[hi]["s"], words[hi]["e"] + 0.5)
    c0, c1 = find_span(words, gr["card"]["words"]); card = (E.snap(words[c0]["s"]), E.snap(words[c1]["e"] + 0.12))
    s0, s1 = find_span(words, gr["serif"]["words"]); serif = (words[s0]["s"], words[s1]["e"] + 0.2)
    report["graphics"] = {"headline": hl, "card": card, "serif": serif}

    srt = os.path.join(outdir, f"{name}_EN.srt")
    with open(srt, "w") as f:
        for k, s in enumerate(subs, 1):
            f.write(f"{k}\n{ts_srt(s['s'])} --> {ts_srt(s['e'])}\n{s['text']}\n\n")

    head = ("[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n"
            "[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, "
            "Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\n"
            f"Style: Sub,Inter Tight SemiBold,56,&H00FFFFFF,&H00FFFFFF,&H00000000,&H8C000000,0,0,0,0,100,100,0,0,1,0,2,2,120,120,560,1\n"
            f"Style: Head,Archivo Condensed ExtraBold,250,{ass_color(accent)},&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,0,0,5,40,40,0,1\n"
            f"Style: CardText,Archivo Condensed ExtraBold,190,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,2,0,1,0,0,5,60,60,0,1\n"
            f"Style: Serif,Instrument Serif,92,&H00FFFFFF,&H00FFFFFF,&H00000000,&H8C000000,0,1,0,0,100,100,0,0,1,0,2,2,90,90,560,1\n\n"
            "[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n")
    g_events = [
        f"Dialogue: 2,{ts_ass(hl[0])},{ts_ass(hl[1])},Head,,0,0,0,,{{\\pos(540,{gr['headline']['y']})\\fad(60,120)}}{gr['headline']['text']}",
        f"Dialogue: 5,{ts_ass(card[0])},{ts_ass(card[1])},CardText,,0,0,0,,{{\\pos(0,0)\\an7\\p1\\c{ass_color(accent)}}}m 0 0 l 1080 0 1080 1920 0 1920{{\\p0}}",
        f"Dialogue: 6,{ts_ass(card[0])},{ts_ass(card[1])},CardText,,0,0,0,,{{\\pos(540,960)}}{gr['card']['text']}",
        f"Dialogue: 3,{ts_ass(serif[0])},{ts_ass(serif[1])},Serif,,0,0,0,,{{\\fad(120,200)}}{gr['serif']['text']}",
    ]
    sub_events = []
    serif_idx = set(range(s0, s1 + 1))
    for s in subs:
        if set(s["idx"]) & serif_idx: continue          # state 4 replaces the running subtitle
        if s["s"] >= card[0] - 0.01 and s["e"] <= card[1] + 0.01: continue  # card carries the line
        sub_events.append(f"Dialogue: 1,{ts_ass(s['s'])},{ts_ass(s['e'])},Sub,,0,0,0,,{s['text']}")
    g_ass = os.path.join(tmp, "graphics.ass"); open(g_ass, "w").write(head + "\n".join(g_events) + "\n")
    p_ass = os.path.join(tmp, "preview.ass"); open(p_ass, "w").write(head + "\n".join(g_events + sub_events) + "\n")
    shutil.copy(g_ass, os.path.join(outdir, f"{name}_grafik.ass"))
    shutil.copy(p_ass, os.path.join(outdir, f"{name}_vorschau_alle_zustaende.ass"))

    # ---- encodes
    enc = ["-c:v", "libx264", "-preset", "slow", "-crf", "18", "-maxrate", "20M", "-bufsize", "40M", "-profile:v", "high", "-level:v", "4.2", "-pix_fmt", "yuv420p",
           "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709", "-color_range", "tv", "-r", str(FPS),
           "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-movflags", "+faststart"]
    grain = "noise=c0s=3:c0f=t+u"
    master = os.path.join(outdir, f"{name}_v01.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-i", base, "-i", final_audio, "-i", srt, "-map", "0:v", "-map", "1:a", "-map", "2:s",
         "-vf", f"format=yuv420p,{grain},ass='{g_ass}':fontsdir='{fonts}'", *enc, "-c:s", "mov_text",
         "-metadata:s:s:0", "language=eng", "-metadata:s:a:0", "language=eng", "-t", f"{total:.3f}", master])
    preview = os.path.join(outdir, f"{name}_v01_vorschau-mit-untertiteln.mp4")
    run(["ffmpeg", "-v", "error", "-y", "-i", base, "-i", final_audio, "-map", "0:v", "-map", "1:a",
         "-vf", f"format=yuv420p,{grain},ass='{p_ass}':fontsdir='{fonts}'", *enc, "-t", f"{total:.3f}", preview])
    overlay = os.path.join(outdir, f"{name}_grafik_overlay.mov")
    run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", f"color=c=black@0.0:s={W}x{H}:r={FPS}:d={total:.3f},format=yuva444p10le",
         "-vf", f"ass='{g_ass}':fontsdir='{fonts}':alpha=1", "-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le", overlay])
    shutil.copy(final_audio, os.path.join(outdir, f"{name}_master_audio_-14LUFS.wav"))

    # ---- stills (same frame: S-Log3 raw / brand LUT only / final) + measurements
    mid = [p for p in pieces if p[0] == "main"][len([p for p in pieces if p[0] == "main"]) // 2]
    _, a, b, i = mid; t = (a + b) / 2; cw, ch, x0, y0 = crop_for(i, zooms[i])
    raw = G.grab_crop(e["src"], t, cw, ch, x0, y0, W, H)
    stills = {"01_slog3_raw": raw, "02_nur_brand-LUT": G.apply_lut(raw, lut), "03_final_gawx": G.full_grade(raw, lut, params)}
    from PIL import Image
    meas = {}
    for k, img in stills.items():
        Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(outdir, f"{clip}_still_{k}.jpg"), quality=92)
        meas[k] = G.metrics(img)
    # measure the actual encoded master too (graded frames only, no graphics) at 5 spots
    fr_meas = []
    for (a, b, i) in [(p[1], p[2], p[3]) for p in pieces if p[0] == "main"]:
        r0 = e["rec"][i][0]; tt = r0 + (b - a) / 2
        if card[0] - 0.1 <= tt <= card[1] + 0.1: continue
        fr_meas.append(G.metrics(G.grab_plain(base, tt, 540, 960)))
    meas["master_mittel_ueber_segmente"] = {k: round(float(np.mean([m[k] for m in fr_meas])), 1) for k in fr_meas[0]}
    report["grading"] = {"params": params, "metrics": meas, "check": {k: G.check(v) for k, v in meas.items()}, "still_time_src": t}
    report["subs"] = subs; report["duration"] = total; report["crops"] = crops
    json.dump(report, open(os.path.join(outdir, f"{name}_report.json"), "w"), indent=1, default=float)
    print(json.dumps({k: report[k] for k in ("name", "duration", "audio", "graphics", "zooms")}, default=float))
    print(json.dumps(report["grading"]["metrics"], default=float))


if __name__ == "__main__":
    main()
