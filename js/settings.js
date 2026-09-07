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
    var keys = PhoneKeys.get();
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


      '<h2 class="section-title">Brain-Telefon</h2>' +
      '<div class="card" style="max-width:560px">' +
        '<p class="muted" style="font-size:13px;margin-bottom:12px">Optional keys for the <strong>Pro</strong> tier (Whisper understands Swiss German far better; ElevenLabs sounds natural). Stored only in this browser — never in exports, never in the repo. Without keys the phone runs on the <strong>Basis</strong> tier (Web Speech + system voice).</p>' +
        '<label class="field"><span>OpenAI API key (Whisper STT)</span><input type="password" id="k-openai" value="' + esc(keys.openai) + '" placeholder="sk-…" autocomplete="off"></label>' +
        '<label class="field"><span>ElevenLabs API key (TTS)</span><input type="password" id="k-eleven" value="' + esc(keys.eleven) + '" placeholder="xi-…" autocomplete="off"></label>' +
        '<label class="field"><span>ElevenLabs voice ID (optional)</span><input id="k-eleven-voice" value="' + esc(keys.elevenVoice) + '" placeholder="default: Rachel (multilingual)"></label>' +
        '<details class="strategy-fold" style="margin-top:4px"><summary>Local use without the Claude artifact</summary>' +
        '<p class="muted" style="font-size:12.5px;margin:6px 0 10px">Opened as a plain file, the phone cannot use the artifact runtime. An Anthropic key lets it call the Messages API directly (with the Dropbox MCP connector).</p>' +
        '<label class="field"><span>Anthropic API key</span><input type="password" id="k-anthropic" value="' + esc(keys.anthropic) + '" placeholder="sk-ant-…" autocomplete="off"></label>' +
        '<label class="field"><span>Dropbox MCP authorization token (optional)</span><input type="password" id="k-dropbox" value="' + esc(keys.dropboxToken) + '" autocomplete="off"></label>' +
        '</details>' +
        '<div class="row mt"><button class="primary" id="k-save">Save keys</button><button class="ghost danger" id="k-clear">Remove all keys</button>' +
        '<span class="muted" style="font-size:12px" id="k-status">' + (keys.openai || keys.eleven ? 'Pro tier configured' : 'Basis tier (no keys)') + '</span></div>' +
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
      st.updatedAt = new Date().toISOString();
      Store.save(); toast("Settings saved"); App.render();
    };
    $("#k-save").onclick = function () {
      PhoneKeys.set({ openai: $("#k-openai").value, eleven: $("#k-eleven").value, elevenVoice: $("#k-eleven-voice").value,
        anthropic: $("#k-anthropic").value, dropboxToken: $("#k-dropbox").value });
      toast("Keys saved in this browser only"); App.render();
    };
    $("#k-clear").onclick = function () { PhoneKeys.clear(); toast("Keys removed"); App.render(); };
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
