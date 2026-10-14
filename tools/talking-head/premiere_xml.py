"""Write an FCP7 XML (xmeml v4) sequence for Premiere from the render report.

usage: premiere_xml.py EDL.json ROOT REPORT.json OUT.xml
Media paths use placeholders that build_premiere_KW42.jsx replaces at import time with the
real location on the Mac (relative to where the .jsx lives), so nothing is hard-wired:
  __KW__    -> .../04_TALKING_HEAD_FLOW/2026-KW42
  __VLOG__  -> .../23-01-12 Vlog Woechentlich
For a manual import (File > Import) the same file with Robin's known Dropbox path is written
as *_manual.xml.
"""
import json, os, subprocess, sys
from urllib.parse import quote
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import edl as E

FPS, W, H = 25, 1080, 1920
MAC_VLOG = "/Users/robinlohnke/Kollektiv Oskar Dropbox/Projekte/Lohro/23-01-12 Vlog Wöchentlich"


def f(t): return int(round(t * FPS))


def rate(): return "<rate><timebase>25</timebase><ntsc>FALSE</ntsc></rate>"


def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height:stream_side_data=rotation",
                          "-of", "json", path], capture_output=True, text=True).stdout
    d = json.loads(out); v = [s for s in d["streams"] if s["codec_type"] == "video"][0]
    rot = 0
    for sd in v.get("side_data_list", []) or []:
        rot = abs(int(sd.get("rotation", 0)))
    w, h = (v["height"], v["width"]) if rot in (90, 270) else (v["width"], v["height"])
    return w, h, float(d["format"]["duration"]), any(s["codec_type"] == "audio" for s in d["streams"])


