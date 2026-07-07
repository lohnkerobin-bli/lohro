#!/usr/bin/env python3
"""Regenerate data/seed.js from the canonical JSON files in data/.

The app is opened via file:// from Dropbox, where fetch() of local JSON is
blocked — so seed data ships as a plain JS file assigning window.SEED.
Run this after editing any data/*.json file:  python3 scripts/build-seed.py
"""
import json, os, sys, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

def load(name, default):
    path = os.path.join(DATA, name)
    if not os.path.exists(path):
        print(f"  ! {name} missing, using default")
        return default
    with open(path, encoding="utf-8") as f:
        return json.load(f)

def main():
    ideas = load("notion-ideas.json", [])
    projects_pipeline = load("notion-projects.json", [])
    youtube = load("notion-youtube.json", [])
    films = load("notion-films.json", [])
    festivals = load("festivals.json", {"academyRules": None, "festivals": []})

    now = datetime.datetime.now().isoformat(timespec="seconds")

    # --- normalize video-pipeline rows into app projects ---
    projects = []
    seen_titles = set()

    def type_from_format(fmt):
        if not fmt: return "other"
        if "Reel" in fmt: return "reel"
        if "Kurzfilm" in fmt: return "shortfilm"
        if "YouTube" in fmt: return "youtube"
        return "other"

    def status_from_phase(phase):
        return {
            "Online": "published", "Im Schnitt": "editing",
            "Diese Woche Filmen": "shooting", "Idee zum Filmen": "pre-production",
            "Neu Idee": "idea", "Ideen Archiv": "archived",
        }.get(phase or "", "idea")

    for i, row in enumerate(projects_pipeline):
        title = (row.get("title") or "").strip()
        if not title: continue
        key = title.lower()
        if key in seen_titles: continue
        seen_titles.add(key)
        notes_bits = []
        if row.get("videoTypes"): notes_bits.append("Series: " + ", ".join(row["videoTypes"]))
        if row.get("tags"): notes_bits.append("Tags: " + ", ".join(row["tags"]))
        projects.append({
            "id": row.get("id") or f"prj-vp-{i:03d}",
            "title": title,
            "type": type_from_format(row.get("format")),
            "status": status_from_phase(row.get("phase")),
            "owner": row.get("owner") or "Robin",
            "targetDate": row.get("uploadDate") or row.get("shootDate"),
            "link": None,
            "notes": " · ".join(notes_bits),
            "source": "notion-video-pipeline",
            "createdAt": now, "updatedAt": now,
        })

    yt_status = {
        "Idee": "idea", "In Vorbereitung": "writing", "Bereit zum Filmen": "pre-production",
        "Gefilmt": "editing", "Im Schnitt": "editing", "Bereit zum Upload": "editing",
        "Veröffentlicht": "published",
    }
    for i, row in enumerate(youtube):
        title = (row.get("title") or row.get("youtubeTitle") or "").strip()
        if not title: continue
        key = title.lower()
        if key in seen_titles: continue
        seen_titles.add(key)
        notes_bits = []
        if row.get("hook"): notes_bits.append("Hook: " + row["hook"])
        if row.get("mainPoint"): notes_bits.append("Main point: " + row["mainPoint"])
        if row.get("format"): notes_bits.append("Format: " + row["format"])
        projects.append({
            "id": row.get("id") or f"prj-yt-{i:03d}",
            "title": ("EP" + str(row["episodeNr"]) + " — " if row.get("episodeNr") else "") + title,
            "type": "youtube",
            "status": yt_status.get(row.get("status") or "", "idea"),
            "owner": "Robin",
            "targetDate": row.get("plannedUploadDate"),
            "link": None,
            "notes": " · ".join(notes_bits)[:500],
            "source": "notion-youtube-pipeline",
            "createdAt": now, "updatedAt": now,
        })

    # films DB rows: mostly video ideas; only import ones typed SHORTMOVIE or clearly films
    for i, row in enumerate(films):
        title = (row.get("title") or "").strip()
        if not title: continue
        vt = row.get("Video") or row.get("videoTypes") or []
        if isinstance(vt, str):
            try: vt = json.loads(vt)
            except Exception: vt = [vt] if vt else []
        if "SHORTMOVIE" not in vt: continue
        key = title.lower()
        if key in seen_titles: continue
        seen_titles.add(key)
        projects.append({
            "id": f"prj-film-{i:03d}", "title": title, "type": "shortfilm",
            "status": "idea", "owner": "Robin", "targetDate": None, "link": None,
            "notes": "From WAY TO OSCAR Filme DB", "source": "notion-films",
            "createdAt": now, "updatedAt": now,
        })

    seed = {
        "version": 1,
        "generated": now,
        "ideas": ideas,
        "projects": projects,
        "festivals": festivals,
    }

    out = os.path.join(DATA, "seed.js")
    with open(out, "w", encoding="utf-8") as f:
        f.write("/* AUTO-GENERATED by scripts/build-seed.py — do not edit by hand.\n")
        f.write("   Canonical data lives in data/*.json. Regenerate: python3 scripts/build-seed.py */\n")
        f.write("window.SEED = ")
        json.dump(seed, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    size = os.path.getsize(out)
    print(f"  seed.js written: {len(ideas)} ideas, {len(projects)} projects, "
          f"{len(festivals.get('festivals', []))} festivals, {size/1024:.0f} KB")

if __name__ == "__main__":
    main()
