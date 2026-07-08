/* ============ knowledge.js — master knowledge base (from ChatGPT export PDF) ============ */
"use strict";

var KnowledgeView = (function () {

  function render(root) {
    var kb = window.SEED && window.SEED.knowledge;
    if (!kb || !kb.sections) {
      root.innerHTML = '<h1 class="view-title">Knowledge</h1><div class="empty-note">No knowledge base in seed data.</div>';
      return;
    }
    var q = (render._q || "").toLowerCase();

    var sections = kb.sections.map(function (sec) {
      var entries = sec.entries.filter(function (e) {
        return !q || e.toLowerCase().indexOf(q) !== -1 || sec.title.toLowerCase().indexOf(q) !== -1;
      });
      return { sec: sec, entries: entries };
    }).filter(function (x) { return x.entries.length > 0; });

    root.innerHTML =
      '<h1 class="view-title">Knowledge</h1>' +
      '<p class="view-sub">Your master knowledge base — ' + esc(kb.source || "") + '. Searchable; German kept verbatim.</p>' +
      '<div class="filter-bar"><input id="kb-q" placeholder="Search the knowledge base..." value="' + esc(render._q || "") + '" style="flex:1;min-width:200px"></div>' +
      (sections.length === 0 ? '<div class="empty-note">Nothing matches.</div>' : "") +
      '<div class="grid cols-2">' +
      sections.map(function (x) {
        return '<div class="card">' +
          '<h2 class="section-title" style="margin-top:0">' + x.sec.icon + ' ' + esc(x.sec.title) +
          ' <span class="badge gray">' + x.entries.length + '</span></h2>' +
          '<ul style="padding-left:18px;font-size:13.5px;line-height:1.7;display:flex;flex-direction:column;gap:8px">' +
          x.entries.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join("") +
          '</ul></div>';
      }).join("") +
      '</div>';

    $("#kb-q").oninput = function () {
      render._q = this.value;
      var caret = this.selectionStart;
      App.render();
      var n = $("#kb-q");
      if (n) { n.focus(); n.setSelectionRange(caret, caret); }
    };
  }

  return { render: render };
})();
