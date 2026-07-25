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

  // sorted data-point series for one platform; same-day entries resolved by updatedAt
  function platformSeries(platform) {
    return Store.get().followers
      .filter(function (f) { return f.platform === platform; })
      .sort(function (a, b) {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return (a.updatedAt || "") < (b.updatedAt || "") ? -1 : 1;
      });
  }

  function latestFollowers(platform) {
    var pts = platformSeries(platform);
    return pts.length ? pts[pts.length - 1] : null;
  }

  function growthProjection() {
    var s = Store.get();
    var pts = platformSeries("instagram");
    if (pts.length < 2) return null;
    var first = pts[0], last = pts[pts.length - 1];
    var days = Math.max(daysBetween(first.date, last.date), 1);
    var perDay = (last.count - first.count) / days;
    if (perDay <= 0) return { perDay: perDay, eta: null };
    var remaining = s.settings.followerGoal - last.count;
    var etaDays = Math.ceil(remaining / perDay);
    return { perDay: perDay, eta: addDays(last.date, etaDays), etaDays: etaDays };
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

  function principleOfDay() {
    var st = window.SEED && window.SEED.strategy;
    if (!st || !st.principles || !st.principles.length) return "";
    var today = todayISO();
    var doy = Math.round((parseISO(today) - new Date(parseISO(today).getFullYear(), 0, 0)) / 86400000);
    return st.principles[doy % st.principles.length];
  }

  function actionRowHTML() {
    var s = Store.get();
    var today = todayISO();
    // the film you touched last = your current focus
    var films = s.films.slice().sort(function (a, b) {
      return (Date.parse(b.updatedAt || 0) || 0) - (Date.parse(a.updatedAt || 0) || 0);
    });
    var f = films[0];
    var left = "";
    if (f) {
      left = '<div class="action-pill spotlight clickable" onclick="FilmsView._openId=\'' + esc(f.id) + '\';location.hash=\'#/films\';if(location.hash===\'#/films\')App.render()">' +
        '<span class="ap-icon">🎬</span>' +
        '<span class="ap-text"><strong>Continue: ' + esc(f.title.slice(0, 38)) + '</strong><small>' +
        esc(f.status) + (f.script ? " · " + (f.script.match(/\S+/g) || []).length + " words" : " · no script yet") + '</small></span>' +
        '<span class="ap-cta">Open →</span></div>';
    }
    var right = "";
    var next = nextDeadlines(1)[0];
    if (next) {
      var d = daysBetween(today, next.deadline.date);
      right = '<div class="action-pill tint-gold clickable" onclick="location.hash=\'#/festivals\'">' +
        '<span class="ap-icon">⏰</span>' +
        '<span class="ap-text"><strong>' + esc(next.festival.name) + '</strong><small>' +
        esc(next.deadline.type) + ' deadline · ' + fmtDateShort(next.deadline.date) + '</small></span>' +
        '<span class="ap-cta ' + (d <= 21 ? "hot" : "") + '">' + d + 'd</span></div>';
    }
    return '<div class="action-row">' + left + right + '</div>';
  }

  /* ---------- social output (from the daily Sandcastles post-check) ---------- */

  var PF_COLOR = { instagram: "#B04A93", youtube: "#E63946", tiktok: "#2FA39A" };

  function socialOutputHTML() {
    var entries = (window.SEED && window.SEED.socialLog && window.SEED.socialLog.entries) || [];
    var head = '<div class="card soft tint-magenta mt">' +
      '<div class="row between"><span class="stat-label">📤 Social output</span>' +
      '<span class="muted" style="font-size:11.5px">daily Sandcastles check · weekly overview every Thursday</span></div>';
    if (!entries.length) {
      return head + '<div class="chart-empty" style="padding:22px 10px">📤<br>The daily post-check starts tomorrow morning.<br>Videos posted per week and platform will show up here automatically.</div></div>';
    }
    // aggregate per ISO-week start (Monday) per platform
    function weekStart(iso) {
      var d = parseISO(iso);
      var wd = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - wd);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    var weeks = {};
    entries.forEach(function (e) {
      var w = weekStart(e.date);
      weeks[w] = weeks[w] || {};
      weeks[w][e.platform] = (weeks[w][e.platform] || 0) + (e.newPosts || 0);
    });
    var keys = Object.keys(weeks).sort().slice(-6);
    var pfs = ["instagram", "youtube", "tiktok"];
    var maxV = 1;
    keys.forEach(function (w) { pfs.forEach(function (p) { maxV = Math.max(maxV, weeks[w][p] || 0); }); });
    var W = 640, H = 150, pad = 26;
    var groupW = (W - pad * 2) / keys.length;
    var barW = Math.min(18, groupW / 4.5);
    var bars = "", labels = "";
    keys.forEach(function (w, wi) {
      var x0 = pad + wi * groupW + groupW / 2 - (barW * 1.5 + 4);
      pfs.forEach(function (p, pi) {
        var v = weeks[w][p] || 0;
        var h = (v / maxV) * (H - pad * 2);
        bars += '<rect x="' + (x0 + pi * (barW + 2)).toFixed(1) + '" y="' + (H - pad - h).toFixed(1) +
          '" width="' + barW + '" height="' + Math.max(1.5, h).toFixed(1) + '" rx="3" fill="' + PF_COLOR[p] + '"' + (v === 0 ? ' opacity=".25"' : '') + '/>' +
          (v > 0 ? '<text x="' + (x0 + pi * (barW + 2) + barW / 2).toFixed(1) + '" y="' + (H - pad - h - 4).toFixed(1) + '" text-anchor="middle" fill="#FFF" font-size="9.5" font-weight="700">' + v + '</text>' : "");
      });
      labels += '<text x="' + (pad + wi * groupW + groupW / 2).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="middle" fill="rgba(255,255,255,.6)" font-size="10">' + fmtDateShort(w) + '</text>';
    });
    return head +
      '<div class="mt"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img">' + bars + labels + '</svg></div>' +
      '<div class="row mt" style="gap:14px;font-size:11.5px">' +
      pfs.map(function (p) { return '<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + PF_COLOR[p] + ';margin-right:5px"></span>' + p + '</span>'; }).join("") +
      '<span class="muted">videos posted per week</span></div></div>';
  }

  function visionStripHTML() {
    var boards = Store.get().visionBoards || [];
    if (!boards.length) return "";
    var b = boards[0];
    return '<h2 class="section-title">🌟 ' + esc(b.title) +
      ' <a href="#/brain" class="muted" style="letter-spacing:0;text-transform:none;font-weight:600;font-size:12px" onclick="BrainView._pendingTab=\'vision\'">edit boards →</a></h2>' +
      '<div class="vision-grid">' + b.tiles.map(function (t, i) {
        if (t.kind === "asset" && assetUrl(t.assetKey)) {
          return '<div class="vision-tile image" style="background-image:url(' + assetUrl(t.assetKey) + ')">' +
            (t.text ? '<span class="vt-caption">' + esc(t.text) + '</span>' : "") + '</div>';
        }
        if (t.kind === "image" && safeUrl(t.url)) {
          return '<div class="vision-tile image" style="background-image:url(\'' + esc(safeUrl(t.url)) + '\')">' +
            (t.text ? '<span class="vt-caption">' + esc(t.text) + '</span>' : "") + '</div>';
        }
        return '<div class="vision-tile' + (i === 0 ? " spotlight" : "") + '"><span class="vt-icon">' + esc(t.icon || "✨") + '</span>' +
          '<span class="vt-text">' + esc(t.text || "") + '</span></div>';
      }).join("") + '</div>';
  }

  var LEVEL_TITLES = ["Rookie", "Creator", "Storyteller", "Filmmaker", "Director", "Auteur", "Visionary", "Festival Regular", "Award Winner", "Oscar Contender"];

  function playerStats() {
    var s = Store.get();
    var published = Object.keys(s.challengeDays).filter(function (k) { return s.challengeDays[k].status === "published"; }).length;
    var msDone = s.milestones.filter(function (m) { return m.done; }).length;
    var films = (s.films || []).length;
    var scripts = (s.films || []).filter(function (f) { return f.script && f.script.length > 200; }).length;
    var subs = Object.keys(s.festivalPlans).filter(function (k) {
      return ["submitted", "accepted", "won"].indexOf(s.festivalPlans[k].status) !== -1;
    }).length;
    var wins = Object.keys(s.festivalPlans).filter(function (k) { return s.festivalPlans[k].status === "won"; }).length;
    var xp = published * 15 + msDone * 40 + films * 20 + scripts * 30 + subs * 60 + wins * 300 + (s.meetings || []).length * 10;
    var level = 1, need = 100, base = 0;
    while (xp >= base + need) { base += need; level++; need = Math.round(need * 1.35); }
    return {
      xp: xp, level: level,
      title: LEVEL_TITLES[Math.min(level - 1, LEVEL_TITLES.length - 1)],
      progress: ((xp - base) / need) * 100,
      toNext: base + need - xp
    };
  }

  function playerCardHTML() {
    var p = playerStats();
    // dopamine: celebrate level-ups once per level (persisted across sessions)
    try {
      var seen = parseInt(localStorage.getItem("wto-last-level") || "0", 10);
      if (p.level > seen) {
        localStorage.setItem("wto-last-level", String(p.level));
        if (seen > 0) setTimeout(function () { confetti({ count: 130 }); toast("🏆 LEVEL UP — " + p.title + "!"); }, 400);
      }
    } catch (e) {}
    return '<div class="player-card">' +
      '<div class="pc-level"><span class="pc-lvl-label">LVL</span><span class="pc-lvl-num">' + p.level + '</span></div>' +
      '<div class="pc-body">' +
      '<div class="pc-title">' + esc(p.title) + '</div>' +
      '<div class="progress gold" style="height:7px"><div style="width:' + Math.min(100, p.progress).toFixed(1) + '%"></div></div>' +
      '<div class="pc-xp">' + fmtNum(p.xp) + ' XP · ' + fmtNum(p.toNext) + ' to next level</div>' +
      '</div></div>';
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
    var today = todayISO();
    var ig = latestFollowers("instagram");
    var yt = latestFollowers("youtube");
    var proj = growthProjection();
    var goal = s.settings.followerGoal;
    var igCount = ig ? ig.count : 0;
    var igPct = Math.min(100, (igCount / goal) * 100);

    // journey ring: how far along the road from the journey start to the ceremony
    var journeyStart = s.settings.challengeStart;
    var journeyTotal = Math.max(daysBetween(journeyStart, s.settings.oscarCeremonyDate), 1);
    var journeyDone = Math.max(0, Math.min(daysBetween(journeyStart, today), journeyTotal));
    var daysLeft = Math.max(0, daysBetween(today, s.settings.oscarCeremonyDate));

    // films ring: how much of the slate has moved beyond the idea stage
    var filmsTotal = s.films.length;
    var filmsMoving = s.films.filter(function (f) { return f.status !== "idea"; }).length;
    var filmsWithScript = s.films.filter(function (f) { return (f.script || "").length > 80; }).length;
    var filmsPct = filmsTotal ? (filmsMoving / filmsTotal) * 100 : 0;

    var igPoints = platformSeries("instagram")
      .map(function (f) { return { x: parseISO(f.date).getTime(), y: f.count }; });

    var deadlines = nextDeadlines(4);
    // client work due soon (Säntis etc.) belongs on the dashboard too — the company lives here
    var clientDue = s.projects.filter(function (p) {
      return p.type === "client" && p.targetDate && p.targetDate >= today &&
        p.status !== "published" && p.status !== "archived";
    }).sort(function (a, b) { return a.targetDate < b.targetDate ? -1 : 1; }).slice(0, 2);
    var milestones = s.milestones.slice().sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      return (a.date || "9999") < (b.date || "9999") ? -1 : 1;
    });
    var hour = new Date().getHours();
    var greeting = hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    root.innerHTML =
      '<div class="hero-head">' +
        '<div><div class="hero-date">' + new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) + '</div>' +
        '<h1 class="hero-greeting">' + greeting + ', ' + esc(s.settings.userName) + '.</h1>' +
        '<p class="hero-sub">💭 ' + esc(principleOfDay() || "Every day one film closer.") + '</p></div>' +
        playerCardHTML() +
      '</div>' +

      '<div class="score-row">' +
        '<div class="score-card tint-gold clickable" onclick="location.hash=\'#/settings\'">' +
          ringGauge((journeyDone / journeyTotal) * 100, { color: "#FFFFFF", value: fmtCompact(daysLeft), sub: "DAYS TO OSCARS" }) +
          '<div class="score-name">🏆 The Journey</div>' +
          '<div class="score-hint">' + esc(s.settings.oscarCeremonyLabel) + '</div>' +
        '</div>' +
        '<div class="score-card tint-teal clickable" id="score-followers">' +
          ringGauge(igPct, { color: "#FFFFFF", value: fmtCompact(igCount), sub: "OF " + fmtCompact(goal).toUpperCase() }) +
          '<div class="score-name">📈 Followers</div>' +
          '<div class="score-hint">' +
          (proj && proj.eta
            ? "+" + fmtNum(Math.round(proj.perDay)) + "/day · 1M ~" + fmtDateShort(proj.eta)
            : ig ? "updated " + fmtDateShort(ig.date) : "tap to add your first data point") +
          '</div>' +
        '</div>' +
        '<div class="score-card tint-red clickable" onclick="location.hash=\'#/films\'">' +
          ringGauge(filmsPct, { color: "#FFFFFF", value: String(filmsTotal), sub: "FILM DOSSIERS" }) +
          '<div class="score-name">🎬 Films</div>' +
          '<div class="score-hint">' + filmsMoving + ' in development · ' + filmsWithScript + ' with script</div>' +
        '</div>' +
      '</div>' +

      actionRowHTML() +

      '<div class="grid cols-2 mt">' +
        '<div class="card soft tint-teal chart-box">' +
          '<div class="row between"><span class="stat-label">Instagram growth</span>' +
          '<button class="primary small" id="add-follower">+ Add</button></div>' +
          (igPoints.length >= 2
            ? '<div class="mt">' + sparkline(igPoints, { goal: goal }) + '</div>'
            : '<div class="chart-empty">📈<br>Add a follower count once a week<br>and your growth curve appears here.</div>') +
          '<div class="stat-hint mt">YouTube: ' + fmtCompact(yt ? yt.count : 0) + (yt ? ' · updated ' + fmtDateShort(yt.date) : " · no data yet") + '</div>' +
        '</div>' +

        '<div class="card soft tint-blue">' +
          '<div class="row between"><span class="stat-label">Up next</span>' +
          '<a href="#/festivals" class="muted" style="font-size:12px">all festivals →</a></div>' +
          '<div class="mt">' +
          deadlines.slice(0, 3).map(function (r) {
            var days = daysBetween(today, r.deadline.date);
            return '<div class="list-row clickable" onclick="location.hash=\'#/festivals\'">' +
              '<div class="dl-days ' + (days <= 21 ? "hot" : "") + '"><span>' + days + '</span><small>days</small></div>' +
              '<div style="flex:1;min-width:0"><div class="lr-title">' + esc(r.festival.name) + '</div>' +
              '<div class="lr-sub">' + fmtDate(r.deadline.date) + ' · ' + esc(r.deadline.type) +
              (r.deadline.estimated ? " · est." : "") +
              (r.festival.oscarQualifying ? ' · <span style="color:#FFD98A">Oscar-qualifying</span>' : "") + '</div></div>' +
            '</div>';
          }).join("") +
          clientDue.map(function (p) {
            var days = daysBetween(today, p.targetDate);
            return '<div class="list-row clickable" onclick="location.hash=\'#/projects\'">' +
              '<div class="dl-days ' + (days <= 7 ? "hot" : "") + '"><span>' + days + '</span><small>days</small></div>' +
              '<div style="flex:1;min-width:0"><div class="lr-title">' + esc(p.title) + '</div>' +
              '<div class="lr-sub">' + fmtDate(p.targetDate) + ' · 🤝 client work · ' + esc(p.status) + '</div></div>' +
            '</div>';
          }).join("") +
          milestones.filter(function (m) { return !m.done; }).slice(0, 3).map(function (m) {
            return '<div class="list-row">' +
              '<div class="dl-days gold-chip"><span>' + (m.track === "A" ? "A" : "B") + '</span><small>track</small></div>' +
              '<div style="flex:1;min-width:0"><div class="lr-title">' + esc(m.title) + '</div>' +
              '<div class="lr-sub">' + (m.date ? fmtDate(m.date) : "no date") + ' · milestone</div></div>' +
              '<input type="checkbox" data-ms="' + esc(m.id) + '" title="Mark done">' +
            '</div>';
          }).join("") +
          '</div>' +
        '</div>' +
      '</div>' +

      socialOutputHTML() +

      visionStripHTML() +

      '<details class="strategy-fold"><summary>🚩 All milestones</summary>' +
      '<div class="card soft">' +
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
      '</div></details>' +

      '<details class="strategy-fold"><summary>🧭 Strategy briefing — from your master plan</summary>' + strategyHTML() + '</details>';

    $("#add-follower").onclick = addFollowerModal;
    $("#score-followers").onclick = addFollowerModal;
    $("#add-milestone").onclick = addMilestoneModal;
    $$("input[data-ms]", root).forEach(function (cb) {
      cb.onchange = function () {
        var m = Store.get().milestones.find(function (x) { return x.id === cb.getAttribute("data-ms"); });
        if (m) {
          m.done = cb.checked; m.updatedAt = new Date().toISOString(); Store.save();
          if (cb.checked) { confetti({ count: 60 }); toast("🚩 Milestone done: " + m.title); }
          App.render();
        }
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

    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  return { render: render };
})();
