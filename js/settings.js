/* ============ settings.js — data export/import (Dropbox workflow) + settings ============ */
"use strict";

var SettingsView = (function () {

  function doExport() {
    var snap = Store.exportSnapshot();
    var name = "way-to-oscar-data-" + todayISO() + ".json";
    downloadJSON(snap, name);
    toast("Exported " + name + " — drop it in the team Dropbox");
  }

  function doImport(mode) {
    pickJSONFile(function (err, obj, filename) {
      if (err) { toast("Could not read file: " + err.message, true); return; }
      try {
        if (mode === "merge") Store.importMerge(obj);
        else Store.importReplace(obj);
        toast((mode === "merge" ? "Merged " : "Imported ") + filename);
        App.render();
      } catch (e) {
        toast(e.message, true);
      }
    });
  }

  function render(root) {
    var s = Store.get();
    var stats = {
      ideas: s.ideas.length,
      projects: s.projects.length,
      days: Object.keys(s.challengeDays).length,
      followers: s.followers.length,
      milestones: s.milestones.length,
      plans: Object.keys(s.festivalPlans).length
    };

    root.innerHTML =
      '<h1 class="view-title">Data &amp; Settings</h1>' +
      '<p class="view-sub">Your data lives in this browser (autosaved). Use Export/Import to share via the team Dropbox with Simon &amp; Jasmin.</p>' +

      '<h2 class="section-title">Team Sharing (Dropbox workflow)</h2>' +
      '<div class="grid cols-2">' +
        '<div class="card accent-teal">' +
          '<span class="stat-label">📤 Export</span>' +
          '<p class="mt" style="font-size:13.5px">Download a full snapshot (<span class="mono">way-to-oscar-data-YYYY-MM-DD.json</span>) and put it in the team Dropbox folder.</p>' +
          '<div class="mt"><button class="teal" id="btn-export">Export data file</button></div>' +
        '</div>' +
        '<div class="card accent-blue">' +
          '<span class="stat-label">📥 Import</span>' +
          '<p class="mt" style="font-size:13.5px"><strong>Replace</strong> takes the file as the new truth. <strong>Merge</strong> combines the file with your local data (newer edit wins per item) — use this when two people worked in parallel.</p>' +
          '<div class="mt row"><button class="blue" id="btn-import-replace">Import (replace)</button>' +
          '<button id="btn-import-merge">Import (merge)</button></div>' +
        '</div>' +
      '</div>' +

      '<div class="card mt">' +
        '<span class="stat-label">Current data</span>' +
        '<div class="row mt" style="gap:18px;font-size:13px">' +
        '<span>💡 ' + stats.ideas + ' ideas</span><span>🎬 ' + stats.projects + ' projects</span>' +
        '<span>📆 ' + stats.days + ' challenge days</span><span>📈 ' + stats.followers + ' follower points</span>' +
        '<span>🚩 ' + stats.milestones + ' milestones</span><span>🎪 ' + stats.plans + ' festival plans</span></div>' +
        '<div class="muted mt" style="font-size:12px">Last change: ' + esc(s.meta.updatedAt || "—") + '</div>' +
      '</div>' +

      '<h2 class="section-title">Settings</h2>' +
      '<div class="card" style="max-width:560px">' +
        '<label class="field"><span>Your name (stamped on exports)</span><input id="s-name" value="' + esc(s.settings.userName) + '"></label>' +
        '<label class="field"><span>Oscar ceremony target date</span><input type="date" id="s-oscar" value="' + esc(s.settings.oscarCeremonyDate) + '"></label>' +
        '<label class="field"><span>Countdown label</span><input id="s-oscar-label" value="' + esc(s.settings.oscarCeremonyLabel) + '"></label>' +
        '<label class="field"><span>Challenge start date</span><input type="date" id="s-challenge" value="' + esc(s.settings.challengeStart) + '"></label>' +
        '<div class="row">' +
        '<label class="field" style="flex:1"><span>Follower goal</span><input type="number" id="s-goal" value="' + esc(s.settings.followerGoal) + '"></label>' +
        '<label class="field" style="flex:1"><span>Goal date</span><input type="date" id="s-goal-date" value="' + esc(s.settings.followerGoalDate) + '"></label></div>' +
        '<button class="primary" id="s-save">Save settings</button>' +
      '</div>' +

      '<h2 class="section-title">Danger Zone</h2>' +
      '<div class="card" style="max-width:560px">' +
        '<p class="muted" style="font-size:13px">Reset wipes all local edits and restores the original Notion/festival seed data. Export first if unsure.</p>' +
        '<div class="mt"><button class="danger" id="s-reset">Reset to seed data</button></div>' +
      '</div>';

    $("#btn-export").onclick = doExport;
    $("#btn-import-replace").onclick = function () { doImport("replace"); };
    $("#btn-import-merge").onclick = function () { doImport("merge"); };
    $("#s-save").onclick = function () {
      var st = Store.get().settings;
      st.userName = $("#s-name").value.trim() || "Robin";
      st.oscarCeremonyDate = $("#s-oscar").value || st.oscarCeremonyDate;
      st.oscarCeremonyLabel = $("#s-oscar-label").value.trim();
      st.challengeStart = $("#s-challenge").value || st.challengeStart;
      st.followerGoal = parseInt($("#s-goal").value, 10) || 1000000;
      st.followerGoalDate = $("#s-goal-date").value || st.followerGoalDate;
      Store.save(); toast("Settings saved"); App.render();
    };
    $("#s-reset").onclick = function () {
      openModal(
        '<h3>Reset all data?</h3><p style="font-size:14px">This deletes every local edit (challenge log, followers, plans...) and restores the seed. This cannot be undone.</p>' +
        '<div class="modal-actions"><button class="ghost" onclick="closeModal()">Cancel</button>' +
        '<button class="primary" id="confirm-reset">Yes, reset everything</button></div>');
      $("#confirm-reset").onclick = function () {
        Store.resetToSeed(); closeModal(); toast("Reset to seed data"); App.render();
      };
    };
  }

  return { render: render };
})();
