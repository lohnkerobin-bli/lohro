/* ============ projects.js — short films, features, reels, youtube ============ */
"use strict";

var ProjectsView = (function () {

  var TYPES = [
    { key: "shortfilm", label: "🎬 Short Film" },
    { key: "reel", label: "📱 Reel" },
    { key: "youtube", label: "▶️ YouTube" },
    { key: "client", label: "🤝 Client Work" },
    { key: "feature", label: "🎥 Feature Film" },
    { key: "other", label: "✨ Other" }
  ];
  var STATUSES = ["idea", "writing", "pre-production", "shooting", "editing", "published", "archived"];

  function typeLabel(key) {
    var t = TYPES.find(function (x) { return x.key === key; });
    return t ? t.label : key;
  }

  function editModal(id) {
    var s = Store.get();
    var p = id ? s.projects.find(function (x) { return x.id === id; }) : null;
    var v = p || { title: "", type: "shortfilm", status: "idea", owner: "Robin", notes: "", targetDate: "", link: "" };
    var html =
      '<h3>' + (p ? "Edit project" : "New project") + '</h3>' +
      '<label class="field"><span>Title</span><input id="p-title" value="' + esc(v.title) + '"></label>' +
      '<div class="row">' +
      '<label class="field" style="flex:1"><span>Type</span><select id="p-type">' +
      TYPES.map(function (t) { return '<option value="' + t.key + '"' + (v.type === t.key ? " selected" : "") + '>' + t.label + '</option>'; }).join("") +
      '</select></label>' +
      '<label class="field" style="flex:1"><span>Status</span><select id="p-status">' +
      STATUSES.map(function (st) { return '<option' + (v.status === st ? " selected" : "") + '>' + st + '</option>'; }).join("") +
      '</select></label></div>' +
      '<div class="row">' +
      '<label class="field" style="flex:1"><span>Owner</span><select id="p-owner">' +
      ["Robin", "Simon", "Jasmin", "Team"].map(function (o) { return '<option' + (v.owner === o ? " selected" : "") + '>' + o + '</option>'; }).join("") +
      '</select></label>' +
      '<label class="field" style="flex:1"><span>Target date</span><input type="date" id="p-date" value="' + esc(v.targetDate || "") + '"></label></div>' +
      '<label class="field"><span>Link</span><input id="p-link" value="' + esc(v.link || "") + '" placeholder="https://..."></label>' +
      '<label class="field"><span>Notes</span><textarea id="p-notes">' + esc(v.notes || "") + '</textarea></label>' +
      '<div class="modal-actions">' +
      (p ? '<button class="ghost danger" id="p-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="p-save">Save</button></div>';
    openModal(html);
    $("#p-save").onclick = function () {
      var title = $("#p-title").value.trim();
      if (!title) { toast("Title required", true); return; }
      var now = new Date().toISOString();
      if (p) {
        p.title = title; p.type = $("#p-type").value; p.status = $("#p-status").value;
        p.owner = $("#p-owner").value; p.targetDate = $("#p-date").value || null;
        p.link = $("#p-link").value.trim(); p.notes = $("#p-notes").value.trim(); p.updatedAt = now;
      } else {
        s.projects.unshift({
          id: uid("prj"), title: title, type: $("#p-type").value, status: $("#p-status").value,
          owner: $("#p-owner").value, targetDate: $("#p-date").value || null,
          link: $("#p-link").value.trim(), notes: $("#p-notes").value.trim(),
          createdAt: now, updatedAt: now
        });
      }
      Store.save(); closeModal(); toast("Project saved"); App.render();
    };
    var del = $("#p-delete");
    if (del) del.onclick = function () {
      s.projects = s.projects.filter(function (x) { return x.id !== id; });
      Store.save(); closeModal(); toast("Project deleted"); App.render();
    };
  }

  function render(root) {
    var s = Store.get();
    var typeFilter = render._type || "all";
    var visible = s.projects.filter(function (p) {
      return typeFilter === "all" || p.type === typeFilter;
    });
    var counts = {};
    s.projects.forEach(function (p) { counts[p.type] = (counts[p.type] || 0) + 1; });

    root.innerHTML =
      '<h1 class="view-title">Projects</h1>' +
      '<p class="view-sub">Everything in production across Kollektiv Oskar — short films, features, reels and YouTube episodes. Imported from your Notion pipelines.</p>' +

      '<div class="grid cols-4 mb">' +
      TYPES.slice(0, 4).map(function (t) {
        return '<div class="card"><span class="stat-label">' + t.label + '</span><div class="stat-value">' + (counts[t.key] || 0) + '</div></div>';
      }).join("") +
      '</div>' +

      '<div class="filter-bar">' +
        '<select id="prj-type"><option value="all">All types (' + s.projects.length + ')</option>' +
        TYPES.map(function (t) { return '<option value="' + t.key + '"' + (typeFilter === t.key ? " selected" : "") + '>' + t.label + '</option>'; }).join("") +
        '</select>' +
        '<button class="primary" id="prj-new">+ New project</button>' +
      '</div>' +

      '<div class="table-wrap"><table><thead><tr><th>Project</th><th>Type</th><th>Status</th><th>Owner</th><th>Target</th><th>Notes</th></tr></thead><tbody>' +
      visible.slice(0, 200).map(function (p) {
        var stCls = p.status === "published" ? "teal" : (p.status === "editing" || p.status === "shooting") ? "blue" : p.status === "archived" ? "gray" : "red";
        return '<tr class="clickable" data-prj="' + esc(p.id) + '">' +
          '<td><strong>' + esc(p.title) + '</strong>' +
          (safeUrl(p.link) ? ' <a href="' + esc(safeUrl(p.link)) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">↗</a>' : "") + '</td>' +
          '<td>' + typeLabel(p.type) + '</td>' +
          '<td><span class="badge ' + stCls + '">' + esc(p.status) + '</span></td>' +
          '<td>' + esc(p.owner || "—") + '</td>' +
          '<td class="mono" style="font-size:12px">' + (p.targetDate ? fmtDate(p.targetDate) : "—") + '</td>' +
          '<td style="max-width:260px"><span class="muted" style="font-size:12.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(p.notes || "") + '</span></td>' +
        '</tr>';
      }).join("") +
      '</tbody></table></div>' +
      (visible.length === 0 ? '<div class="empty-note">No projects of this type yet.</div>' : "");

    $("#prj-type").onchange = function () { render._type = this.value; App.render(); };
    $("#prj-new").onclick = function () { editModal(null); };
    $$("[data-prj]", root).forEach(function (n) {
      n.onclick = function () { editModal(n.getAttribute("data-prj")); };
    });
  }

  return { render: render };
})();
