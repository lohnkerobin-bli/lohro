/* ============ brain.js — Brand Core, Knowledge, Meetings & Weekly Reports ============ */
"use strict";

var BrainView = (function () {

  var TABS = [
    { key: "brand", label: "🎨 Brand Core" },
    { key: "knowledge", label: "📚 Knowledge" },
    { key: "meetings", label: "🗓 Meetings & Reports" }
  ];

  var BRAND_SECTIONS = [
    { key: "core", label: "Brand Core", icon: "🎯" },
    { key: "values", label: "Values & Tone", icon: "🧭" },
    { key: "dos", label: "Do's", icon: "✅" },
    { key: "donts", label: "Don'ts", icon: "❌" },
    { key: "cta", label: "Call-to-Action Strategy", icon: "📣" },
    { key: "assets", label: "Brand Assets", icon: "🗂" },
    { key: "team", label: "Team Playbook", icon: "👥" }
  ];

  /* ---------- Brand Core ---------- */

  function brandNoteModal(id) {
    var s = Store.get();
    var note = id ? s.brandNotes.find(function (x) { return x.id === id; }) : null;
    var v = note || { section: "core", title: "", content: "" };
    var html =
      '<h3>' + (note ? "Edit brand note" : "New brand note") + '</h3>' +
      '<div class="row">' +
      '<label class="field" style="flex:1"><span>Section</span><select id="b-section">' +
      BRAND_SECTIONS.map(function (sec) {
        return '<option value="' + sec.key + '"' + (v.section === sec.key ? " selected" : "") + '>' + sec.icon + " " + sec.label + '</option>';
      }).join("") + '</select></label>' +
      '<label class="field" style="flex:2"><span>Title</span><input id="b-title" value="' + esc(v.title) + '"></label></div>' +
      '<label class="field"><span>Content</span><textarea id="b-content" style="min-height:180px">' + esc(v.content) + '</textarea></label>' +
      '<div class="modal-actions">' +
      (note ? '<button class="ghost danger" id="b-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="b-save">Save</button></div>';
    openModal(html);
    $("#b-save").onclick = function () {
      var title = $("#b-title").value.trim();
      if (!title) { toast("Title required", true); return; }
      var now = new Date().toISOString();
      if (note) {
        note.section = $("#b-section").value; note.title = title;
        note.content = $("#b-content").value.trim(); note.updatedAt = now;
      } else {
        s.brandNotes.push({
          id: uid("brand"), section: $("#b-section").value, title: title,
          content: $("#b-content").value.trim(), updatedAt: now
        });
      }
      Store.save(); closeModal(); toast("Brand note saved"); App.render();
    };
    var del = $("#b-delete");
    if (del) del.onclick = function () {
      s.brandNotes = s.brandNotes.filter(function (x) { return x.id !== id; });
      Store.save(); closeModal(); toast("Deleted"); App.render();
    };
  }

  function brandHTML() {
    var s = Store.get();
    var q = (render._q || "").toLowerCase();
    return '<div class="row between mb">' +
      '<span class="muted" style="font-size:13px">The single source of truth for everyone working on the Lohro brand. Click a card to edit.</span>' +
      '<button class="primary small" id="brand-new">+ Add note</button></div>' +
      BRAND_SECTIONS.map(function (sec) {
        var notes = s.brandNotes.filter(function (n) {
          if (n.section !== sec.key) return false;
          if (q && (n.title + " " + n.content).toLowerCase().indexOf(q) === -1) return false;
          return true;
        });
        if (notes.length === 0 && q) return "";
        return '<h2 class="section-title">' + sec.icon + ' ' + sec.label + '</h2>' +
          '<div class="grid cols-2">' +
          notes.map(function (n) {
            return '<div class="card soft clickable" data-brand="' + esc(n.id) + '">' +
              '<div style="font-weight:700;font-size:14.5px;margin-bottom:8px">' + esc(n.title) + '</div>' +
              '<div class="muted" style="font-size:13px;line-height:1.65;white-space:pre-wrap">' + esc(n.content) + '</div>' +
            '</div>';
          }).join("") +
          (notes.length === 0 ? '<div class="empty-note">Nothing here yet.</div>' : "") +
          '</div>';
      }).join("");
  }

  /* ---------- Knowledge (from PDF export) ---------- */

  function knowledgeHTML() {
    var kb = window.SEED && window.SEED.knowledge;
    if (!kb || !kb.sections) return '<div class="empty-note">No knowledge base in seed data.</div>';
    var q = (render._q || "").toLowerCase();
    var sections = kb.sections.map(function (sec) {
      var entries = sec.entries.filter(function (e) {
        return !q || e.toLowerCase().indexOf(q) !== -1 || sec.title.toLowerCase().indexOf(q) !== -1;
      });
      return { sec: sec, entries: entries };
    }).filter(function (x) { return x.entries.length > 0; });
    if (sections.length === 0) return '<div class="empty-note">Nothing matches.</div>';
    return '<p class="muted mb" style="font-size:13px">' + esc(kb.source || "") + '</p>' +
      '<div class="grid cols-2">' +
      sections.map(function (x) {
        return '<div class="card soft">' +
          '<h2 class="section-title" style="margin-top:0">' + x.sec.icon + ' ' + esc(x.sec.title) +
          ' <span class="badge gray">' + x.entries.length + '</span></h2>' +
          '<ul style="padding-left:18px;font-size:13.5px;line-height:1.7;display:flex;flex-direction:column;gap:8px">' +
          x.entries.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join("") +
          '</ul></div>';
      }).join("") + '</div>';
  }

  /* ---------- Meetings & Weekly Report ---------- */

  function meetingModal(id) {
    var s = Store.get();
    var m = id ? s.meetings.find(function (x) { return x.id === id; }) : null;
    var v = m || { date: todayISO(), title: "Weekly — Robin & Simon", participants: "Robin, Simon", transcript: "", decisions: "", actions: "" };
    var html =
      '<h3>' + (m ? "Edit meeting" : "New meeting") + '</h3>' +
      '<div class="row">' +
      '<label class="field" style="flex:1"><span>Date</span><input type="date" id="m-date" value="' + esc(v.date) + '"></label>' +
      '<label class="field" style="flex:2"><span>Title</span><input id="m-title" value="' + esc(v.title) + '"></label></div>' +
      '<label class="field"><span>Participants</span><input id="m-participants" value="' + esc(v.participants) + '"></label>' +
      '<label class="field"><span>Transcript (paste the full recording transcript here)</span><textarea id="m-transcript" style="min-height:160px" placeholder="Paste transcript...">' + esc(v.transcript) + '</textarea></label>' +
      '<label class="field"><span>Decisions</span><textarea id="m-decisions" placeholder="What did we decide?">' + esc(v.decisions) + '</textarea></label>' +
      '<label class="field"><span>Action items</span><textarea id="m-actions" placeholder="Who does what by when?">' + esc(v.actions) + '</textarea></label>' +
      '<div class="modal-actions">' +
      (m ? '<button class="ghost danger" id="m-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="m-save">Save</button></div>';
    openModal(html, { sticky: true });
    $("#m-save").onclick = function () {
      var now = new Date().toISOString();
      var data = {
        date: $("#m-date").value || todayISO(),
        title: $("#m-title").value.trim() || "Meeting",
        participants: $("#m-participants").value.trim(),
        transcript: $("#m-transcript").value.trim(),
        decisions: $("#m-decisions").value.trim(),
        actions: $("#m-actions").value.trim(),
        updatedAt: now
      };
      if (m) Object.assign(m, data);
      else { data.id = uid("mtg"); s.meetings.push(data); }
      Store.save(); closeModal(); toast("Meeting saved"); App.render();
    };
    var del = $("#m-delete");
    if (del) del.onclick = function () {
      s.meetings = s.meetings.filter(function (x) { return x.id !== id; });
      Store.save(); closeModal(); toast("Meeting deleted"); App.render();
    };
  }

  function buildWeeklyReport() {
    var s = Store.get();
    var today = todayISO();
    var weekAgo = addDays(today, -7);
    var lines = [];
    lines.push("# WAY TO OSCAR — Weekly Report");
    lines.push("Week " + fmtDate(weekAgo) + " – " + fmtDate(today) + " · generated " + today);
    lines.push("");

    // challenge
    var days = [], published = 0, skipped = 0, learnings = [];
    for (var d = weekAgo; d <= today; d = addDays(d, 1)) {
      var e = s.challengeDays[d];
      if (!e) continue;
      days.push(e);
      if (e.status === "published") published++;
      if (e.status === "skipped") skipped++;
      if (e.learnings) learnings.push("- " + fmtDateShort(e.date) + " " + (e.title || "") + ": " + e.learnings);
    }
    lines.push("## 🎬 Daily Challenge");
    if (today < s.settings.challengeStart) {
      lines.push("Starts " + fmtDate(s.settings.challengeStart) + " — " + daysBetween(today, s.settings.challengeStart) + " days to go.");
    } else {
      lines.push(published + " published, " + skipped + " skipped, " + days.length + " days logged this week.");
    }
    if (learnings.length) { lines.push(""); lines.push("**Learnings:**"); lines = lines.concat(learnings); }
    lines.push("");

    // followers
    lines.push("## 📈 Followers");
    ["instagram", "youtube", "tiktok"].forEach(function (pf) {
      var pts = s.followers.filter(function (f) { return f.platform === pf; })
        .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
      if (!pts.length) return;
      var last = pts[pts.length - 1];
      var weekStart = pts.filter(function (p) { return p.date <= weekAgo; }).pop() || pts[0];
      var delta = last.count - weekStart.count;
      lines.push("- " + pf + ": " + fmtNum(last.count) + " (" + (delta >= 0 ? "+" : "") + fmtNum(delta) + " this week)");
    });
    if (!s.followers.length) lines.push("- no data points yet");
    lines.push("");

    // deadlines next 21 days
    lines.push("## ⏰ Festival deadlines (next 21 days)");
    var dl = [];
    Store.festivals().forEach(function (f) {
      (f.deadlines || []).forEach(function (x) {
        if (x.date >= today && x.date <= addDays(today, 21)) {
          var plan = s.festivalPlans[f.id];
          dl.push("- " + fmtDate(x.date) + " — " + f.name + " (" + x.type + (x.estimated ? ", est." : "") + ")" +
            (plan && plan.status !== "not planned" ? " · our status: " + plan.status : " · ⚠ no plan yet"));
        }
      });
    });
    lines = lines.concat(dl.length ? dl.sort() : ["- none"]);
    lines.push("");

    // milestones
    lines.push("## 🚩 Milestones due in the next 30 days");
    var ms = s.milestones.filter(function (m) {
      return !m.done && m.date && m.date >= today && m.date <= addDays(today, 30);
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    lines = lines.concat(ms.length ? ms.map(function (m) {
      return "- " + fmtDate(m.date) + " — [Track " + m.track + "] " + m.title;
    }) : ["- none"]);
    lines.push("");

    // ideas added
    var newIdeas = s.ideas.filter(function (i) { return (i.createdAt || "") >= weekAgo; });
    lines.push("## 💡 New ideas this week: " + newIdeas.length);
    newIdeas.slice(0, 8).forEach(function (i) { lines.push("- " + i.title); });
    lines.push("");

    // open actions from last meetings
    var lastMeetings = s.meetings.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).slice(0, 2);
    if (lastMeetings.length) {
      lines.push("## 📋 Action items from recent meetings");
      lastMeetings.forEach(function (m) {
        if (m.actions) lines.push("**" + fmtDateShort(m.date) + " — " + m.title + ":**\n" + m.actions);
      });
      lines.push("");
    }

    lines.push("## 🗣 Discussion prompts (from the master plan)");
    lines.push("- Monthly honesty check: closer to the Oscar, or only closer to more followers?");
    lines.push("- One focus project per quarter — are we still on it?");
    lines.push("- Which recurring effort can we systematize or hand off this week?");
    lines.push("");
    lines.push("_After the meeting: record it, paste the transcript into Brain → Meetings._");
    return lines.join("\n");
  }

  function showWeeklyReport() {
    var report = buildWeeklyReport();
    var html =
      '<h3>Weekly Report</h3>' +
      '<textarea id="wr-text" style="min-height:320px;font-family:var(--font-mono);font-size:12px">' + esc(report) + '</textarea>' +
      '<div class="modal-actions">' +
      '<button class="ghost" onclick="closeModal()">Close</button>' +
      '<button id="wr-copy">Copy</button>' +
      '<button class="primary" id="wr-download">Download .md</button></div>';
    openModal(html);
    $("#wr-download").onclick = function () {
      downloadBlob(report, "weekly-report-" + todayISO() + ".md", "text/markdown");
      toast("Report downloaded — drop it in the Dropbox or send to Simon");
    };
    $("#wr-copy").onclick = function () {
      var t = $("#wr-text");
      t.select();
      try { document.execCommand("copy"); toast("Copied to clipboard"); } catch (e) { toast("Select + copy manually", true); }
    };
  }

  function meetingsHTML() {
    var s = Store.get();
    var meetings = s.meetings.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    return '<div class="row between mb" style="flex-wrap:wrap;gap:10px">' +
      '<span class="muted" style="font-size:13px">Weekly rhythm: generate the report → meet with Simon → record → paste the transcript here.</span>' +
      '<span class="row"><button id="weekly-report" class="teal">📄 Generate weekly report</button>' +
      '<button class="primary" id="meeting-new">+ Add meeting</button></span></div>' +
      (meetings.length === 0
        ? '<div class="card soft"><div class="empty-note">No meetings yet. After your first weekly with Simon, add it here with the transcript.</div></div>'
        : meetings.map(function (m) {
          return '<div class="card soft mb clickable" data-mtg="' + esc(m.id) + '">' +
            '<div class="row between"><div><strong>' + esc(m.title) + '</strong>' +
            '<span class="muted" style="font-size:12.5px"> · ' + fmtDate(m.date) + ' · ' + esc(m.participants || "") + '</span></div>' +
            '<span class="badge ' + (m.transcript ? "teal" : "gray") + '">' + (m.transcript ? "transcript ✓" : "no transcript") + '</span></div>' +
            (m.decisions ? '<div class="mt" style="font-size:13px"><strong>Decisions:</strong> <span class="muted" style="white-space:pre-wrap">' + esc(m.decisions) + '</span></div>' : "") +
            (m.actions ? '<div class="mt" style="font-size:13px"><strong>Actions:</strong> <span class="muted" style="white-space:pre-wrap">' + esc(m.actions) + '</span></div>' : "") +
          '</div>';
        }).join(""));
  }

  /* ---------- render ---------- */

  function render(root) {
    var tab = render._tab || "brand";
    root.innerHTML =
      '<h1 class="view-title">Brain</h1>' +
      '<p class="view-sub">The team backend: brand core, knowledge base, meetings &amp; weekly reports. Everything exportable via Data &amp; Settings.</p>' +
      '<div class="filter-bar">' +
      TABS.map(function (t) {
        return '<button class="' + (tab === t.key ? "blue" : "ghost") + '" data-tab="' + t.key + '">' + t.label + '</button>';
      }).join("") +
      (tab !== "meetings" ? '<input id="brain-q" placeholder="Search..." value="' + esc(render._q || "") + '" style="flex:1;min-width:160px">' : "") +
      '</div>' +
      (tab === "brand" ? brandHTML() : tab === "knowledge" ? knowledgeHTML() : meetingsHTML());

    $$("button[data-tab]", root).forEach(function (b) {
      b.onclick = function () { render._tab = b.getAttribute("data-tab"); render._q = ""; App.render(); };
    });
    var q = $("#brain-q");
    if (q) q.oninput = function () {
      render._q = this.value;
      var caret = this.selectionStart;
      App.render();
      var n = $("#brain-q");
      if (n) { n.focus(); n.setSelectionRange(caret, caret); }
    };
    var bn = $("#brand-new");
    if (bn) bn.onclick = function () { brandNoteModal(null); };
    $$("[data-brand]", root).forEach(function (n) {
      n.onclick = function () { brandNoteModal(n.getAttribute("data-brand")); };
    });
    var mn = $("#meeting-new");
    if (mn) mn.onclick = function () { meetingModal(null); };
    var wr = $("#weekly-report");
    if (wr) wr.onclick = showWeeklyReport;
    $$("[data-mtg]", root).forEach(function (n) {
      n.onclick = function () { meetingModal(n.getAttribute("data-mtg")); };
    });
  }

  return { render: render };
})();
