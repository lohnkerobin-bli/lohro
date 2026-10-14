"""Emit build_premiere_KW42.jsx with the reel data embedded.
usage: make_jsx.py OUT.jsx reelA_xml reelB_xml ...  (each xml has a sibling *_motion.json and *_EN.srt)"""
import json, os, sys

out = sys.argv[1]; reels = []
for x in sys.argv[2:]:
    base = os.path.basename(x).replace("_premiere.xml", "")
    motion = json.load(open(x.replace(".xml", "_motion.json")))
    reels.append({"name": base, "xml": os.path.basename(x), "srt": base + "_EN.srt", "motion": motion})

JSX = r'''// build_premiere_KW42.jsx  -  Lohro Talking-Head-Flow, Test-Reels KW42 (von Claude erzeugt, 14.10.2026)
//
// WAS ES TUT (in Premiere Pro, ExtendScript):
//   1. legt  03_PREMIERE/KW42_TalkingHead.prproj  an (oder nutzt das offene Projekt, wenn es dort liegt)
//   2. importiert pro Reel die FCP-XML-Sequenz (1080x1920, 25p, harte Schnitte nach Schnittliste,
//      Musik auf A2 bei -20 dB, Grafik-Overlay auf V2) - Medienpfade werden an diesen Ordner angepasst
//   3. setzt Skalierung/Position jedes Clips exakt (Framing nach Hochformat-Regeln)
//   4. importiert die .srt und legt sie als ECHTE Untertitelspur an (createCaptionTrack)
//   5. speichert das Projekt
// STARTEN: Doppelklick auf  run_in_premiere.command  (Premiere muss laufen)  ODER in VS Code mit
//          der Extension "ExtendScript Debugger" -> Ziel "Adobe Premiere Pro" -> Run.
// NICHT automatisiert (API kann es nicht): LUT setzen -> siehe BERICHT.md, Abschnitt Grading.
#target premierepro

(function () {
    var REELS = __REELS__;
    var OLD_VLOG = "file://localhost/Users/robinlohnke/Kollektiv%20Oskar%20Dropbox/Projekte/Lohro/23-01-12%20Vlog%20W%C3%B6chentlich";
    var here = File($.fileName).parent;            // .../2026-KW42/03_PREMIERE
    var kw = here.parent;                          // .../2026-KW42
    var vlog = kw.parent.parent;                   // .../23-01-12 Vlog Woechentlich
    var log = [];
    function L(s) { log.push(s); $.writeln(s); }
    function fileUrl(f) { return "file://localhost" + encodeURI(f.fsName).replace(/#/g, "%23"); }

    // ---- 1. Projekt
    var projPath = here.fsName + "/KW42_TalkingHead.prproj";
    var openPath = (app.project && app.project.path) ? app.project.path : "";
    if (openPath.indexOf(here.fsName) !== 0) {
        if (!File(projPath).exists) {
            try { app.newProject(projPath); L("Projekt neu: " + projPath); }
            catch (e) { alert("Bitte in Premiere ein neues Projekt in diesem 03_PREMIERE-Ordner anlegen und das Skript erneut starten.\n" + e); return; }
        }
        if (!app.project || app.project.path.indexOf(here.fsName) !== 0) app.openDocument(projPath, true, true, true);
    }
    var proj = app.project;

    function findItem(parent, name) {
        for (var i = 0; i < parent.children.numItems; i++) {
            var it = parent.children[i];
            if (it.name === name) return it;
            if (it.type === ProjectItemType.BIN) { var r = findItem(it, name); if (r) return r; }
        }
        return null;
    }
    function findSeq(name) {
        for (var i = 0; i < proj.sequences.numSequences; i++) if (proj.sequences[i].name === name) return proj.sequences[i];
        return null;
    }
    function setMotion(clip, m) {
        var comps = clip.components;
        for (var k = 0; k < comps.numItems; k++) {
            var c = comps[k];
            if (c.matchName === "AE.ADBE Motion" || c.displayName === "Motion" || c.displayName === "Bewegung") {
                var props = c.properties, okPos = false, okScale = false;
                for (var p = 0; p < props.numItems; p++) {
                    var n = props[p].displayName;
                    if (n === "Position") { props[p].setValue(m.pos, true); okPos = true; }
                    if (n === "Scale" || n === "Skalierung") { props[p].setValue(m.scale, true); okScale = true; }
                }
                if (!okPos) props[0].setValue(m.pos, true);        // Reihenfolge: Position, Skalierung, ...
                if (!okScale) props[1].setValue(m.scale, true);
                return true;
            }
        }
        return false;
    }

    for (var r = 0; r < REELS.length; r++) {
        var R = REELS[r];
        // ---- 2. XML mit angepassten Pfaden importieren
        var src = new File(here.fsName + "/" + R.xml); src.encoding = "UTF-8";
        if (!src.open("r")) { L("FEHLT: " + R.xml); continue; }
        var txt = src.read(); src.close();
        txt = txt.split(OLD_VLOG).join(fileUrl(vlog));
        var tmp = new File(here.fsName + "/_import_" + R.xml); tmp.encoding = "UTF-8"; tmp.open("w"); tmp.write(txt); tmp.close();
        if (findSeq(R.name)) { L("Sequenz existiert schon, uebersprungen: " + R.name); continue; }
        proj.importFiles([tmp.fsName], true, proj.rootItem, false);
        var seq = findSeq(R.name);
        if (!seq) { L("Import fehlgeschlagen: " + R.name); continue; }
        // ---- 3. Framing exakt setzen
        var clips = seq.videoTracks[0].clips, n = 0;
        for (var c = 0; c < clips.numItems && c < R.motion.length; c++) if (setMotion(clips[c], R.motion[c])) n++;
        L(R.name + ": Motion gesetzt auf " + n + "/" + R.motion.length + " Clips");
        // ---- 4. Untertitel als echte Untertitelspur
        proj.importFiles([here.fsName + "/" + R.srt], true, proj.rootItem, false);
        var srtItem = findItem(proj.rootItem, R.srt);
        if (srtItem) {
            var fmt = (typeof Sequence !== "undefined" && Sequence.CAPTION_FORMAT_SUBTITLE !== undefined) ? Sequence.CAPTION_FORMAT_SUBTITLE : undefined;
            var ok = (fmt === undefined) ? seq.createCaptionTrack(srtItem, 0) : seq.createCaptionTrack(srtItem, 0, fmt);
            L(R.name + ": Untertitelspur " + (ok ? "angelegt" : "FEHLER - .srt bitte manuell auf die Sequenz ziehen"));
        } else L(R.name + ": .srt nicht gefunden");
        tmp.remove();
    }
    proj.save();
    L("Fertig. Projekt gespeichert.");
    alert("Lohro KW42\n\n" + log.join("\n"));
})();
'''
open(out, "w").write(JSX.replace("__REELS__", json.dumps(reels, ensure_ascii=False)))
print(out, os.path.getsize(out))
