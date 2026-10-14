"""FCP7 XML for the shark raw cut: V1 best takes (script order), V2-V4 alternative takes (disabled),
A1/A2 clip audio, sequence markers for missing scenes. usage: rawcut_xml.py ROOT TIMELINE.json OUT.xml"""
import json, os, subprocess, sys
from urllib.parse import quote
ROOT, TL, OUT = sys.argv[1:4]
MAC = "/Users/robinlohnke/Kollektiv Oskar Dropbox/Projekte/Lohro/23-01-12 Vlog Wöchentlich/05_KURZFILM_RAWCUT_FLOW/2026-01-24_Haifilm/02_RAW/"
# local file -> Dropbox name in 02_RAW
NAMES = {"3_jonas_handgranate.mp4": "echt/3 jonas handgranate.mp4", "1_JONAS_LAUFEN.mp4": "echt/1 JONAS LAUFEN.mp4",
 "2_JONAS_HOCHSCHAUEN.mp4": "echt/2 JONAS HOCHSCHAUEN.mp4", "4_JONAS_EXPLOSION.mp4": "echt/4 JONAS EXPLOSION.mp4",
 "5_JONAS_PISTOLE_SCHIESSEN.mp4": "echt/5 JONAS PISTOLE SCHIESSEN.mp4", "6_JONAS_RENNEN.mp4": "echt/6 JONAS RENNEN.mp4",
 "7_JONAS_HANDGRANATE_UND_HAI.mp4": "echt/7 JONAS HANDGRANATE UND HAI.mp4", "8_HAI_FLIEGT_AUF_JONAS_ZU.mp4": "echt/8 HAI FLIEGT AUF JONAS ZU.mp4",
 "jonas_sitzt.mp4": "echt/Jonas sitzt.mp4",
 "Familie_120715.mp4": "ai_familie/hf_20260625_120715_f015fd56-e4b7-4287-a585-2afd474a7a3a.mp4",
 "Familie_115049.mp4": "ai_familie/hf_20260625_115049_195fd9be-de25-4cb4-a61f-34f4a133b1e1.mp4",
 "Hai_Verfolgung3_episch.mp4": "ai_hai/hHai Verfolgung3 episch_f_20260625_123312_80418c9f-7251-499f-968c-87ba9e1d6570.mp4",
 "Hai_Verfolgung2_schnell.mp4": "ai_hai/Hai Verfolgung2 schnell_hf_20260625_123129_6b21255e-220f-4352-8b48-2b14304a2fda.mp4",
 "Hai_Verfolgung1.mp4": "ai_hai/Hai Verfolgung1_hf_20260625_122234_655a57d5-e608-4ac7-83e2-3798894417c5.mp4",
 "Hai_dreht_zu_Kamera.mp4": "ai_hai/Hai dreht zu Kamera_hf_20260625_141058_fde611b3-10a0-4a5d-82aa-12f6bf4798eb.mp4",
 "Hai_schwimmt_ueber_Kamera.mp4": "ai_hai/Hai schwimmt über Kamerahf_20260625_114053_1f167ed2-c0a5-40a2-9ec8-e92f0252529a.mp4",
 "H02_granate_anflug_maul.mp4": "ai_hai/02_granate_anflug_maul_eff92c82.mp4", "H01_granate_maul_explosion.mp4": "ai_hai/01_granate_maul_explosion_9bbd6ceb.mp4",
 "H03_hai_ueber_berge.mp4": "ai_hai/03_hai_ueber_berge_6352844d.mp4", "H04_hai_narbe_detail.mp4": "ai_hai/04_hai_narbe_detail_701193cb.mp4",
 "Hai_Schuesse_prallen_ab.mp4": "ai_hai/Hai Schüsse prallen abhf_20260625_143344_c333Hai Sc4216-0009-40a5-a1a3-94f8657288a1.mp4",
 "Granate_ins_Maul_Hai_explodiert.mp4": "ai_hai/Granate fliegt ins Maul Hai explodiert_hf_20260625_140344_974d7356-9802-47ec-b07a-65109d048459.mp4",
 "Granate_fliegt_und_Hai_explodiert.mp4": "ai_hai/Granate fliegt und Hai explodiert_hf_20260625_142122_549b5687-20c5-4850-b129-22f27d53ae25.mp4"}
