/* ============ challenge.js — Daily Short Film Challenge tracker ============ */
"use strict";

var ChallengeView = (function () {

  var STATUSES = [
    { key: "planned", label: "Planned" },
    { key: "shooting", label: "Shooting" },
    { key: "editing", label: "Editing" },
    { key: "published", label: "Published" },
    { key: "skipped", label: "Skipped" }
  ];

  function dayList() {
    var s = Store.get();
    var start = s.settings.challengeStart;
    var today = todayISO();
    var end = addDays(today > start ? today : start, 7); // lookahead
    var out = [];
    var d = start;
    while (d <= end) {
      out.push(d);
      d = addDays(d, 1);
    }
    return out;
  }

  function editDayModal(dateISO) {
    var s = Store.get();
    var day = s.challengeDays[dateISO] || { date: dateISO, title: "", idea: "", status: "planned", link: "", learnings: "" };
    var dayNum = daysBetween(s.settings.challengeStart, dateISO) + 1;
    var html =
      '<h3>Day ' + dayNum + ' — ' + fmtDate(dateISO, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + '</h3>' +
      '<label class="field"><span>Film title</span><input id="d-title" value="' + esc(day.title) + '" placeholder="Working title"></label>' +
      '<label class="field"><span>Idea / logline</span><textarea id="d-idea" placeholder="One-sentence story...">' + esc(day.idea) + '</textarea></label>' +
      '<label class="field"><span>Status</span><select id="d-status">' +
      STATUSES.map(function (st) {
        return '<option value="' + st.key + '"' + (day.status === st.key ? " selected" : "") + '>' + st.label + '</option>';
      }).join("") + '</select></label>' +
      '<label class="field"><span>Link (YouTube / Instagram / Drive)</span><input id="d-link" value="' + esc(day.link) + '" placeholder="https://..."></label>' +
      '<label class="field"><span>Learnings</span><textarea id="d-learnings" placeholder="What did today teach you?">' + esc(day.learnings) + '</textarea></label>' +
      '<div class="modal-actions">' +
      (s.challengeDays[dateISO] ? '<button class="ghost danger" id="d-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="d-save">Save</button></div>';
    openModal(html);
    $("#d-save").onclick = function () {
      var wasPublished = s.challengeDays[dateISO] && s.challengeDays[dateISO].status === "published";
      var nowPublished = $("#d-status").value === "published";
      s.challengeDays[dateISO] = {
        date: dateISO,
        title: $("#d-title").value.trim(),
        idea: $("#d-idea").value.trim(),
        status: $("#d-status").value,
        link: $("#d-link").value.trim(),
        learnings: $("#d-learnings").value.trim(),
        updatedAt: new Date().toISOString()
      };
      Store.save(); closeModal();
      if (nowPublished && !wasPublished) {
        confetti();
        toast("🎬 Day " + dayNum + " published — see you tomorrow!");
      } else {
        toast("Day " + dayNum + " saved");
      }
      App.render();
    };
    var del = $("#d-delete");
    if (del) del.onclick = function () {
      delete s.challengeDays[dateISO];
      Store.save(); closeModal(); toast("Entry removed"); App.render();
    };
  }

  function render(root) {
    var s = Store.get();
    var today = todayISO();
    var start = s.settings.challengeStart;
    var days = dayList();
    var entries = Object.keys(s.challengeDays).map(function (k) { return s.challengeDays[k]; });
    var published = entries.filter(function (e) { return e.status === "published"; });
    var withLearnings = entries.filter(function (e) { return e.learnings; })
      .sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    var elapsed = today >= start ? daysBetween(start, today) + 1 : 0;
    var rate = elapsed > 0 ? Math.round((published.length / elapsed) * 100) : 0;

    root.innerHTML =
      '<h1 class="view-title">Daily Challenge</h1>' +
      '<p class="view-sub">One short film every day, starting ' + fmtDate(start, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) + '. Click a day to log it.</p>' +

      '<div class="grid cols-4 mb">' +
        '<div class="card accent-teal"><span class="stat-label">Published</span><div class="stat-value">' + published.length + '</div></div>' +
        '<div class="card accent-blue"><span class="stat-label">Days elapsed</span><div class="stat-value">' + elapsed + '</div></div>' +
        '<div class="card accent-red"><span class="stat-label">Hit rate</span><div class="stat-value">' + rate + '<span class="unit">%</span></div></div>' +
        (function () {
          var horizon = 0;
          for (var i = 1; i <= 14; i++) {
            var dd = addDays(today, i);
            if (dd >= start && s.challengeDays[dd] && (s.challengeDays[dd].title || s.challengeDays[dd].idea)) horizon++;
          }
          var cls = horizon >= 10 ? "teal" : horizon >= 5 ? "gold" : "red";
          return '<div class="card accent-gold"><span class="stat-label">Planned next 14 days</span>' +
            '<div class="stat-value">' + horizon + '<span class="unit">/14</span></div>' +
            '<div class="stat-hint"><span class="badge ' + cls + '">' + (horizon >= 10 ? "healthy pipeline" : horizon >= 5 ? "plan more" : "pipeline empty") + '</span> Editor Bible: plan 2 weeks ahead</div></div>';
        })() +
      '</div>' +

      '<h2 class="section-title">Day Board</h2>' +
      '<div class="day-grid">' +
      days.map(function (d) {
        var e = s.challengeDays[d];
        var dayNum = daysBetween(start, d) + 1;
        var cls = ["day-cell"];
        if (d === today) cls.push("today");
        if (d > today) cls.push("future");
        if (e) cls.push(e.status); else cls.push("empty");
        var statusBadge = e ? (e.status === "published" ? "✅" : e.status === "skipped" ? "✕" : e.status === "planned" ? "◻" : "✂️") : "";
        return '<div class="' + cls.join(" ") + '" data-day="' + d + '">' +
          '<div class="d-date"><span>Day ' + dayNum + '</span><span>' + weekdayShort(d) + " " + fmtDateShort(d) + '</span></div>' +
          '<div class="d-title">' + (e && e.title ? esc(e.title) : (e && e.idea ? esc(e.idea) : "—")) + '</div>' +
          '<div class="row between" style="margin-top:auto"><span class="muted" style="font-size:11px">' + (e ? esc(e.status) : "") + '</span><span>' + statusBadge + '</span></div>' +
        '</div>';
      }).join("") +
      '</div>' +

      '<h2 class="section-title">Learnings Log</h2>' +
      (withLearnings.length === 0
        ? '<div class="empty-note">No learnings logged yet. Every film teaches something — write it down.</div>'
        : '<div class="card">' + withLearnings.slice(0, 30).map(function (e) {
            return '<div class="milestone-row">' +
              '<span class="m-date">' + fmtDateShort(e.date) + '</span>' +
              '<span class="m-title"><strong>' + esc(e.title || "Untitled") + ':</strong> ' + esc(e.learnings) + '</span></div>';
          }).join("") + "</div>");

    $$(".day-cell", root).forEach(function (cell) {
      cell.onclick = function () { editDayModal(cell.getAttribute("data-day")); };
    });
  }

  return { render: render };
})();
