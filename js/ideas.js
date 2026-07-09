/* ============ ideas.js — idea vault (Notion import + new) ============ */
"use strict";

var IdeasView = (function () {

  var STATUSES = ["Neu", "In Arbeit", "Umgesetzt", "Archiviert"];

  // category → colour identity (Shazam tints) + watermark emoji + generated still (data/assets)
  var CAT_STYLE = {
    "Film":        { tint: "tint-magenta", icon: "🎬", asset: "cat-film" },
    "YouTube":     { tint: "tint-red",     icon: "▶️", asset: "cat-youtube" },
    "Business":    { tint: "tint-blue",    icon: "💼", asset: "cat-business" },
    "Personal":    { tint: "tint-teal",    icon: "🌱", asset: "cat-personal" },
    "Glaube":      { tint: "tint-gold",    icon: "✝️", asset: "cat-glaube" },
    "Fitness":     { tint: "tint-teal",    icon: "💪", asset: "cat-fitness" },
    "Team":        { tint: "tint-blue",    icon: "👥", asset: "cat-team" },
    "Praktikantin":{ tint: "tint-magenta", icon: "🎓", asset: "cat-praktikantin" },
    "Sonstiges":   { tint: "tint-cream",   icon: "✨", asset: "cat-sonstiges" }
  };
  function catStyle(idea) {
    var cats = idea.categories || [];
    for (var i = 0; i < cats.length; i++) {
      if (CAT_STYLE[cats[i]]) return CAT_STYLE[cats[i]];
    }
    return CAT_STYLE["Sonstiges"];
  }

  function categories() {
    var set = {};
    Store.get().ideas.forEach(function (i) {
      (i.categories || []).forEach(function (c) { set[c] = true; });
    });
    return Object.keys(set).sort();
  }

  function editModal(id) {
    var s = Store.get();
    var idea = id ? s.ideas.find(function (x) { return x.id === id; }) : null;
    var v = idea || { title: "", categories: [], status: "Neu", energy: null, notes: "" };
    var html =
      '<h3>' + (idea ? "Edit idea" : "New idea") + '</h3>' +
      '<label class="field"><span>Idea</span><input id="i-title" value="' + esc(v.title) + '" placeholder="The idea in one line"></label>' +
      '<label class="field"><span>Categories (comma-separated)</span><input id="i-cats" value="' + esc((v.categories || []).join(", ")) + '" placeholder="Film, YouTube, ..."></label>' +
      '<div class="row">' +
      '<label class="field" style="flex:1"><span>Status</span><select id="i-status">' +
      STATUSES.map(function (st) { return '<option' + (v.status === st ? " selected" : "") + '>' + st + '</option>'; }).join("") +
      '</select></label>' +
      '<label class="field" style="flex:1"><span>Energy</span><select id="i-energy">' +
      ['', '🔥 Hoch', '⚡ Mittel', '💤 Niedrig'].map(function (e) {
        return '<option value="' + e + '"' + ((v.energy || "") === e ? " selected" : "") + '>' + (e || "—") + '</option>';
      }).join("") + '</select></label></div>' +
      '<label class="field"><span>Notes</span><textarea id="i-notes" style="min-height:110px">' + esc(v.notes) + '</textarea></label>' +
      (idea ? Graph.relatedHTML(idea.id) : "") +
      '<div class="modal-actions">' +
      (idea ? '<button class="ghost danger" id="i-delete">Delete</button>' : "") +
      (idea ? '<button class="teal" id="i-to-challenge" title="Copy this idea onto the next free challenge day">📅 → Challenge day</button>' : "") +
      (idea ? '<button class="blue" id="i-to-film" title="Turn this idea into a full film dossier (logline, script, shotdeck)">🎬 Develop as film</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="i-save">Save</button></div>';
    openModal(html);
    Graph.bindRelated();
    var toFilm = $("#i-to-film");
    if (toFilm) toFilm.onclick = function () {
      closeModal();
      FilmsView.developFromIdea(idea);
    };
    var toChallenge = $("#i-to-challenge");
    if (toChallenge) toChallenge.onclick = function () {
      var st = Store.get();
      var d = st.settings.challengeStart > todayISO() ? st.settings.challengeStart : todayISO();
      var guard = 0;
      while (st.challengeDays[d] && guard++ < 400) d = addDays(d, 1);
      st.challengeDays[d] = {
        date: d, title: idea.title.slice(0, 60), idea: idea.title + (idea.notes ? "\n\n" + idea.notes : ""),
        status: "planned", link: "", learnings: "",
        updatedAt: new Date().toISOString()
      };
      if (idea.status === "Neu") { idea.status = "In Arbeit"; idea.updatedAt = new Date().toISOString(); }
      Store.save(); closeModal();
      toast("Planned for " + fmtDate(d) + " (Day " + (daysBetween(st.settings.challengeStart, d) + 1) + ")");
      App.render();
    };
    $("#i-save").onclick = function () {
      var title = $("#i-title").value.trim();
      if (!title) { toast("Idea text required", true); return; }
      var cats = $("#i-cats").value.split(",").map(function (c) { return c.trim(); }).filter(Boolean);
      var now = new Date().toISOString();
      if (idea) {
        idea.title = title; idea.categories = cats;
        idea.status = $("#i-status").value; idea.energy = $("#i-energy").value || null;
        idea.notes = $("#i-notes").value.trim(); idea.updatedAt = now;
      } else {
        s.ideas.unshift({
          id: uid("idea"), title: title, categories: cats,
          status: $("#i-status").value, energy: $("#i-energy").value || null,
          notes: $("#i-notes").value.trim(), source: "app",
          createdAt: now, updatedAt: now
        });
      }
      Store.save(); closeModal(); toast("Idea saved"); App.render();
    };
    var del = $("#i-delete");
    if (del) del.onclick = function () {
      s.ideas = s.ideas.filter(function (x) { return x.id !== id; });
      Store.save(); closeModal(); toast("Idea deleted"); App.render();
    };
  }

  function render(root) {
    var s = Store.get();
    if (IdeasView._pendingOpen) {
      var pid = IdeasView._pendingOpen;
      IdeasView._pendingOpen = null;
      setTimeout(function () { editModal(pid); }, 0);
    }
    var q = (render._q || "").toLowerCase();
    var cat = render._cat || "all";
    var status = render._status || "all";

    var visible = s.ideas.filter(function (i) {
      if (q && (i.title + " " + i.notes).toLowerCase().indexOf(q) === -1) return false;
      if (cat !== "all" && (i.categories || []).indexOf(cat) === -1) return false;
      if (status !== "all" && i.status !== status) return false;
      return true;
    });

    root.innerHTML =
      '<h1 class="view-title">Ideas Vault</h1>' +
      '<p class="view-sub">' + s.ideas.length + ' ideas — imported from your Notion Second Brain + Ideen-Schrank, extendable here. Original German kept as written.</p>' +

      '<div class="filter-bar">' +
        '<input id="idea-q" placeholder="Search ideas..." value="' + esc(render._q || "") + '" style="flex:1;min-width:180px">' +
        '<select id="idea-cat"><option value="all">All categories</option>' +
        categories().map(function (c) { return '<option' + (cat === c ? " selected" : "") + '>' + esc(c) + '</option>'; }).join("") + '</select>' +
        '<select id="idea-status"><option value="all">All statuses</option>' +
        STATUSES.map(function (st) { return '<option' + (status === st ? " selected" : "") + '>' + st + '</option>'; }).join("") + '</select>' +
        '<button class="primary" id="idea-new">+ New idea</button>' +
      '</div>' +

      '<div class="grid cols-3">' +
      visible.slice(0, 120).map(function (i) {
        var st = catStyle(i);
        var bg = assetUrl(st.asset);
        // generated category still, heavily darkened so the text stays readable
        var bgStyle = bg ? ' style="background-image:linear-gradient(180deg,rgba(12,9,8,.68) 0%,rgba(12,9,8,.82) 60%,rgba(12,9,8,.94) 100%),url(' + bg + ')"' : "";
        return '<div class="card ' + st.tint + ' idea-card' + (bg ? " has-img" : "") + ' clickable" data-idea="' + esc(i.id) + '"' + bgStyle + '>' +
          '<span class="idea-emoji">' + st.icon + '</span>' +
          '<div class="row between mb" style="gap:6px">' +
          '<span>' + (i.categories || []).slice(0, 3).map(function (c) { return '<span class="badge">' + esc(c) + '</span> '; }).join("") + '</span>' +
          '<span class="badge ' + (i.status === "Umgesetzt" ? "teal" : i.status === "In Arbeit" ? "gold" : i.status === "Archiviert" ? "gray" : "red") + '">' + esc(i.status) + '</span></div>' +
          '<div style="font-weight:700;font-size:16px;line-height:1.35;position:relative">' + esc(i.title) + '</div>' +
          (i.notes ? '<div class="muted mt" style="font-size:13px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;position:relative">' + esc(i.notes) + '</div>' : "") +
          '<div class="row between mt"><span style="font-size:12px;font-weight:700">' + (i.energy ? esc(i.energy) : "") + '</span>' +
          '<span class="muted" style="font-size:11px">' + esc(i.source || "") + '</span></div>' +
        '</div>';
      }).join("") +
      '</div>' +
      (visible.length === 0 ? '<div class="empty-note">No ideas match the filter.</div>' : "") +
      (visible.length > 120 ? '<div class="empty-note">Showing first 120 of ' + visible.length + ' — refine the search.</div>' : "");

    $("#idea-q").oninput = function () {
      render._q = this.value;
      var caret = this.selectionStart;
      App.render();
      var n = $("#idea-q");
      if (n) { n.focus(); n.setSelectionRange(caret, caret); }
    };
    $("#idea-cat").onchange = function () { render._cat = this.value; App.render(); };
    $("#idea-status").onchange = function () { render._status = this.value; App.render(); };
    $("#idea-new").onclick = function () { editModal(null); };
    $$("[data-idea]", root).forEach(function (n) {
      n.onclick = function () { editModal(n.getAttribute("data-idea")); };
    });
  }

  return { render: render };
})();
