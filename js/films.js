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
      '</div>' +

      '<h2 class="section-title">✍️ Script</h2>' +
      '<div class="card soft mb">' +
        '<textarea id="f-script" style="min-height:340px;font-family:var(--font-mono);font-size:13px;line-height:1.7" placeholder="INT. BAR – NIGHT&#10;&#10;Write your script here. Saved automatically when you click outside the field.">' + esc(f.script) + '</textarea>' +
        '<div class="row between mt"><span class="muted" style="font-size:12px" id="f-script-stats"></span>' +
        '<span class="muted" style="font-size:12px">autosaves on blur · last edit ' + esc((f.updatedAt || "").slice(0, 16).replace("T", " ")) + '</span></div>' +
      '</div>' +

      '<h2 class="section-title">🖼 Shotdeck / Moodboard</h2>' +
      '<div class="card soft mb">' +
        '<p class="muted mb" style="font-size:12.5px">Paste image links (Shotdeck, Dropbox shared links, any https image URL). Big image files themselves belong in the Dropbox — this board keeps the references so exports stay small.</p>' +
        '<div class="row mb"><input id="f-img-url" placeholder="https:// image link..." style="flex:2;min-width:200px">' +
        '<input id="f-img-caption" placeholder="Caption (optional)" style="flex:1;min-width:120px">' +
        '<button class="primary" id="f-img-add">+ Add</button></div>' +
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

    $("#f-img-add").onclick = function () {
      var url = $("#f-img-url").value.trim();
      if (!url) { toast("Paste an image link first", true); return; }
      if (!safeUrl(url)) { toast("Only https:// links are allowed", true); return; }
      f.images.push({ id: uid("img"), url: url, caption: $("#f-img-caption").value.trim() });
      touch(f); App.render();
    };
    $$("[data-del-img]").forEach(function (b) {
      b.onclick = function () {
        f.images = f.images.filter(function (x) { return x.id !== b.getAttribute("data-del-img"); });
        touch(f); App.render();
      };
    });
  }

  /* ---------- list page ---------- */

  function listHTML(films) {
    return '<h1 class="view-title">Films</h1>' +
      '<p class="view-sub">Every film as a full dossier: logline, script, shotdeck, notes, learnings. Ideas become films via "Develop as film" in the vault.</p>' +
      '<div class="filter-bar"><button class="primary" id="film-new">+ New film</button>' +
      '<span class="muted" style="font-size:12px">' + films.length + ' film' + (films.length === 1 ? "" : "s") + '</span></div>' +
      (films.length === 0
        ? '<div class="card soft"><div class="empty-note">No films yet. Start one here — or open the Ideas vault and hit "Develop as film" on your strongest idea (e.g. Der Junge im Nebel, Der Schrank, Bushaltestelle...).</div></div>'
        : '<div class="grid cols-3">' + films.map(function (f) {
            var st = statusInfo(f.status);
            var cover = (f.images.find(function (i) { return /\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(safeUrl(i.url)); }) || {}).url;
            return '<div class="card soft ' + st.tint + ' clickable film-card" data-film="' + esc(f.id) + '">' +
              (cover ? '<div class="film-cover" style="background-image:url(\'' + esc(safeUrl(cover)) + '\')"></div>' : '<div class="film-cover empty">🎬</div>') +
              '<div class="row between mt"><strong style="font-size:15px">' + esc(f.title) + '</strong>' +
              '<span class="badge ' + st.cls + '">' + st.label + '</span></div>' +
              (f.logline ? '<div class="muted mt" style="font-size:12.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(f.logline) + '</div>' : "") +
              '<div class="muted mt" style="font-size:11px">' +
              (f.script ? "✍️ " + (f.script.match(/\S+/g) || []).length + " words" : "no script yet") +
              ' · 🖼 ' + f.images.length + '</div>' +
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
    root.innerHTML = listHTML(s.films);
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
