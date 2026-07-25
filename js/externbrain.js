/* ============ externbrain.js — Externes Brain: insights from outside sources ============ */
"use strict";

var ExternBrainView = (function () {

  var SOURCES = ["Instagram Reel", "YouTube", "Podcast", "Artikel", "Buch", "Sonstiges"];
  var SRC_STYLE = {
    "Instagram Reel": { tint: "tint-magenta", icon: "📱" },
    "YouTube":        { tint: "tint-red",     icon: "▶️" },
    "Podcast":        { tint: "tint-teal",    icon: "🎙" },
    "Artikel":        { tint: "tint-blue",    icon: "📰" },
    "Buch":           { tint: "tint-gold",    icon: "📖" },
    "Sonstiges":      { tint: "tint-cream",   icon: "🌐" }
  };

  function editModal(id) {
    var s = Store.get();
    var e = id ? s.externalInsights.find(function (x) { return x.id === id; }) : null;
    var v = e || { creator: "", claim: "", source: "Instagram Reel", url: "", date: todayISO(), insight: "", keyPoints: "" };
    var html =
      '<h3>' + (e ? "Edit external insight" : "New external insight") + '</h3>' +
      '<div class="row">' +
      '<label class="field" style="flex:1"><span>Creator / Quelle</span><input id="x-creator" value="' + esc(v.creator) + '" placeholder="@handle oder Name"></label>' +
      '<label class="field" style="flex:1"><span>Typ</span><select id="x-source">' +
      SOURCES.map(function (t) { return '<option' + (v.source === t ? " selected" : "") + '>' + t + '</option>'; }).join("") + '</select></label></div>' +
      '<label class="field"><span>Kernaussage (3–6 Worte)</span><input id="x-claim" value="' + esc(v.claim) + '"></label>' +
      '<div class="row">' +
      '<label class="field" style="flex:2"><span>Original-Link (Pflicht!)</span><input id="x-url" value="' + esc(v.url) + '" placeholder="https://..."></label>' +
      '<label class="field" style="flex:1"><span>Datum</span><input type="date" id="x-date" value="' + esc(v.date) + '"></label></div>' +
      '<label class="field"><span>Erkenntnis (was lernst du daraus?)</span><textarea id="x-insight" style="min-height:100px">' + esc(v.insight) + '</textarea></label>' +
      '<label class="field"><span>Transkript / Kernaussagen (optional)</span><textarea id="x-key" style="min-height:80px">' + esc(v.keyPoints) + '</textarea></label>' +
      (e ? Graph.relatedHTML(e.id) : "") +
      '<div class="modal-actions">' +
      (e ? '<button class="ghost danger" id="x-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="x-save">Save</button></div>';
    openModal(html);
    Graph.bindRelated();
    $("#x-save").onclick = function () {
      var url = $("#x-url").value.trim();
      if (!safeUrl(url)) { toast("Original-Link ist Pflicht (https)", true); return; }
      var dupe = s.externalInsights.find(function (x) { return x.url === url && (!e || x.id !== e.id); });
      if (dupe) { toast("Diesen Link gibt es schon: " + dupe.claim, true); return; }
      var now = new Date().toISOString();
      var data = {
        creator: $("#x-creator").value.trim() || "unbekannt",
        claim: $("#x-claim").value.trim() || "(ohne Kernaussage)",
        source: $("#x-source").value, url: url,
        date: $("#x-date").value || todayISO(),
        insight: $("#x-insight").value.trim(),
        keyPoints: $("#x-key").value.trim(),
        updatedAt: now
      };
      if (e) Object.assign(e, data);
      else { data.id = uid("ext"); data.createdAt = now; s.externalInsights.unshift(data); }
      Store.save(); closeModal(); toast("Externe Erkenntnis gespeichert"); App.render();
    };
    var del = $("#x-delete");
    if (del) del.onclick = function () {
      s.externalInsights = s.externalInsights.filter(function (x) { return x.id !== id; });
      Store.save(); closeModal(); toast("Deleted"); App.render();
    };
  }

  function render(root) {
    var s = Store.get();
    if (ExternBrainView._pendingOpen) {
      var pid = ExternBrainView._pendingOpen;
      ExternBrainView._pendingOpen = null;
      setTimeout(function () { editModal(pid); }, 0);
    }
    var q = (render._q || "").toLowerCase();
    var visible = s.externalInsights.filter(function (e) {
      return !q || (e.creator + " " + e.claim + " " + e.insight + " " + e.keyPoints).toLowerCase().indexOf(q) !== -1;
    }).slice().sort(function (a, b) { return (b.date || "") < (a.date || "") ? -1 : 1; });

    root.innerHTML =
      '<h1 class="view-title">Externes Brain</h1>' +
      '<p class="view-sub">' + s.externalInsights.length + ' Erkenntnisse von aussen — Transkripte, Videos, Podcasts, Artikel. Nichts davon sind deine Ideen (die leben im <a href="#/ideas">Second Brain</a>). Original-Link ist Pflicht.</p>' +
      '<div class="filter-bar">' +
      '<input id="ext-q" placeholder="Suchen..." value="' + esc(render._q || "") + '" style="flex:1;min-width:180px">' +
      '<button class="primary" id="ext-new">+ Neue Erkenntnis</button></div>' +
      '<div class="grid cols-2">' +
      visible.map(function (e) {
        var st = SRC_STYLE[e.source] || SRC_STYLE["Sonstiges"];
        return '<div class="card ' + st.tint + ' idea-card clickable" data-ext="' + esc(e.id) + '">' +
          '<span class="idea-emoji">' + st.icon + '</span>' +
          '<div class="row between mb"><span class="badge">' + esc(e.source) + '</span>' +
          '<span class="muted" style="font-size:11px">' + fmtDateAuto(e.date) + '</span></div>' +
          '<div style="font-weight:800;font-size:16.5px;line-height:1.3;position:relative">' + esc(e.claim) + '</div>' +
          '<div class="mt" style="font-size:12.5px;font-weight:700;opacity:.85">' + esc(e.creator) + '</div>' +
          (e.insight ? '<div class="muted mt" style="font-size:13px;line-height:1.6;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden;position:relative">' + esc(e.insight) + '</div>' : "") +
          '<div class="mt"><a href="' + esc(safeUrl(e.url) || "#") + '" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11.5px">🔗 Original ansehen</a></div>' +
        '</div>';
      }).join("") + '</div>' +
      (visible.length === 0 ? '<div class="empty-note">Noch nichts hier — schick Claude einen Reel-/YouTube-Link zum Analysieren, der Eintrag kommt automatisch.</div>' : "");

    $("#ext-q").oninput = function () {
      render._q = this.value;
      var caret = this.selectionStart;
      App.render();
      var n = $("#ext-q");
      if (n) { n.focus(); n.setSelectionRange(caret, caret); }
    };
    $("#ext-new").onclick = function () { editModal(null); };
    $$("[data-ext]", root).forEach(function (n) {
      n.onclick = function () { editModal(n.getAttribute("data-ext")); };
    });
  }

  return { render: render };
})();