def local(n):
    for d in ("dl/v2v", "dl/ai", "dl/hai"):
        p = os.path.join(ROOT, d, n)
        if os.path.exists(p): return p
def probe(p):
    o = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height,r_frame_rate:format=duration", "-of", "json", p], capture_output=True, text=True).stdout)
    v = [s for s in o["streams"] if s["codec_type"] == "video"][0]; n, d = v["r_frame_rate"].split("/")
    return v["width"], v["height"], round(int(n) / int(d)), float(o["format"]["duration"])
def rate(tb): return f"<rate><timebase>{tb}</timebase><ntsc>FALSE</ntsc></rate>"
files = {}
def fileref(n):
    w, h, fps, dur = probe(local(n)); fid = "f_" + n.replace(".", "_")
    if fid in files: return fid, w, h, fps, dur, f'<file id="{fid}"/>'
    files[fid] = 1
    x = (f'<file id="{fid}"><name>{os.path.basename(NAMES[n])}</name><pathurl>file://localhost{quote(MAC + NAMES[n])}</pathurl>{rate(fps)}<duration>{round(dur*fps)}</duration>'
         f'</file>')
    return fid, w, h, fps, dur, x
def clip(cid, n, rin, rout, sin, enabled=True, kind="video"):
    fid, w, h, fps, dur, fx = fileref(n)
    scale = min(1920 / w, 1080 / h) * 100
    motion = ("" if kind != "video" else
              f'<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effecttype>motion</effecttype><mediatype>video</mediatype>'
              f'<parameter><parameterid>scale</parameterid><name>Scale</name><value>{scale:.2f}</value></parameter></effect></filter>')
    st = "" if kind == "video" else "<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack>"
    return (f'<clipitem id="{cid}"><name>{os.path.basename(NAMES[n])}</name><enabled>{"TRUE" if enabled else "FALSE"}</enabled>{rate(fps)}<start>{round(rin*25)}</start><end>{round(rout*25)}</end><in>{round(sin*fps)}</in><out>{round((sin + rout - rin)*fps)}</out>{fx}{motion}{st}</clipitem>')
d = json.load(open(TL)); tl = d["timeline"]; total = round(d["duration"] * 25)
v1, a1, markers = [], [], []
for k, t in enumerate(tl):
    if t["src"] is None:
        markers.append(f'<marker><name>FEHLT Sz {t["scene"]}</name><comment>{t["label"]}</comment><in>{round(t["rec_in"]*25)}</in><out>-1</out></marker>')
        continue
    v1.append(clip(f"v{k}", t["src"], t["rec_in"], t["rec_out"], t["in"]))
    a1.append(clip(f"a{k}", t["src"], t["rec_in"], t["rec_out"], t["in"], kind="audio"))
alt_tracks = [[], [], []]
for sc, alts in d["alts"].items():
    first = min(t["rec_in"] for t in tl if t["scene"] == int(sc) and t["src"])
    for i, n in enumerate(alts):
        dur = probe(local(n))[3]
        alt_tracks[i].append(clip(f"alt{sc}_{i}", n, first, round(first + int(dur * 25) / 25, 2), 0.0, enabled=False))
xml = ('<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4">\n<sequence id="haifilm-rawcut"><name>Haifilm_rawcut_v01</name>'
       f'<duration>{total}</duration>{rate(25)}<timecode>{rate(25)}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>\n'
       + "".join(markers) + "\n<media><video><format><samplecharacteristics>" + rate(25) +
       "<width>1920</width><height>1080</height><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>\n"
       "<track>" + "\n".join(v1) + "</track>\n" + "".join("<track>" + "\n".join(t) + "</track>\n" for t in alt_tracks) +
       "</video>\n<audio><numOutputChannels>2</numOutputChannels><track>" + "\n".join(a1) + "</track></audio></media>\n</sequence>\n</xmeml>\n")
open(OUT, "w").write(xml); print(OUT, len(xml), "bytes", len(v1), "V1 clips", sum(len(t) for t in alt_tracks), "alts", len(markers), "markers")