def main():
    edl_path, root, rep_path, out_path = sys.argv[1:5]
    e = E.load(edl_path, root); rep = json.load(open(rep_path)); name = rep["name"]
    total = f(rep["duration"]); vlog_src = os.path.join(root, "dl")
    sw, sh, sdur, _ = probe(e["src"])
    files = {}  # id -> xml for first use

    def fileref(fid, url_rel, w, h, dur, audio_ch=2, base="__KW__"):
        if fid in files: return f'<file id="{fid}"/>'
        name_ = os.path.basename(url_rel)
        url = "file://localhost" + base + "/" + quote(url_rel)
        media = (f"<media><video><samplecharacteristics>{rate()}<width>{w}</width><height>{h}</height><anamorphic>FALSE</anamorphic>"
                 f"<pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video>")
        if audio_ch: media += f"<audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>{audio_ch}</channelcount></audio>"
        media += "</media>"
        x = f'<file id="{fid}"><name>{name_}</name><pathurl>{url}</pathurl>{rate()}<duration>{f(dur)}</duration>{media}</file>'
        files[fid] = True; return x

    def motion(scale, ch, cv):
        return ("<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory>"
                "<effecttype>motion</effecttype><mediatype>video</mediatype>"
                f'<parameter authoringApp="PremierePro"><parameterid>scale</parameterid><name>Scale</name><valuemin>0</valuemin><valuemax>1000</valuemax><value>{scale:.2f}</value></parameter>'
                f'<parameter authoringApp="PremierePro"><parameterid>center</parameterid><name>Center</name><value><horiz>{ch:.4f}</horiz><vert>{cv:.4f}</vert></value></parameter>'
                "</effect></filter>")

    # ---- V1 main + cutaways, collect motion for the JSX
    v1, a1, motions = [], [], []
    rec = 0.0; k = 0
    crops = rep["crops"]
    for p, c in zip(rep["pieces"], crops):
        if p[0] == "main":
            _, a, b, i = p; dur = b - a
            cw, chh, x0, y0 = c
            s = W / cw; scale = s * 100
            off_x = (sw / 2 - (x0 + cw / 2)) * s; off_y = (sh / 2 - (y0 + chh / 2)) * s
            fx = fileref("raw", f"01_RAW/{e['clip']}.MP4", sw, sh, sdur)
            v1.append(f'<clipitem id="v{k}"><name>{e["clip"]}</name><enabled>TRUE</enabled><duration>{f(sdur)}</duration>{rate()}'
                      f"<start>{f(rec)}</start><end>{f(rec + dur)}</end><in>{f(a)}</in><out>{f(b)}</out>{fx}"
                      f"{motion(scale, off_x / W, off_y / H)}</clipitem>")
            motions.append({"scale": round(scale, 3), "pos": [round(0.5 + off_x / W, 5), round(0.5 + off_y / H, 5)]})
        else:
            _, fname, tin, dur = p
            fw, fh, fdur, has_a = probe(os.path.join(root, "dl", "v2v", fname))
            orig = {"8_HAI_FLIEGT_AUF_JONAS_ZU.mp4": "8 HAI FLIEGT AUF JONAS ZU.mp4", "3_jonas_handgranate.mp4": "3 jonas handgranate.mp4"}[fname]
            fid = "cut_" + fname.split("_")[0]
            fx = fileref(fid, f"Claude/kurzfilm hai/VIDEO TO VIDEO/{orig}", fw, fh, fdur, audio_ch=2 if has_a else 0, base="__VLOG__")
            scale = W / fw * 100
            v1.append(f'<clipitem id="v{k}"><name>{orig}</name><enabled>TRUE</enabled><duration>{f(fdur)}</duration>{rate()}'
                      f"<start>{f(rec)}</start><end>{f(rec + dur)}</end><in>{f(tin)}</in><out>{f(tin + dur)}</out>{fx}"
                      f"{motion(scale, 0, 0)}</clipitem>")
            motions.append({"scale": round(scale, 3), "pos": [0.5, 0.5]})
        rec += (p[2] - p[1]) if p[0] == "main" else p[3]; k += 1

    # ---- A1 voice = camera channel 2 per EDL segment (unprocessed; master wav is the processed version)
    for j, ((a, b), (r0, r1)) in enumerate(zip(e["segments"], e["rec"])):
        fx = fileref("raw", f"01_RAW/{e['clip']}.MP4", sw, sh, sdur)
        a1.append(f'<clipitem id="a{j}"><name>{e["clip"]} (Kanal 2)</name><enabled>TRUE</enabled><duration>{f(sdur)}</duration>{rate()}'
                  f"<start>{f(r0)}</start><end>{f(r1)}</end><in>{f(a)}</in><out>{f(b)}</out>{fx}"
                  "<sourcetrack><mediatype>audio</mediatype><trackindex>2</trackindex></sourcetrack></clipitem>")
    # ---- A2 music bed (-20 dB)
    mname = os.path.basename(e["music"])
    morig = {"ES_Inbound.wav": "ES_Inbound - Brendon Moeller.wav", "ES_Some.mp3": "ES_Some - Hara Noda.mp3"}[mname]
    mdur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", e["music"]],
                                capture_output=True, text=True).stdout)
    murl = "file://localhost__VLOG__/" + quote(f"02_DATEN/02_AUDIO/01_MUSIC/{morig}")
    a2 = (f'<clipitem id="m0"><name>{morig}</name><enabled>TRUE</enabled><duration>{f(mdur)}</duration>{rate()}'
          f"<start>0</start><end>{total}</end><in>{f(e['music_in'])}</in><out>{f(e['music_in']) + total}</out>"
          f'<file id="music"><name>{morig}</name><pathurl>{murl}</pathurl>{rate()}<duration>{f(mdur)}</duration>'
          "<media><audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio></media></file>"
          "<filter><effect><name>Audio Levels</name><effectid>audiolevels</effectid><effectcategory>audiolevels</effectcategory>"
          "<effecttype>audiolevels</effecttype><mediatype>audio</mediatype><parameter><parameterid>level</parameterid><name>Level</name>"
          "<valuemin>0</valuemin><valuemax>3.98109</valuemax><value>0.1</value></parameter></effect></filter></clipitem>")
    # ---- V2 graphics overlay (ProRes 4444 alpha, lives next to this XML in 03_PREMIERE)
    ov = f"{name}_grafik_overlay.mov"
    v2 = (f'<clipitem id="g0"><name>{ov}</name><enabled>TRUE</enabled><duration>{total}</duration>{rate()}<start>0</start><end>{total}</end>'
          f'<in>0</in><out>{total}</out><file id="overlay"><name>{ov}</name><pathurl>file://localhost__KW__/{quote("03_PREMIERE/" + ov)}</pathurl>{rate()}'
          f"<duration>{total}</duration><media><video><samplecharacteristics>{rate()}<width>{W}</width><height>{H}</height>"
          "<anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics>"
          "</video></media></file><compositemode>normal</compositemode></clipitem>")

    seq = (f'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE xmeml>\n<xmeml version="4">\n<sequence id="seq-{e["id"]}"><name>{name}</name>'
           f"<duration>{total}</duration>{rate()}<timecode>{rate()}<string>00:00:00:00</string><frame>0</frame><displayformat>NDF</displayformat></timecode>\n"
           f"<media><video><format><samplecharacteristics>{rate()}<width>{W}</width><height>{H}</height><anamorphic>FALSE</anamorphic>"
           "<pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></format>\n"
           "<track>" + "\n".join(v1) + "</track>\n<track>" + v2 + "</track></video>\n"
           "<audio><numOutputChannels>2</numOutputChannels><track>" + "\n".join(a1) + "</track>\n<track>" + a2 + "</track></audio></media>\n"
           "</sequence>\n</xmeml>\n")
    kw_mac = MAC_VLOG + "/04_TALKING_HEAD_FLOW/2026-KW42"
    seq = seq.replace("file://localhost__KW__", "file://localhost" + quote(kw_mac)).replace("file://localhost__VLOG__", "file://localhost" + quote(MAC_VLOG))
    open(out_path, "w").write(seq)
    json.dump(motions, open(out_path.replace(".xml", "_motion.json"), "w"))
    print(out_path, len(seq), "bytes,", len(v1), "video clips,", len(a1), "voice clips")


if __name__ == "__main__":
    main()
