/* ============ brain.js — Brand Core, Knowledge, Meetings & Weekly Reports ============ */
"use strict";

var BrainView = (function () {

  var TABS = [
    { key: "brand", label: "🎨 Brand Core" },
    { key: "knowledge", label: "📚 Knowledge" },
    { key: "graph", label: "🕸 Graph" },
    { key: "vision", label: "🌟 Vision" },
    { key: "meetings", label: "🗓 Meetings & Reports" }
  ];

  var BRAND_SECTIONS = [
    { key: "core", label: "Brand Core", icon: "🎯", tint: "tint-gold" },
    { key: "values", label: "Values & Tone", icon: "🧭", tint: "tint-cream" },
    { key: "dos", label: "Do's", icon: "✅", tint: "tint-teal" },
    { key: "donts", label: "Don'ts", icon: "❌", tint: "tint-red" },
    { key: "cta", label: "Call-to-Action Strategy", icon: "📣", tint: "tint-blue" },
    { key: "assets", label: "Brand Assets", icon: "🗂", tint: "tint-gold" },
    { key: "team", label: "Team Playbook", icon: "👥", tint: "tint-blue" }
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
      (note ? Graph.relatedHTML(note.id) : "") +
      '<div class="modal-actions">' +
      (note ? '<button class="ghost danger" id="b-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="b-save">Save</button></div>';
    openModal(html);
    Graph.bindRelated();
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
            return '<div class="card soft ' + sec.tint + ' clickable" data-brand="' + esc(n.id) + '">' +
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

  /* ---------- Graph (visual brain map, zero credits — computed locally) ---------- */

  var TYPE_COLOR = { idea: "#E3A72F", film: "#B04A93", brand: "#E8871E", meeting: "#457B9D", location: "#2FA39A" };

  function graphHTML() {
    return '<div class="row between mb" style="flex-wrap:wrap;gap:8px">' +
      '<span class="muted" style="font-size:13px">Your second brain as a map. Lines = shared themes; <strong>thick amber lines</strong> = links you actually use (they grow stronger every time you open one note from another). Click a dot to open it.</span></div>' +
      '<div class="card soft" style="padding:10px">' +
      '<canvas id="brain-graph" style="width:100%;height:560px;display:block;border-radius:12px;cursor:pointer"></canvas>' +
      '<div class="row mt" style="gap:14px;flex-wrap:wrap;font-size:11.5px">' +
      Object.keys(TYPE_COLOR).map(function (t) {
        return '<span><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + TYPE_COLOR[t] + ';margin-right:5px"></span>' + t + '</span>';
      }).join("") +
      '<span class="muted">· amber line thickness = link strength</span></div></div>';
  }

  function bindGraph() {
    var cv = $("#brain-graph");
    if (!cv) return;
    var W = cv.clientWidth, H = 560;
    var dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr;
    var ctx = cv.getContext("2d");
    ctx.scale(dpr, dpr);

    var nodes = Graph.nodes();
    var idx = {};
    nodes.forEach(function (n, i) { idx[n.id] = i; });

    // edges: learned links (linkGraph) + keyword edges between non-idea/idea pairs
    var edges = [];
    var seen = {};
    var lg = Store.get().linkGraph || {};
    Object.keys(lg).forEach(function (k) {
      var p = k.split("|");
      if (idx[p[0]] === undefined || idx[p[1]] === undefined) return;
      edges.push({ a: idx[p[0]], b: idx[p[1]], w: lg[k].weight || 1, learned: true });
      seen[k] = true;
    });
    // keyword edges: connect every non-idea node to its top related notes (cheap: ~30 nodes × related)
    nodes.forEach(function (n, i) {
      if (n.type === "idea") return; // 100+ ideas each way would melt the map
      Graph.related(n.id, 4).forEach(function (r) {
        var j = idx[r.node.id];
        if (j === undefined) return;
        var k = n.id < r.node.id ? n.id + "|" + r.node.id : r.node.id + "|" + n.id;
        if (seen[k]) return;
        seen[k] = true;
        edges.push({ a: i, b: j, w: 0, learned: false });
      });
    });

    // keep the map readable: only nodes with at least one edge, plus all non-ideas
    var deg = nodes.map(function () { return 0; });
    edges.forEach(function (e) { deg[e.a]++; deg[e.b]++; });
    var keep = nodes.map(function (n, i) { return deg[i] > 0 || n.type !== "idea"; });

    // simple force layout
    var pos = nodes.map(function (n, i) {
      var angle = (i / nodes.length) * Math.PI * 2;
      var r = n.type === "idea" ? 230 : 130;
      return { x: W / 2 + Math.cos(angle) * r, y: H / 2 + Math.sin(angle) * r, vx: 0, vy: 0 };
    });
    for (var it = 0; it < 160; it++) {
      for (var i = 0; i < nodes.length; i++) {
        if (!keep[i]) continue;
        var fx = 0, fy = 0;
        for (var j = 0; j < nodes.length; j++) {
          if (i === j || !keep[j]) continue;
          var dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y;
          var d2 = dx * dx + dy * dy + 40;
          var rep = 1400 / d2;
          fx += dx * rep; fy += dy * rep;
        }
        fx += (W / 2 - pos[i].x) * 0.012;
        fy += (H / 2 - pos[i].y) * 0.012;
        pos[i].vx = (pos[i].vx + fx) * 0.5;
        pos[i].vy = (pos[i].vy + fy) * 0.5;
      }
      edges.forEach(function (e) {
        var dx = pos[e.b].x - pos[e.a].x, dy = pos[e.b].y - pos[e.a].y;
        var d = Math.sqrt(dx * dx + dy * dy) || 1;
        var target = e.learned ? 90 : 140;
        var pull = (d - target) * 0.004 * (1 + Math.min(3, e.w) * 0.6);
        pos[e.a].vx += dx / d * pull * d; pos[e.a].vy += dy / d * pull * d;
        pos[e.b].vx -= dx / d * pull * d; pos[e.b].vy -= dy / d * pull * d;
      });
      for (var m = 0; m < nodes.length; m++) {
        if (!keep[m]) continue;
        pos[m].x = Math.max(20, Math.min(W - 20, pos[m].x + pos[m].vx * 0.05));
        pos[m].y = Math.max(20, Math.min(H - 20, pos[m].y + pos[m].vy * 0.05));
      }
    }

    function draw(hover) {
      ctx.clearRect(0, 0, W, H);
      edges.forEach(function (e) {
        if (!keep[e.a] || !keep[e.b]) return;
        ctx.beginPath();
        ctx.moveTo(pos[e.a].x, pos[e.a].y);
        ctx.lineTo(pos[e.b].x, pos[e.b].y);
        if (e.learned) {
          ctx.strokeStyle = "rgba(232,135,30," + Math.min(0.95, 0.45 + e.w * 0.15) + ")";
          ctx.lineWidth = Math.min(5, 1.2 + e.w * 0.9);
        } else {
          ctx.strokeStyle = "rgba(255,255,255,.10)";
          ctx.lineWidth = 1;
        }
        ctx.stroke();
      });
      nodes.forEach(function (n, i) {
        if (!keep[i]) return;
        var r = 4 + Math.min(6, deg[i]) + (n.type !== "idea" ? 2 : 0);
        ctx.beginPath();
        ctx.arc(pos[i].x, pos[i].y, r, 0, Math.PI * 2);
        ctx.fillStyle = TYPE_COLOR[n.type] || "#999";
        ctx.globalAlpha = hover === null || hover === i ? 1 : 0.55;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (n.type !== "idea" || deg[i] >= 3 || hover === i) {
          ctx.font = (hover === i ? "700 12.5px" : "600 10.5px") + " -apple-system, sans-serif";
          ctx.fillStyle = hover === i ? "#FFFFFF" : "rgba(255,255,255,.72)";
          var label = n.title.length > 26 ? n.title.slice(0, 24) + "…" : n.title;
          ctx.fillText(label, pos[i].x + r + 4, pos[i].y + 3.5);
        }
      });
    }
    draw(null);

    function hit(ev) {
      var rect = cv.getBoundingClientRect();
      var x = ev.clientX - rect.left, y = ev.clientY - rect.top;
      var best = null, bestD = 18 * 18;
      nodes.forEach(function (n, i) {
        if (!keep[i]) return;
        var dx = pos[i].x - x, dy = pos[i].y - y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      });
      return best;
    }
    cv.onmousemove = function (ev) { draw(hit(ev)); };
    cv.onmouseleave = function () { draw(null); };
    cv.onclick = function (ev) {
      var i = hit(ev);
      if (i === null) return;
      var n = nodes[i];
      if (n.type === "film") { FilmsView._openId = n.id; location.hash = "#/films"; }
      else if (n.type === "idea") { IdeasView._pendingOpen = n.id; location.hash = "#/ideas"; }
      else if (n.type === "location") { LocationsView._pendingOpen = n.id; location.hash = "#/locations"; }
      else if (n.type === "brand") { render._tab = "brand"; brandNoteModal(n.id); }
      else if (n.type === "meeting") { render._tab = "meetings"; meetingModal(n.id); }
    };
  }

  /* ---------- Vision Boards ---------- */

  function addTileModal(boardId) {
    var s = Store.get();
    var board = s.visionBoards.find(function (b) { return b.id === boardId; });
    if (!board) return;
    openModal(
      '<h3>Add vision tile — ' + esc(board.title) + '</h3>' +
      '<label class="field"><span>Icon (emoji)</span><input id="v-icon" placeholder="🏆" maxlength="4"></label>' +
      '<label class="field"><span>Text (the vision, one line)</span><input id="v-text" placeholder="e.g. Standing on the Locarno stage"></label>' +
      '<label class="field"><span>OR image link (https)</span><input id="v-url" placeholder="https://... (Dropbox shared link, poster, still)"></label>' +
      '<div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="v-save">Add</button></div>');
    $("#v-save").onclick = function () {
      var url = $("#v-url").value.trim();
      var text = $("#v-text").value.trim();
      if (!url && !text) { toast("Add a text or an image link", true); return; }
      if (url && !safeUrl(url)) { toast("Only https:// links", true); return; }
      board.tiles.push(url
        ? { id: uid("vt"), kind: "image", url: url, text: text }
        : { id: uid("vt"), kind: "text", icon: $("#v-icon").value.trim() || "✨", text: text });
      board.updatedAt = new Date().toISOString();
      Store.save(); closeModal(); toast("Tile added"); App.render();
    };
  }

  function visionTileHTML(t, editable) {
    if (t.kind === "asset" && assetUrl(t.assetKey)) {
      return '<div class="vision-tile image" style="background-image:url(' + assetUrl(t.assetKey) + ')">' +
        (t.text ? '<span class="vt-caption">' + esc(t.text) + '</span>' : "") +
        (editable ? '<button class="vt-del" data-del-tile="' + esc(t.id) + '">✕</button>' : "") + '</div>';
    }
    if (t.kind === "image" && safeUrl(t.url)) {
      return '<div class="vision-tile image" style="background-image:url(\'' + esc(safeUrl(t.url)) + '\')">' +
        (t.text ? '<span class="vt-caption">' + esc(t.text) + '</span>' : "") +
        (editable ? '<button class="vt-del" data-del-tile="' + esc(t.id) + '">✕</button>' : "") + '</div>';
    }
    return '<div class="vision-tile">' +
      '<span class="vt-icon">' + esc(t.icon || "✨") + '</span>' +
      '<span class="vt-text">' + esc(t.text || "") + '</span>' +
      (editable ? '<button class="vt-del" data-del-tile="' + esc(t.id) + '">✕</button>' : "") + '</div>';
  }

  function visionHTML() {
    var s = Store.get();
    return '<div class="row between mb">' +
      '<span class="muted" style="font-size:13px">Functional, not decorative — daily orientation. The first board shows on the dashboard.</span>' +
      '<button class="primary small" id="board-new">+ New board</button></div>' +
      s.visionBoards.map(function (b) {
        return '<h2 class="section-title">🌟 ' + esc(b.title) +
          ' <button class="small ghost" data-add-tile="' + esc(b.id) + '">+ tile</button>' +
          ' <button class="small ghost danger" data-del-board="' + esc(b.id) + '">delete board</button></h2>' +
          '<div class="vision-grid mb">' + b.tiles.map(function (t) { return visionTileHTML(t, true); }).join("") +
          (b.tiles.length === 0 ? '<div class="empty-note">Empty board — add your first vision tile.</div>' : "") + '</div>';
      }).join("") +
      (s.visionBoards.length === 0 ? '<div class="empty-note">No boards yet.</div>' : "");
  }

  function bindVision(root) {
    var s = Store.get();
    var nb = $("#board-new");
    if (nb) nb.onclick = function () {
      openModal('<h3>New vision board</h3>' +
        '<label class="field"><span>Title</span><input id="nb-title" placeholder="e.g. FEATURE FILM 2029"></label>' +
        '<div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button>' +
        '<button class="primary" id="nb-save">Create</button></div>');
      $("#nb-save").onclick = function () {
        var t = $("#nb-title").value.trim();
        if (!t) { toast("Title required", true); return; }
        s.visionBoards.push({ id: uid("vb"), title: t, tiles: [], updatedAt: new Date().toISOString() });
        Store.save(); closeModal(); App.render();
      };
    };
    $$("[data-add-tile]", root).forEach(function (b) {
      b.onclick = function () { addTileModal(b.getAttribute("data-add-tile")); };
    });
    $$("[data-del-board]", root).forEach(function (b) {
      b.onclick = function () {
        var id = b.getAttribute("data-del-board");
        openModal('<h3>Delete this board?</h3><div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button><button class="primary" id="db-yes">Delete</button></div>');
        $("#db-yes").onclick = function () {
          s.visionBoards = s.visionBoards.filter(function (x) { return x.id !== id; });
          Store.save(); closeModal(); App.render();
        };
      };
    });
    $$("[data-del-tile]", root).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var tid = b.getAttribute("data-del-tile");
        s.visionBoards.forEach(function (board) {
          var before = board.tiles.length;
          board.tiles = board.tiles.filter(function (t) { return t.id !== tid; });
          if (board.tiles.length !== before) board.updatedAt = new Date().toISOString();
        });
        Store.save(); App.render();
      };
    });
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
      (m ? Graph.relatedHTML(m.id) : "") +
      '<div class="modal-actions">' +
      (m ? '<button class="ghost danger" id="m-delete">Delete</button>' : "") +
      '<button class="ghost" onclick="closeModal()">Cancel</button>' +
      '<button class="primary" id="m-save">Save</button></div>';
    openModal(html, { sticky: true });
    Graph.bindRelated();
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
    if (BrainView._pendingTab) { render._tab = BrainView._pendingTab; BrainView._pendingTab = null; }
    var tab = render._tab || "brand";
    if (BrainView._pendingOpen) {
      var poid = BrainView._pendingOpen;
      BrainView._pendingOpen = null;
      setTimeout(function () {
        if (tab === "meetings") meetingModal(poid); else brandNoteModal(poid);
      }, 0);
    }
    // generated per-tab banner stills (darkened via .view-banner overlay), fallback: lamp still
    var bannerKey = { brand: "brain-brand", knowledge: "brain-knowledge", vision: "brain-vision", meetings: "brain-meetings" }[tab];
    root.innerHTML =
      '<h1 class="view-title">Brand</h1>' +
      '<p class="view-sub">The team backend: brand core, knowledge base, meetings &amp; weekly reports. Everything exportable via Data &amp; Settings.</p>' +
      (assetUrl(bannerKey) ? viewBanner(bannerKey) : viewBanner('still-lamp')) +
      '<div class="filter-bar">' +
      TABS.map(function (t) {
        return '<button class="' + (tab === t.key ? "blue" : "ghost") + '" data-tab="' + t.key + '">' + t.label + '</button>';
      }).join("") +
      (tab !== "meetings" && tab !== "graph" ? '<input id="brain-q" placeholder="Search..." value="' + esc(render._q || "") + '" style="flex:1;min-width:160px">' : "") +
      '</div>' +
      (tab === "brand" ? brandHTML() : tab === "knowledge" ? knowledgeHTML() : tab === "graph" ? graphHTML() : tab === "vision" ? visionHTML() : meetingsHTML());

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
    if (tab === "vision") bindVision(root);
    if (tab === "graph") bindGraph();
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
