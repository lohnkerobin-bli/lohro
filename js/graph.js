/* ============ graph.js — linked Brain notes, edges strengthen on use ============ */
"use strict";

var Graph = (function () {

  // German + English stopwords — keep short, only what actually pollutes matches
  var STOP = {};
  ("aber alle allem allen alles also auch auf aus bei beim bin bis bist damit dann das dass dein deine dem den denn der des dich die dies diese diesem diesen dieser dieses dir doch dort durch eine einem einen einer eines einfach er es etwas für ganz gegen haben hast hat hier ich ihm ihn ihr ihre immer ist jede jedem jeden jeder jedes kann kein keine machen mehr mein meine mich mit muss nach nicht noch nur oder ohne schon sein seine sich sie sind soll über und uns unser viel vom von vor war waren welche wenn werden wieder wird wir zum zur " +
   "about after again all and any are because been before being both but can could does doing down each few from had has have having her here hers him his how into its itself just more most not now off once only other our ours out over own same she should some such than that the their them then there these they this those through very was were what when where which while who whom why will with your yours")
    .split(/\s+/).forEach(function (w) { if (w) STOP[w] = true; });

  function tokens(text) {
    var set = {};
    String(text || "").toLowerCase()
      .split(/[^a-zäöüéèêàâç0-9]+/i)
      .forEach(function (w) {
        if (w.length >= 4 && !STOP[w]) set[w] = true;
      });
    return set;
  }

  // unified corpus: everything in the Brain that can be linked
  function nodes() {
    var s = Store.get();
    var out = [];
    s.ideas.forEach(function (i) {
      out.push({ type: "idea", icon: "💡", id: i.id, title: i.title,
        text: i.title + " " + (i.notes || "") + " " + (i.categories || []).join(" ") });
    });
    s.films.forEach(function (f) {
      out.push({ type: "film", icon: "🎬", id: f.id, title: f.title,
        text: f.title + " " + (f.logline || "") + " " + (f.themes || "") + " " + (f.genre || "") + " " + (f.notes || "") });
    });
    s.brandNotes.forEach(function (n) {
      out.push({ type: "brand", icon: "🎨", id: n.id, title: n.title,
        text: n.title + " " + (n.content || "") });
    });
    s.meetings.forEach(function (m) {
      out.push({ type: "meeting", icon: "🗓", id: m.id, title: m.title,
        text: m.title + " " + (m.decisions || "") + " " + (m.actions || "") });
    });
    return out;
  }

  function edgeKey(a, b) { return a < b ? a + "|" + b : b + "|" + a; }

  function weight(a, b) {
    var lg = Store.get().linkGraph || {};
    var e = lg[edgeKey(a, b)];
    return e ? (e.weight || 0) : 0;
  }

  // called every time a linked note is opened from another note —
  // this is what makes connections grow stronger over time
  function touch(a, b) {
    var s = Store.get();
    if (!s.linkGraph) s.linkGraph = {};
    var k = edgeKey(a, b);
    var e = s.linkGraph[k] || { weight: 0 };
    e.weight = (e.weight || 0) + 1;
    e.updatedAt = new Date().toISOString();
    s.linkGraph[k] = e;
    Store.save();
  }

  // ranked related notes: keyword overlap + 2x the learned co-access weight
  function related(id, max) {
    var all = nodes();
    var me = null;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) { me = all[i]; break; }
    if (!me) return [];
    var mine = tokens(me.text);
    var scored = [];
    all.forEach(function (n) {
      if (n.id === id) return;
      var overlap = 0;
      var theirs = tokens(n.text);
      Object.keys(theirs).forEach(function (w) { if (mine[w]) overlap++; });
      var w = weight(id, n.id);
      var score = overlap + w * 2;
      if (score > 0) scored.push({ node: n, score: score, weight: w });
    });
    scored.sort(function (a, b) {
      return b.score - a.score || (a.node.title < b.node.title ? -1 : 1);
    });
    return scored.slice(0, max || 6);
  }

  function navTo(hash) {
    if (location.hash === hash) App.render();
    else location.hash = hash;
  }

  function open(node) {
    closeModal();
    if (node.type === "film") { FilmsView._openId = node.id; navTo("#/films"); }
    else if (node.type === "idea") { IdeasView._pendingOpen = node.id; navTo("#/ideas"); }
    else if (node.type === "brand") { BrainView._pendingTab = "brand"; BrainView._pendingOpen = node.id; navTo("#/brain"); }
    else if (node.type === "meeting") { BrainView._pendingTab = "meetings"; BrainView._pendingOpen = node.id; navTo("#/brain"); }
  }

  // "Linked in Brain" chip row for an item's modal / detail page
  function relatedHTML(id) {
    var rel = related(id, 6);
    if (!rel.length) return "";
    return '<div class="related-box"><span class="related-label">🧠 Linked in Brain</span>' +
      '<span class="related-chips">' +
      rel.map(function (r) {
        var lvl = Math.min(3, r.weight);
        return '<button type="button" class="related-chip rw' + lvl + '" data-rel-from="' + esc(id) + '" data-rel-to="' + esc(r.node.id) + '">' +
          r.node.icon + ' ' + esc(r.node.title.length > 42 ? r.node.title.slice(0, 40) + "…" : r.node.title) +
          (r.weight > 0 ? ' <span class="rel-w">×' + r.weight + '</span>' : "") +
        '</button>';
      }).join("") + '</span></div>';
  }

  function bindRelated(root) {
    $$("[data-rel-to]", root || document).forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation();
        var from = b.getAttribute("data-rel-from");
        var to = b.getAttribute("data-rel-to");
        touch(from, to); // opening a link strengthens it
        var all = nodes();
        for (var i = 0; i < all.length; i++) {
          if (all[i].id === to) { open(all[i]); return; }
        }
      };
    });
  }

  return { related: related, relatedHTML: relatedHTML, bindRelated: bindRelated, touch: touch, nodes: nodes };
})();
