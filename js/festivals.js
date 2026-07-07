/* ============ festivals.js — festival database, roadmap, deadline calendar ============ */
"use strict";

var FestivalsView = (function () {

  var PLAN_STATUSES = ["not planned", "researching", "planned", "film ready", "submitted", "accepted", "rejected", "won"];

  function planFor(fid) {
    return Store.get().festivalPlans[fid] || { status: "not planned", filmTitle: "", notes: "" };
  }

  function allDeadlines() {
    var rows = [];
    Store.festivals().forEach(function (f) {
      (f.deadlines || []).forEach(function (d) {
        if (d.date) rows.push({ festival: f, deadline: d });
      });
    });
    rows.sort(function (a, b) { return a.deadline.date < b.deadline.date ? -1 : 1; });
    return rows;
  }

  function planModal(fid) {
    var f = Store.festivals().find(function (x) { return x.id === fid; });
    if (!f) return;
    var p = planFor(fid);
    var html =
      '<h3>' + esc(f.name) + '</h3>' +
      '<p class="muted mb" style="font-size:13px">' + esc(f.strategyNotes || "") + '</p>' +
      '<label class="field"><span>Submission status</span><select id="p-status">' +
      PLAN_STATUSES.map(function (st) {
        return '<option value="' + st + '"' + (p.status === st ? " selected" : "") + '>' + st + '</option>';
      }).join("") + '</select></label>' +
      '<label class="field"><span>Film to submit</span><input id="p-film" value="' + esc(p.filmTitle) + '" placeholder="Which short goes here?"></label>' +
      '<label class="field"><span>Notes</span><textarea id="p-notes">' + esc(p.notes) + '</textarea></label>' +
      '<div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="p-save">Save</button></div>';
    openModal(html);
    $("#p-save").onclick = function () {
      Store.get().festivalPlans[fid] = {
        status: $("#p-status").value,
        filmTitle: $("#p-film").value.trim(),
        notes: $("#p-notes").value.trim(),
        updatedAt: new Date().toISOString()
      };
      Store.save(); closeModal(); toast("Plan saved"); App.render();
    };
  }

  function statusBadge(status) {
    var cls = { "submitted": "blue", "accepted": "teal", "won": "gold", "rejected": "red", "planned": "blue", "film ready": "teal", "researching": "gray" }[status] || "gray";
    return status === "not planned" ? "" : '<span class="badge ' + cls + '">' + esc(status) + '</span>';
  }

  function render(root) {
    var fests = Store.festivals();
    var rules = Store.academyRules();
    var today = todayISO();
    var filter = render._filter || "all";

    var visible = fests.filter(function (f) {
      if (filter === "qualifying") return f.oscarQualifying;
      if (filter === "tier1") return f.tier === 1;
      if (filter === "planned") return planFor(f.id).status !== "not planned";
      return true;
    }).slice().sort(function (a, b) { return (a.tier || 9) - (b.tier || 9) || (a.name < b.name ? -1 : 1); });

    var upcoming = allDeadlines().filter(function (r) { return r.deadline.date >= today; });

    root.innerHTML =
      '<h1 class="view-title">Festival Roadmap</h1>' +
      '<p class="view-sub">Oscar-qualifying festivals for 2026/2027 submissions. Researched July 2026 — dates marked "est." must be re-verified ~3 months before the deadline.</p>' +

      (rules ?
        '<div class="card accent-gold mb">' +
        '<span class="stat-label">🏛 Academy qualification rules (shorts)</span>' +
        '<div class="mt" style="font-size:13.5px">' +
        '<strong>Runtime:</strong> max ' + (rules.runtimeLimitMinutes || 40) + ' min incl. credits · ' +
        '<strong>Paths:</strong> ' + (rules.qualificationPaths || []).map(esc).join(" · ") +
        (rules.eligibilityNotes ? '<div class="muted mt" style="font-size:12.5px">' + esc(rules.eligibilityNotes) + '</div>' : "") +
        '</div></div>' : "") +

      '<h2 class="section-title">Deadline Calendar</h2>' +
      '<div class="card">' +
      (upcoming.length === 0 ? '<div class="empty-note">No upcoming deadlines in the database.</div>' :
        '<div class="timeline mt">' +
        upcoming.slice(0, 18).map(function (r) {
          var days = daysBetween(today, r.deadline.date);
          return '<div class="timeline-item ' + (days <= 21 ? "urgent" : "") + '">' +
            '<div class="tl-date">' + fmtDate(r.deadline.date) + ' · in ' + days + ' days' + (r.deadline.estimated ? ' <span class="badge">est.</span>' : "") + '</div>' +
            '<div class="tl-title clickable" data-fest="' + esc(r.festival.id) + '">' + esc(r.festival.name) + ' — ' + esc(r.deadline.type) + ' deadline</div>' +
            '<div class="tl-meta">' +
            (r.deadline.feeAmount != null ? "Fee " + r.deadline.feeAmount + " " + esc(r.deadline.feeCurrency || "") + " · " : "") +
            (r.festival.oscarQualifying ? "Oscar-qualifying" : "not qualifying") +
            (r.festival.maxRuntimeMin ? " · max " + r.festival.maxRuntimeMin + " min" : "") +
            ' · ' + statusBadge(planFor(r.festival.id).status) +
            '</div></div>';
        }).join("") + "</div>") +
      '</div>' +

      '<h2 class="section-title">Festival Database</h2>' +
      '<div class="filter-bar">' +
        '<select id="fest-filter">' +
        '<option value="all"' + (filter === "all" ? " selected" : "") + '>All festivals (' + fests.length + ')</option>' +
        '<option value="qualifying"' + (filter === "qualifying" ? " selected" : "") + '>Oscar-qualifying only</option>' +
        '<option value="tier1"' + (filter === "tier1" ? " selected" : "") + '>Tier 1 (top prestige)</option>' +
        '<option value="planned"' + (filter === "planned" ? " selected" : "") + '>My submissions</option>' +
        '</select><span class="muted" style="font-size:12px">Click a row to plan your submission</span></div>' +

      '<div class="table-wrap"><table><thead><tr>' +
      '<th>Festival</th><th>Tier</th><th>Oscar</th><th>Next deadline</th><th>Fee</th><th>Max len</th><th>Premiere req.</th><th>My status</th>' +
      '</tr></thead><tbody>' +
      visible.map(function (f) {
        var next = (f.deadlines || []).filter(function (d) { return d.date >= today; })
          .sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
        var p = planFor(f.id);
        return '<tr class="clickable" data-fest="' + esc(f.id) + '">' +
          '<td><strong>' + esc(f.name) + '</strong><br><span class="muted">' + esc(f.city || "") + ', ' + esc(f.country || "") +
          (f.url ? ' · <a href="' + esc(f.url) + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">site ↗</a>' : "") + '</span>' +
          (f.strategyNotes ? '<br><span class="muted" style="font-size:12px">' + esc(f.strategyNotes) + '</span>' : "") + '</td>' +
          '<td><span class="badge ' + (f.tier === 1 ? "gold" : f.tier === 2 ? "blue" : "gray") + '">T' + (f.tier || "?") + '</span></td>' +
          '<td>' + (f.oscarQualifying
            ? '<span class="badge gold">YES</span><br><span class="muted" style="font-size:10.5px">' + (f.qualifyingCategories || []).join(", ") + '</span>'
            : '<span class="badge">no</span>') + '</td>' +
          '<td>' + (next ? '<span class="mono">' + fmtDate(next.date) + '</span> <span class="muted">(' + esc(next.type) + ')</span>' + (next.estimated ? ' <span class="badge">est.</span>' : "") : '<span class="muted">TBA</span>') + '</td>' +
          '<td>' + (next && next.feeAmount != null ? next.feeAmount + " " + esc(next.feeCurrency || "") : "—") + '</td>' +
          '<td>' + (f.maxRuntimeMin ? f.maxRuntimeMin + "′" : "—") + '</td>' +
          '<td style="max-width:180px"><span class="muted" style="font-size:12px">' + esc(f.premiereRequirement || "—") + '</span></td>' +
          '<td>' + (statusBadge(p.status) || '<span class="muted">—</span>') + (p.filmTitle ? '<br><span class="muted" style="font-size:11.5px">🎬 ' + esc(p.filmTitle) + '</span>' : "") + '</td>' +
        '</tr>';
      }).join("") +
      '</tbody></table></div>';

    $("#fest-filter").onchange = function () {
      render._filter = this.value;
      App.render();
    };
    $$("[data-fest]", root).forEach(function (n) {
      n.onclick = function () { planModal(n.getAttribute("data-fest")); };
    });
  }

  return { render: render };
})();
