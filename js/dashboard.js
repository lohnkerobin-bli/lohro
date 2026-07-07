/* ============ dashboard.js — countdown, followers, milestones ============ */
"use strict";

var DashboardView = (function () {

  function countdownHTML(targetISO) {
    var now = new Date();
    var target = parseISO(targetISO);
    var ms = target - now;
    if (ms < 0) ms = 0;
    var days = Math.floor(ms / 86400000);
    var hours = Math.floor((ms % 86400000) / 3600000);
    var mins = Math.floor((ms % 3600000) / 60000);
    var secs = Math.floor((ms % 60000) / 1000);
    function box(n, l) {
      return '<div class="unit-box"><div class="num">' + n + '</div><div class="lbl">' + l + "</div></div>";
    }
    return box(days, "days") + box(hours, "hours") + box(mins, "min") + box(secs, "sec");
  }

  function latestFollowers(platform) {
    var s = Store.get();
    var pts = s.followers.filter(function (f) { return f.platform === platform; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    return pts.length ? pts[pts.length - 1] : null;
  }

  function growthProjection() {
    var s = Store.get();
    var pts = s.followers.filter(function (f) { return f.platform === "instagram"; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    if (pts.length < 2) return null;
    var first = pts[0], last = pts[pts.length - 1];
    var days = Math.max(daysBetween(first.date, last.date), 1);
    var perDay = (last.count - first.count) / days;
    if (perDay <= 0) return { perDay: perDay, eta: null };
    var remaining = s.settings.followerGoal - last.count;
    var etaDays = Math.ceil(remaining / perDay);
    return { perDay: perDay, eta: addDays(last.date, etaDays), etaDays: etaDays };
  }

  function challengeStats() {
    var s = Store.get();
    var start = s.settings.challengeStart;
    var today = todayISO();
    var days = Object.keys(s.challengeDays).map(function (k) { return s.challengeDays[k]; });
    var published = days.filter(function (d) { return d.status === "published"; }).length;
    var elapsed = Math.max(0, daysBetween(start, today) + 1);
    if (today < start) elapsed = 0;
    // streak: consecutive published days ending today or yesterday
    var streak = 0;
    var cursor = today;
    if (!(s.challengeDays[cursor] && s.challengeDays[cursor].status === "published")) cursor = addDays(today, -1);
    while (s.challengeDays[cursor] && s.challengeDays[cursor].status === "published") {
      streak++;
      cursor = addDays(cursor, -1);
    }
    return { published: published, elapsed: elapsed, streak: streak, started: today >= start };
  }

  function nextDeadlines(limit) {
    var today = todayISO();
    var rows = [];
    Store.festivals().forEach(function (f) {
      (f.deadlines || []).forEach(function (d) {
        if (d.date && d.date >= today) rows.push({ festival: f, deadline: d });
      });
    });
    rows.sort(function (a, b) { return a.deadline.date < b.deadline.date ? -1 : 1; });
    // one (earliest) deadline per festival
    var seen = {}, out = [];
    rows.forEach(function (r) {
      if (seen[r.festival.id]) return;
      seen[r.festival.id] = true;
      out.push(r);
    });
    return out.slice(0, limit || 5);
  }

  function addFollowerModal() {
    var html =
      '<h3>Add follower data point</h3>' +
      '<label class="field"><span>Platform</span><select id="f-platform">' +
      '<option value="instagram">Instagram (@lohro)</option>' +
      '<option value="youtube">YouTube (Way to Oscar)</option>' +
      '<option value="tiktok">TikTok</option></select></label>' +
      '<label class="field"><span>Date</span><input type="date" id="f-date" value="' + todayISO() + '"></label>' +
      '<label class="field"><span>Follower count</span><input type="number" id="f-count" min="0" placeholder="e.g. 12500"></label>' +
      '<div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="f-save">Save</button></div>';
    openModal(html);
    $("#f-save").onclick = function () {
      var count = parseInt($("#f-count").value, 10);
      if (isNaN(count) || count < 0) { toast("Enter a valid count", true); return; }
      Store.get().followers.push({
        id: uid("fol"), date: $("#f-date").value || todayISO(),
        platform: $("#f-platform").value, count: count,
        updatedAt: new Date().toISOString()
      });
      Store.save();
      closeModal(); toast("Follower data point saved");
      App.render();
    };
  }

  function addMilestoneModal() {
    var html =
      '<h3>Add milestone</h3>' +
      '<label class="field"><span>Title</span><input id="m-title" placeholder="e.g. Sign a festival mentor"></label>' +
      '<label class="field"><span>Target date</span><input type="date" id="m-date"></label>' +
      '<label class="field"><span>Track</span><select id="m-track">' +
      '<option value="A">Track A — Festival films</option>' +
      '<option value="B">Track B — Personal brand</option></select></label>' +
      '<div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="m-save">Save</button></div>';
    openModal(html);
    $("#m-save").onclick = function () {
      var title = $("#m-title").value.trim();
      if (!title) { toast("Title required", true); return; }
      Store.get().milestones.push({
        id: uid("ms"), title: title, date: $("#m-date").value || null,
        done: false, track: $("#m-track").value, updatedAt: new Date().toISOString()
      });
      Store.save(); closeModal(); toast("Milestone added"); App.render();
    };
  }

  function todayStripHTML() {
    var s = Store.get();
    var today = todayISO();
    var start = s.settings.challengeStart;
    var parts = [];
    // challenge status today
    if (today >= start) {
      var dayNum = daysBetween(start, today) + 1;
      var entry = s.challengeDays[today];
      var done = entry && entry.status === "published";
      parts.push('<span>🎬 <strong>Day ' + dayNum + '</strong> — ' +
        (done ? '<span class="badge teal">published ✓</span>'
          : entry && entry.title ? '<span class="badge blue">' + esc(entry.status) + ": " + esc(entry.title) + '</span>'
          : '<span class="badge red">no film logged yet</span>') +
        ' <a href="#/challenge">log →</a></span>');
    } else {
      parts.push('<span>🎬 Challenge starts <strong>' + fmtDate(start) + '</strong> — ' + daysBetween(today, start) + ' days to prepare</span>');
    }
    // most urgent deadline
    var next = nextDeadlines(1)[0];
    if (next) {
      var d = daysBetween(today, next.deadline.date);
      parts.push('<span>⏰ Next deadline: <strong>' + esc(next.festival.name) + '</strong> in ' +
        '<span class="badge ' + (d <= 21 ? "red" : "gray") + '">' + d + ' days</span> <a href="#/festivals">plan →</a></span>');
    }
    // principle of the day
    var st = window.SEED && window.SEED.strategy;
    if (st && st.principles && st.principles.length) {
      var doy = Math.floor((parseISO(today) - new Date(parseISO(today).getFullYear(), 0, 0)) / 86400000);
      parts.push('<span class="muted">💭 ' + esc(st.principles[doy % st.principles.length]) + '</span>');
    }
    return '<div class="card mb" style="padding:12px 18px"><div class="row" style="gap:22px;font-size:13.5px">' +
      parts.join("") + '</div></div>';
  }

  function strategyHTML() {
    var st = window.SEED && window.SEED.strategy;
    if (!st) return "";
    return '<h2 class="section-title">Strategy Briefing <span class="muted" style="letter-spacing:0;text-transform:none;font-weight:400">(from your Notion master plan)</span></h2>' +
      '<div class="card accent-gold mb"><span class="stat-label">North Star</span>' +
      '<p class="mt" style="font-size:14.5px;font-weight:600">' + esc(st.northStar) + '</p>' +
      '<p class="muted mt" style="font-size:12.5px">' + esc(st.oscarHorizon) + '</p></div>' +
      '<div class="grid cols-2">' +
      ['A', 'B'].map(function (k) {
        var t = st.tracks[k];
        if (!t) return "";
        return '<div class="card ' + (k === "A" ? "accent-gold" : "accent-teal") + '">' +
          '<span class="stat-label">' + esc(t.name) + '</span>' +
          '<p class="mt" style="font-size:13px">' + esc(t.focus) + '</p>' +
          (t.priority1 ? '<p class="mt" style="font-size:13px"><span class="badge red">Priority 1</span> ' + esc(t.priority1) + '</p>' : "") +
          '<p class="muted mt" style="font-size:12.5px">⚠ ' + esc(t.rule) + '</p></div>';
      }).join("") + '</div>' +
      '<div class="card mt"><span class="stat-label">Operating principles</span><ul class="mt" style="padding-left:20px;font-size:13.5px;line-height:1.9">' +
      (st.principles || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join("") +
      '</ul></div>';
  }

  var tickTimer = null;

  function render(root) {
    var s = Store.get();
    var ig = latestFollowers("instagram");
    var yt = latestFollowers("youtube");
    var proj = growthProjection();
    var ch = challengeStats();
    var goal = s.settings.followerGoal;
    var igCount = ig ? ig.count : 0;
    var pct = Math.min(100, (igCount / goal) * 100);
    var challengeStartsIn = daysBetween(todayISO(), s.settings.challengeStart);

    var igPoints = s.followers.filter(function (f) { return f.platform === "instagram"; })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; })
      .map(function (f) { return { x: parseISO(f.date).getTime(), y: f.count }; });

    var deadlines = nextDeadlines(5);
    var milestones = s.milestones.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.date || "9999") < (b.date || "9999") ? -1 : 1;
    });

    root.innerHTML =
      '<h1 class="view-title">Dashboard</h1>' +
      '<p class="view-sub">Two tracks, one goal. Track A: festival films. Track B: 1M followers. Destination: the Oscar stage.</p>' +

      todayStripHTML() +

      '<div class="grid cols-2">' +
        '<div class="card accent-gold">' +
          '<div class="row between"><span class="stat-label">🏆 Countdown to the Oscars</span>' +
          '<span class="badge gold">' + esc(s.settings.oscarCeremonyLabel) + '</span></div>' +
          '<div class="countdown mt" id="oscar-countdown">' + countdownHTML(s.settings.oscarCeremonyDate) + '</div>' +
        '</div>' +
        '<div class="card accent-red">' +
          '<div class="row between"><span class="stat-label">🎬 Daily Short Film Challenge</span>' +
          (ch.started
            ? '<span class="badge red">LIVE</span>'
            : '<span class="badge">starts in ' + challengeStartsIn + ' days</span>') +
          '</div>' +
          '<div class="row mt" style="gap:26px">' +
            '<div><div class="stat-value">' + ch.published + '</div><div class="stat-hint">films published</div></div>' +
            '<div><div class="stat-value">' + ch.streak + '<span class="unit"> 🔥</span></div><div class="stat-hint">day streak</div></div>' +
            '<div><div class="stat-value">' + (ch.started ? ch.elapsed : 0) + '</div><div class="stat-hint">days elapsed</div></div>' +
          '</div>' +
          '<div class="mt"><a href="#/challenge" class="btn">Open challenge board →</a></div>' +
        '</div>' +
      '</div>' +

      '<h2 class="section-title">Track B — Follower Growth</h2>' +
      '<div class="grid cols-3">' +
        '<div class="card accent-teal">' +
          '<span class="stat-label">Instagram @lohro</span>' +
          '<div class="stat-value">' + fmtCompact(igCount) + '</div>' +
          '<div class="progress mt"><div style="width:' + pct.toFixed(2) + '%"></div></div>' +
          '<div class="stat-hint mt">' + pct.toFixed(1) + '% of ' + fmtCompact(goal) + ' goal' +
          (ig ? ' · updated ' + fmtDateShort(ig.date) : " · no data yet") + '</div>' +
        '</div>' +
        '<div class="card accent-blue">' +
          '<span class="stat-label">YouTube — Way to Oscar</span>' +
          '<div class="stat-value">' + fmtCompact(yt ? yt.count : 0) + '</div>' +
          '<div class="stat-hint">' + (yt ? 'updated ' + fmtDateShort(yt.date) : "no data yet") + '</div>' +
        '</div>' +
        '<div class="card">' +
          '<span class="stat-label">Projection to 1M</span>' +
          (proj && proj.eta
            ? '<div class="stat-value">' + fmtDate(proj.eta) + '</div><div class="stat-hint">+' + fmtNum(Math.round(proj.perDay)) + '/day · ' +
              (proj.eta <= s.settings.followerGoalDate ? '<span class="badge teal">on track</span>' : '<span class="badge red">behind goal date</span>') + '</div>'
            : '<div class="stat-value">—</div><div class="stat-hint">add ≥2 Instagram data points to project</div>') +
        '</div>' +
      '</div>' +
      '<div class="card mt chart-box">' +
        '<div class="row between"><span class="stat-label">Instagram growth</span>' +
        '<button class="primary small" id="add-follower">+ Add data point</button></div>' +
        '<div class="mt">' + sparkline(igPoints, { goal: goal }) + '</div>' +
      '</div>' +

      '<h2 class="section-title">Next Festival Deadlines</h2>' +
      (deadlines.length === 0
        ? '<div class="empty-note">No upcoming deadlines found.</div>'
        : '<div class="table-wrap"><table><thead><tr><th>Deadline</th><th>Festival</th><th>Type</th><th>Fee</th><th>Oscar-qualifying</th></tr></thead><tbody>' +
          deadlines.map(function (r) {
            var days = daysBetween(todayISO(), r.deadline.date);
            return '<tr class="clickable" onclick="location.hash=\'#/festivals\'">' +
              '<td><span class="mono">' + fmtDate(r.deadline.date) + '</span> <span class="badge ' + (days <= 21 ? "red" : "gray") + '">' + days + 'd</span>' +
              (r.deadline.estimated ? ' <span class="badge">est.</span>' : "") + '</td>' +
              '<td><strong>' + esc(r.festival.name) + '</strong><br><span class="muted">' + esc(r.festival.city || "") + ", " + esc(r.festival.country || "") + '</span></td>' +
              '<td>' + esc(r.deadline.type) + '</td>' +
              '<td>' + (r.deadline.feeAmount != null ? r.deadline.feeAmount + " " + esc(r.deadline.feeCurrency || "") : "—") + '</td>' +
              '<td>' + (r.festival.oscarQualifying ? '<span class="badge gold">YES</span>' : '<span class="badge">no</span>') + '</td></tr>';
          }).join("") + "</tbody></table></div>") +

      '<h2 class="section-title">Milestones</h2>' +
      '<div class="card">' +
        milestones.map(function (m) {
          return '<div class="milestone-row ' + (m.done ? "done" : "") + '">' +
            '<input type="checkbox" data-ms="' + esc(m.id) + '" ' + (m.done ? "checked" : "") + '>' +
            '<span class="badge ' + (m.track === "A" ? "gold" : "teal") + '">' + (m.track === "A" ? "Track A" : "Track B") + '</span>' +
            '<span class="m-title">' + esc(m.title) + '</span>' +
            '<span class="m-date">' + (m.date ? fmtDate(m.date) : "") + '</span>' +
            '<button class="small ghost danger" data-del-ms="' + esc(m.id) + '" title="Delete">✕</button>' +
          '</div>';
        }).join("") +
        '<div class="mt"><button id="add-milestone">+ Add milestone</button></div>' +
      '</div>' +
      strategyHTML();

    $("#add-follower").onclick = addFollowerModal;
    $("#add-milestone").onclick = addMilestoneModal;
    $$("input[data-ms]", root).forEach(function (cb) {
      cb.onchange = function () {
        var m = Store.get().milestones.find(function (x) { return x.id === cb.getAttribute("data-ms"); });
        if (m) { m.done = cb.checked; m.updatedAt = new Date().toISOString(); Store.save(); App.render(); }
      };
    });
    $$("button[data-del-ms]", root).forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-del-ms");
        var st = Store.get();
        st.milestones = st.milestones.filter(function (x) { return x.id !== id; });
        Store.save(); App.render();
      };
    });

    // live countdown tick
    if (tickTimer) clearInterval(tickTimer);
    tickTimer = setInterval(function () {
      var elCd = $("#oscar-countdown");
      if (!elCd) { clearInterval(tickTimer); tickTimer = null; return; }
      elCd.innerHTML = countdownHTML(Store.get().settings.oscarCeremonyDate);
    }, 1000);
  }

  return { render: render };
})();
