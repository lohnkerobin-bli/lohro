/* ============ films.js — film development: dossier per film ============ */
"use strict";

var FilmsView = (function () {

  var STATUSES = [
    { key: "idea", label: "Idea", cls: "gray", tint: "tint-cream" },
    { key: "treatment", label: "Treatment", cls: "blue", tint: "tint-blue" },
    { key: "script", label: "Script", cls: "blue", tint: "tint-blue" },
    { key: "pre-production", label: "Pre-Production", cls: "gold", tint: "tint-gold" },
    { key: "shooting", label: "Shooting", cls: "red", tint: "tint-red" },
    { key: "post", label: "Post / Edit", cls: "red", tint: "tint-red" },
    { key: "finished", label: "Finished", cls: "teal", tint: "tint-teal" },
    { key: "festival-run", label: "Festival Run", cls: "gold", tint: "tint-gold" }
  ];

  function statusInfo(key) {
    return STATUSES.find(function (x) { return x.key === key; }) || STATUSES[0];
  }

  function newFilm(from) {
    var now = new Date().toISOString();
    var f = {
      id: uid("film"),
      title: (from && from.title) || "Untitled Film",
      logline: "",
      genre: "",
      themes: "",
      status: "idea",
      script: "",
      images: [],           // {id, url, caption}
      storyboard: [],       // {id, text (script anchor), url, caption}
      notes: (from && from.notes) || "",
      learnings: "",
      fromIdeaId: (from && from.id) || null,
      createdAt: now, updatedAt: now
    };
    Store.get().films.unshift(f);
    Store.save();
    return f;
  }

  // called from the Ideas view: turn an idea into a film dossier
  function developFromIdea(idea) {
    var f = newFilm(idea);
    if (idea.status === "Neu") { idea.status = "In Arbeit"; idea.updatedAt = new Date().toISOString(); Store.save(); }
    FilmsView._openId = f.id;
    location.hash = "#/films";
    toast('"' + f.title.slice(0, 40) + '" is now a film project');
    if (location.hash === "#/films") App.render();
  }

  function touch(f) {
    f.updatedAt = new Date().toISOString();
    Store.save();
  }

  /* ---------- detail page ---------- */

  function bindField(f, sel, prop, after) {
    var n = $(sel);
    if (!n) return;
    n.onchange = function () { f[prop] = n.value.trim ? n.value.trim() : n.value; touch(f); if (after) after(); };
  }

  /* ---------- storyboard (script-anchored frames) ---------- */

  function sbSorted(f) {
    return (f.storyboard || []).slice().sort(function (a, b) {
      var pa = f.script.indexOf(a.text), pb = f.script.indexOf(b.text);
      if (pa === -1) pa = 1e9; if (pb === -1) pb = 1e9;
      return pa - pb;
    });
  }

  function storyboardHTML(f) {
    var frames = sbSorted(f);
    return '<h2 class="section-title">🎞 Storyboard <span class="badge gray">' + frames.length + '</span></h2>' +
      '<div class="card soft mb">' +
      '<p class="muted mb" style="font-size:12.5px">Mark a passage in the script above, then hit <strong>“+ Frame from selection”</strong> — the frame stays anchored to that exact text. Add an image link per frame or let Claude generate one.</p>' +
      (frames.length === 0 ? '<div class="empty-note">No frames yet — select a line in the script and add your first frame.</div>' :
        '<div class="mood-grid">' + frames.map(function (fr, i) {
          var u = safeUrl(fr.url);
          return '<figure class="mood-item">' +
            (u ? '<img src="' + esc(u) + '" loading="lazy" alt="">' :
              '<div class="mood-link" style="font-size:11.5px;line-height:1.5;padding:12px">🎞 ' + (i + 1) + '<br><em>“' + esc(fr.text.slice(0, 90)) + (fr.text.length > 90 ? "…" : "") + '”</em></div>') +
            '<figcaption>' +
            '<div class="muted" style="font-size:10.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + (i + 1) + ' · “' + esc(fr.text.slice(0, 70)) + '”</div>' +
            (fr.caption ? '<div style="font-size:11px">' + esc(fr.caption) + '</div>' : "") +
            '<div class="row between mt" style="gap:4px">' +
            '<button class="small ghost" data-sb-img="' + esc(fr.id) + '" title="Set image link">🖼</button>' +
            '<button class="small ghost" data-sb-gen="' + esc(fr.id) + '" title="Copy a generate request for Claude">✨</button>' +
            '<button class="small ghost danger" data-sb-del="' + esc(fr.id) + '">✕</button></div>' +
            '</figcaption></figure>';
        }).join("") + '</div>') +
      '<div class="row mt"><button id="sb-shotlist">📋 Export shot list (.md)</button></div>' +
      '</div>';
  }

  function shotListMd(f) {
    var frames = sbSorted(f);
    var lines = ["# Shot list — " + f.title, "", "_Generated " + todayISO() + " from script + storyboard_", ""];
    var script = f.script || "";
    var heads = [];
    script.split("\n").forEach(function (ln, idx) {
      if (/^\s*(SZENE|SCENE|BLOCK|INT\.|EXT\.|SCHLUSS|INTRO)/i.test(ln)) heads.push({ line: ln.trim(), pos: script.split("\n").slice(0, idx).join("\n").length });
    });
    var n = 0;
    if (heads.length === 0) heads = [{ line: "FILM", pos: 0 }];
    heads.forEach(function (h, hi) {
      var end = hi + 1 < heads.length ? heads[hi + 1].pos : 1e12;
      lines.push("## " + h.line, "");
      frames.forEach(function (fr) {
        var p = script.indexOf(fr.text);
        if (p >= h.pos && p < end) {
          n++;
          lines.push("- [ ] **Shot " + n + "** — “" + fr.text.slice(0, 100) + "”" +
            (fr.caption ? " · " + fr.caption : "") + (safeUrl(fr.url) ? " · ref: " + fr.url : ""));
        }
      });
      if (lines[lines.length - 1].indexOf("## ") === 0) lines.push("_(no frames anchored here yet)_");
      lines.push("");
    });
    var orphans = frames.filter(function (fr) { return script.indexOf(fr.text) === -1; });
    if (orphans.length) {
      lines.push("## Frames whose anchor left the script", "");
      orphans.forEach(function (fr) { n++; lines.push("- [ ] **Shot " + n + "** — “" + fr.text.slice(0, 100) + "”"); });
      lines.push("");
    }
    if (f.images.length) {
      lines.push("## Moodboard references", "");
      f.images.forEach(function (img) { lines.push("- " + img.url + (img.caption ? " — " + img.caption : "")); });
    }
    return lines.join("\n");
  }

  /* ---------- Filmwissen (McKee coaching questions) ---------- */

  function filmwissenHTML(f) {
    var fc = window.SEED && window.SEED.filmcraft;
    if (!fc || !fc.groups) return "";
    var groups = fc.groups.filter(function (g) { return g.forStatus.indexOf(f.status) !== -1; });
    if (!groups.length) groups = [fc.groups[0]];
    // rotate daily so the questions stay fresh without any credits
    var day = Math.floor(Date.parse(todayISO()) / 86400000);
    return '<h2 class="section-title">🎓 Filmwissen</h2>' +
      '<div class="card soft tint-gold mb">' +
      '<p style="font-size:12.5px;margin-bottom:12px;opacity:.85">Fragen statt Antworten — nach Robert McKee, <em>Story</em>. Die Lösung findest du selbst. Rotiert täglich.</p>' +
      groups.map(function (g) {
        var qs = [];
        for (var i = 0; i < Math.min(4, g.questions.length); i++) {
          qs.push(g.questions[(day + i) % g.questions.length]);
        }
        return '<div style="font-weight:800;font-size:13px;margin:10px 0 6px">' + esc(g.label) + '</div>' +
          '<ul style="padding-left:18px;font-size:13.5px;line-height:1.7;display:flex;flex-direction:column;gap:7px">' +
          qs.map(function (q) { return '<li>' + esc(q) + '</li>'; }).join("") + '</ul>';
      }).join("") +
      '<p class="muted mt" style="font-size:11.5px">Für Feedback zu genau diesem Script: sag Claude einfach <em>“Feedback zu ' + esc(f.title.slice(0, 30)) + '”</em>.</p>' +
      '</div>';
  }

  /* ---------- location suggestions ---------- */

  function locationSuggestHTML(f) {
    var rel = Graph.related(f.id, 3, "location");
    if (!rel.length) return "";
    return '<h2 class="section-title">📍 Location ideas from your library</h2>' +
      '<div class="grid cols-3 mb">' +
      rel.map(function (r) {
        var s = Store.get();
        var loc = s.locations.find(function (x) { return x.id === r.node.id; }) || {};
        return '<div class="card soft tint-teal clickable" data-loc-open="' + esc(r.node.id) + '">' +
          '<div style="font-weight:700">📍 ' + esc(r.node.title) + '</div>' +
          (loc.vibe ? '<div class="muted mt" style="font-size:12px">' + esc(loc.vibe) + '</div>' : "") +
          '<div class="muted mt" style="font-size:11px">' + esc(loc.area || "") + '</div></div>';
      }).join("") + '</div>';
  }

  function detailHTML(f) {
    var st = statusInfo(f.status);
    return '' +
      '<div class="row between mb" style="flex-wrap:wrap;gap:10px">' +
        '<button class="ghost" id="film-back">← All films</button>' +
        '<span class="row">' +
        '<button class="ghost danger" id="film-delete">Delete film</button>' +
        '<button id="film-export">📄 Export dossier (.md)</button></span>' +
      '</div>' +

      '<div class="card soft mb">' +
        '<label class="field"><span>Title</span><input id="f-title" value="' + esc(f.title) + '" style="font-size:20px;font-weight:700"></label>' +
        '<label class="field"><span>Logline (one sentence — what is this film?)</span><textarea id="f-logline" style="min-height:52px">' + esc(f.logline) + '</textarea></label>' +
        '<div class="row">' +
        '<label class="field" style="flex:1"><span>Status</span><select id="f-status">' +
        STATUSES.map(function (x) { return '<option value="' + x.key + '"' + (f.status === x.key ? " selected" : "") + '>' + x.label + '</option>'; }).join("") +
        '</select></label>' +
        '<label class="field" style="flex:1"><span>Genre</span><input id="f-genre" value="' + esc(f.genre) + '" placeholder="Drama, Doku..."></label>' +
        '<label class="field" style="flex:1"><span>Themes</span><input id="f-themes" value="' + esc(f.themes) + '" placeholder="Freiheit, Perspektive..."></label>' +
        '</div>' +
        (f.fromIdeaId ? '<div class="muted" style="font-size:11.5px">Born from an idea in the vault · <a href="#/ideas">open Ideas →</a></div>' : "") +
        Graph.relatedHTML(f.id) +
      '</div>' +

      (assetUrl(f.id)
        ? '<div class="film-hero mb" style="background-image:linear-gradient(180deg,rgba(12,9,8,0) 40%,rgba(12,9,8,.72) 100%),url(' + assetUrl(f.id) + ')"><span class="film-hero-tag">✨ Generated key visual</span></div>'
        : "") +

      '<h2 class="section-title">✍️ Script</h2>' +
      '<div class="card soft mb">' +
        '<textarea id="f-script" style="min-height:340px;font-family:var(--font-mono);font-size:13px;line-height:1.7" placeholder="INT. BAR – NIGHT&#10;&#10;Write your script here. Saved automatically when you click outside the field.">' + esc(f.script) + '</textarea>' +
        '<div class="row between mt" style="flex-wrap:wrap;gap:8px"><span class="row" style="gap:8px">' +
        '<button class="teal small" id="sb-add" title="Select text in the script first, then click — the frame anchors to that passage">🎞 + Frame from selection</button>' +
        '<span class="muted" style="font-size:12px" id="f-script-stats"></span></span>' +
        '<span class="muted" style="font-size:12px">autosaves on blur · last edit ' + esc((f.updatedAt || "").slice(0, 16).replace("T", " ")) + '</span></div>' +
      '</div>' +

      storyboardHTML(f) +
      filmwissenHTML(f) +

      '<h2 class="section-title">🖼 Shotdeck / Moodboard</h2>' +
      '<div class="card soft mb">' +
        '<p class="muted mb" style="font-size:12.5px">Paste image links (Shotdeck, Dropbox shared links, any https image URL). Big image files themselves belong in the Dropbox — this board keeps the references so exports stay small.</p>' +
        '<div class="row mb"><input id="f-img-url" placeholder="https:// image link..." style="flex:2;min-width:200px">' +
        '<input id="f-img-caption" placeholder="Caption (optional)" style="flex:1;min-width:120px">' +
        '<button class="primary" id="f-img-add">+ Add</button>' +
        '<button class="teal" id="f-img-gen" title="Copies a ready-made generation request — paste it to Claude and a matching Higgsfield still gets built into the app">✨ Generate still</button></div>' +
        (f.images.length === 0 ? '<div class="empty-note">No references yet.</div>' :
          '<div class="mood-grid">' + f.images.map(function (img) {
            var u = safeUrl(img.url);
            return '<figure class="mood-item">' +
              (u && /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(u)
                ? '<img src="' + esc(u) + '" loading="lazy" alt="' + esc(img.caption || "") + '">'
                : '<div class="mood-link">🔗<br><a href="' + esc(u || "#") + '" target="_blank" rel="noopener">' + esc((img.url || "").slice(0, 60)) + '</a></div>') +
              '<figcaption class="row between"><span>' + esc(img.caption || "") + '</span>' +
              '<button class="small ghost danger" data-del-img="' + esc(img.id) + '">✕</button></figcaption>' +
            '</figure>';
          }).join("") + '</div>') +
      '</div>' +

      '<div class="grid cols-2">' +
        '<div class="card soft"><h2 class="section-title" style="margin-top:0">📝 Notes</h2>' +
        '<textarea id="f-notes" style="min-height:140px" placeholder="Cast ideas, locations, budget, references...">' + esc(f.notes) + '</textarea></div>' +
        '<div class="card soft"><h2 class="section-title" style="margin-top:0">🎓 Learnings</h2>' +
        '<textarea id="f-learnings" style="min-height:140px" placeholder="What did this film teach you?">' + esc(f.learnings) + '</textarea></div>' +
      '</div>' +

      locationSuggestHTML(f) +

      '<div class="card soft mt"><span class="stat-label">Festival plan</span>' +
      '<p class="muted mt" style="font-size:13px">Plan submissions for this film in the <a href="#/festivals">Festival Roadmap</a> — set "Film to submit" to <strong>' + esc(f.title) + '</strong>.</p></div>';
  }

  function exportDossier(f) {
    var md = [
      "# " + f.title,
      "",
      "**Status:** " + statusInfo(f.status).label + (f.genre ? " · **Genre:** " + f.genre : "") + (f.themes ? " · **Themes:** " + f.themes : ""),
      "",
      "## Logline", f.logline || "—", "",
      "## Script", "", f.script || "—", "",
      "## Storyboard",
      (f.storyboard || []).length ? sbSorted(f).map(function (fr, i) {
        return (i + 1) + ". “" + fr.text + "”" + (fr.caption ? " — " + fr.caption : "") + (fr.url ? " · " + fr.url : "");
      }).join("\n") : "—", "",
      "## Shotdeck / Moodboard",
      f.images.length ? f.images.map(function (i) { return "- " + i.url + (i.caption ? " — " + i.caption : ""); }).join("\n") : "—", "",
      "## Notes", f.notes || "—", "",
      "## Learnings", f.learnings || "—", "",
      "_Exported " + todayISO() + " from the WAY TO OSCAR Command Center_"
    ].join("\n");
    downloadBlob(md, f.title.toLowerCase().replace(/[^a-z0-9äöü]+/gi, "-").replace(/^-|-$/g, "") + "-dossier.md", "text/markdown");
    toast("Dossier exported");
  }

  function bindDetail(f) {
    $("#film-back").onclick = function () { FilmsView._openId = null; App.render(); };
    $("#film-delete").onclick = function () {
      openModal('<h3>Delete "' + esc(f.title) + '"?</h3><p style="font-size:14px">Script, moodboard references and notes will be gone. Export the dossier first if unsure.</p>' +
        '<div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button>' +
        '<button class="primary" id="film-del-yes">Delete</button></div>');
      $("#film-del-yes").onclick = function () {
        var s = Store.get();
        s.films = s.films.filter(function (x) { return x.id !== f.id; });
        Store.save(); closeModal(); FilmsView._openId = null; toast("Film deleted"); App.render();
      };
    };
    $("#film-export").onclick = function () { exportDossier(f); };
    Graph.bindRelated();

    bindField(f, "#f-title", "title");
    bindField(f, "#f-logline", "logline");
    bindField(f, "#f-status", "status");
    bindField(f, "#f-genre", "genre");
    bindField(f, "#f-themes", "themes");
    bindField(f, "#f-script", "script");
    bindField(f, "#f-notes", "notes");
    bindField(f, "#f-learnings", "learnings");

    var stats = $("#f-script-stats");
    var scriptEl = $("#f-script");
    function updStats() {
      var words = (scriptEl.value.trim().match(/\S+/g) || []).length;
      stats.textContent = words + " words · ~" + Math.max(1, Math.round(words / 160)) + " min screen time (rough)";
    }
    scriptEl.oninput = updStats;
    updStats();

    /* storyboard */
    f.storyboard = f.storyboard || [];
    $("#sb-add").onclick = function () {
      var a = scriptEl.selectionStart, b = scriptEl.selectionEnd;
      var sel = scriptEl.value.slice(a, b).trim();
      if (!sel) { toast("Select a passage in the script first — the frame anchors to it", true); return; }
      f.script = scriptEl.value; // capture unsaved edits so the anchor exists
      f.storyboard.push({ id: uid("sb"), text: sel.slice(0, 200), url: "", caption: "" });
      touch(f); toast("Frame anchored to the selection"); App.render();
    };
    $$("[data-sb-del]").forEach(function (btn) {
      btn.onclick = function () {
        f.storyboard = f.storyboard.filter(function (x) { return x.id !== btn.getAttribute("data-sb-del"); });
        touch(f); App.render();
      };
    });
    $$("[data-sb-img]").forEach(function (btn) {
      btn.onclick = function () {
        var fr = f.storyboard.find(function (x) { return x.id === btn.getAttribute("data-sb-img"); });
        if (!fr) return;
        openModal('<h3>Frame image</h3>' +
          '<p class="muted mb" style="font-size:12px">“' + esc(fr.text.slice(0, 120)) + '”</p>' +
          '<label class="field"><span>Image link (https — Dropbox, Shotdeck...)</span><input id="sbi-url" value="' + esc(fr.url || "") + '"></label>' +
          '<label class="field"><span>Caption / shot note (optional)</span><input id="sbi-cap" value="' + esc(fr.caption || "") + '" placeholder="z.B. Makro, leicht von oben, 50mm"></label>' +
          '<div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button>' +
          '<button class="primary" id="sbi-save">Save</button></div>');
        $("#sbi-save").onclick = function () {
          var u = $("#sbi-url").value.trim();
          if (u && !safeUrl(u)) { toast("Only https:// links", true); return; }
          fr.url = u; fr.caption = $("#sbi-cap").value.trim();
          touch(f); closeModal(); App.render();
        };
      };
    });
    $$("[data-sb-gen]").forEach(function (btn) {
      btn.onclick = function () {
        var fr = f.storyboard.find(function (x) { return x.id === btn.getAttribute("data-sb-gen"); });
        if (!fr) return;
        var req = 'Generiere mit Higgsfield ein Storyboard-Frame für "' + f.title + '" — Script-Stelle: "' + fr.text + '"' +
          (fr.caption ? ' — Shot-Note: ' + fr.caption : "") +
          '. Stil wie die App-Stills (anamorphic, moody teal/amber, 35mm grain), und häng es an dieses Storyboard-Frame an.';
        var ta = document.createElement("textarea");
        ta.value = req; document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); toast("Frame request copied — paste it to Claude"); }
        catch (e) { toast("Copy failed — select manually", true); }
        ta.remove();
      };
    });
    var sl = $("#sb-shotlist");
    if (sl) sl.onclick = function () {
      f.script = scriptEl.value;
      downloadBlob(shotListMd(f), f.title.toLowerCase().replace(/[^a-z0-9äöü]+/gi, "-").replace(/^-|-$/g, "") + "-shotlist.md", "text/markdown");
      toast("Shot list exported");
    };
    $$("[data-loc-open]").forEach(function (btn) {
      btn.onclick = function () {
        Graph.touch(f.id, btn.getAttribute("data-loc-open")); // film↔location link strengthens
        LocationsView._pendingOpen = btn.getAttribute("data-loc-open");
        location.hash = "#/locations";
      };
    });

    $("#f-img-add").onclick = function () {
      var url = $("#f-img-url").value.trim();
      if (!url) { toast("Paste an image link first", true); return; }
      if (!safeUrl(url)) { toast("Only https:// links are allowed", true); return; }
      f.images.push({ id: uid("img"), url: url, caption: $("#f-img-caption").value.trim() });
      touch(f); App.render();
    };
    var gen = $("#f-img-gen");
    if (gen) gen.onclick = function () {
      // the app itself is offline/static — the button hands Claude a ready-to-run request
      var req = 'Generiere mit Higgsfield ein cinematic Still für meinen Film "' + f.title + '"' +
        (f.logline ? ' — Logline: ' + f.logline : "") +
        (f.themes ? ' — Themen: ' + f.themes : "") +
        '. Stil wie die anderen Film-Stills der App (anamorphic, moody teal/amber, 35mm grain) und baue es als Cover in die App ein.';
      var ta = document.createElement("textarea");
      ta.value = req; document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); toast("Request copied — paste it to Claude, the still gets built in"); }
      catch (e) { openModal('<h3>Send this to Claude</h3><textarea style="min-height:140px">' + esc(req) + '</textarea><div class="modal-actions"><button class="primary" onclick="closeModal()">Done</button></div>'); }
      ta.remove();
    };
    $$("[data-del-img]").forEach(function (b) {
      b.onclick = function () {
        f.images = f.images.filter(function (x) { return x.id !== b.getAttribute("data-del-img"); });
        touch(f); App.render();
      };
    });
  }

  /* ---------- list page ---------- */

  var SORTS = [
    { key: "updated", label: "Last edited" },
    { key: "created", label: "Newest idea first" },
    { key: "oldest", label: "Oldest idea first" },
    { key: "title", label: "Title A–Z" }
  ];

  function tsOf(v) {
    var t = Date.parse(v || "");
    return isNaN(t) ? 0 : t;
  }

  function sortFilms(films, sort) {
    var arr = films.slice();
    if (sort === "created") arr.sort(function (a, b) { return tsOf(b.createdAt) - tsOf(a.createdAt); });
    else if (sort === "oldest") arr.sort(function (a, b) { return tsOf(a.createdAt) - tsOf(b.createdAt); });
    else if (sort === "title") arr.sort(function (a, b) { return a.title.localeCompare(b.title, "de"); });
    else arr.sort(function (a, b) { return tsOf(b.updatedAt) - tsOf(a.updatedAt); }); // last edited
    return arr;
  }

  function listHTML(films, sort) {
    return '<h1 class="view-title">Films</h1>' +
      '<p class="view-sub">Every film as a full dossier: logline, script, shotdeck, notes, learnings. Ideas become films via "Develop as film" in the vault.</p>' +
      viewBanner('still-wick') +
      '<div class="filter-bar"><button class="primary" id="film-new">+ New film</button>' +
      '<select id="film-sort">' +
      SORTS.map(function (x) { return '<option value="' + x.key + '"' + (sort === x.key ? " selected" : "") + '>' + x.label + '</option>'; }).join("") +
      '</select>' +
      '<span class="muted" style="font-size:12px">' + films.length + ' film' + (films.length === 1 ? "" : "s") + '</span></div>' +
      (films.length === 0
        ? '<div class="card soft"><div class="empty-note">No films yet. Start one here — or open the Ideas vault and hit "Develop as film" on your strongest idea (e.g. Der Junge im Nebel, Der Schrank, Bushaltestelle...).</div></div>'
        : '<div class="grid cols-3">' + films.map(function (f) {
            var st = statusInfo(f.status);
            var cover = (f.images.find(function (i) { return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(safeUrl(i.url)); }) || {}).url;
            var genCover = assetUrl(f.id); // Higgsfield still baked into the seed, keyed by film id
            var posterHue = { gray: "#8B7355", blue: "#2E86AB", gold: "#E8871E", red: "#E63946", teal: "#2FA39A" }[st.cls] || "#8B7355";
            return '<div class="card soft ' + st.tint + ' clickable film-card" data-film="' + esc(f.id) + '">' +
              (cover
                ? '<div class="film-cover" style="background-image:url(\'' + esc(safeUrl(cover)) + '\')"></div>'
                : genCover
                ? '<div class="film-cover" style="background-image:url(' + genCover + ')"></div>'
                : '<div class="film-cover poster" style="--ph:' + posterHue + '">' +
                  '<span class="poster-initial">' + esc((f.title || "?").replace(/^SPIELFILM\s*—\s*/i, "").charAt(0).toUpperCase()) + '</span>' +
                  '<span class="poster-strip"></span></div>') +
              '<div class="row between mt"><strong style="font-size:15px">' + esc(f.title) + '</strong>' +
              '<span class="badge ' + st.cls + '">' + st.label + '</span></div>' +
              (f.logline ? '<div class="muted mt" style="font-size:12.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(f.logline) + '</div>' : "") +
              '<div class="muted mt" style="font-size:11px">' +
              (f.script ? "✍️ " + (f.script.match(/\S+/g) || []).length + " words" : "no script yet") +
              ' · 🖼 ' + f.images.length +
              (tsOf(f.createdAt) > 0 ? ' · 💡 ' + fmtDateShort(f.createdAt) : "") +
              (tsOf(f.updatedAt) > 0 ? ' · ✏️ ' + fmtDateShort(f.updatedAt) : "") + '</div>' +
            '</div>';
          }).join("") + '</div>');
  }

  function render(root) {
    var s = Store.get();
    var open = FilmsView._openId ? s.films.find(function (x) { return x.id === FilmsView._openId; }) : null;
    if (open) {
      root.innerHTML = detailHTML(open);
      bindDetail(open);
      return;
    }
    FilmsView._openId = null;
    var sort = render._sort || "updated";
    root.innerHTML = listHTML(sortFilms(s.films, sort), sort);
    var srt = $("#film-sort");
    if (srt) srt.onchange = function () { render._sort = this.value; App.render(); };
    var nb = $("#film-new");
    if (nb) nb.onclick = function () {
      var f = newFilm(null);
      FilmsView._openId = f.id;
      App.render();
    };
    $$("[data-film]", root).forEach(function (n) {
      n.onclick = function () { FilmsView._openId = n.getAttribute("data-film"); App.render(); };
    });
  }

  return { render: render, developFromIdea: developFromIdea };
})();
