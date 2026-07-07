/* ============ store.js — state, persistence, export/import ============ */
"use strict";

var Store = (function () {
  var LS_KEY = "way-to-oscar-data-v1";
  var state = null;
  var listeners = [];

  function defaults() {
    return {
      meta: {
        app: "way-to-oscar-command-center",
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        seedVersion: (window.SEED && window.SEED.version) || 0
      },
      settings: {
        userName: "Robin",
        oscarCeremonyDate: "2028-03-05",
        oscarCeremonyLabel: "Academy Awards 2028 (target, date TBC)",
        challengeStart: "2026-07-15",
        followerGoal: 1000000,
        followerGoalDate: "2026-12-31"
      },
      followers: [],       // {id, date, platform, count, updatedAt}
      milestones: [],      // {id, title, date, done, track, updatedAt}
      challengeDays: {},   // "YYYY-MM-DD": {date, title, idea, status, link, learnings, updatedAt}
      ideas: [],           // {id, title, categories[], status, energy, notes, source, createdAt, updatedAt}
      projects: [],        // {id, title, type, status, owner, notes, targetDate, link, updatedAt}
      festivalPlans: {}    // festivalId: {status, filmTitle, deadlineType, notes, updatedAt}
    };
  }

  function defaultMilestones() {
    var now = new Date().toISOString();
    return [
      { id: "ms-challenge-start", title: "Start Daily Short Film Challenge", date: "2026-07-15", done: false, track: "A", updatedAt: now },
      { id: "ms-ig-100k", title: "Instagram 100K followers", date: "2026-09-30", done: false, track: "B", updatedAt: now },
      { id: "ms-ig-500k", title: "Instagram 500K followers", date: "2026-11-15", done: false, track: "B", updatedAt: now },
      { id: "ms-ig-1m", title: "Instagram 1M followers", date: "2026-12-31", done: false, track: "B", updatedAt: now },
      { id: "ms-best-short", title: "Pick 3 best challenge shorts for festival cut", date: "2026-10-31", done: false, track: "A", updatedAt: now },
      { id: "ms-festival-short", title: "Produce festival-grade short film", date: "2027-01-31", done: false, track: "A", updatedAt: now },
      { id: "ms-first-submissions", title: "First wave of festival submissions", date: "2027-03-01", done: false, track: "A", updatedAt: now },
      { id: "ms-festival-win", title: "Win at an Oscar-qualifying festival", date: "2027-10-31", done: false, track: "A", updatedAt: now },
      { id: "ms-oscar-entry", title: "Submit short for Oscar consideration", date: "2027-11-30", done: false, track: "A", updatedAt: now }
    ];
  }

  function seedInto(s) {
    var seed = window.SEED || {};
    if (Array.isArray(seed.ideas) && s.ideas.length === 0) {
      s.ideas = seed.ideas.map(function (i) {
        return {
          id: i.id || uid("idea"),
          title: i.title || "(untitled)",
          categories: i.categories || [],
          status: i.status || "Neu",
          energy: i.energy || null,
          notes: i.notes || "",
          source: i.source || "notion",
          createdAt: i.createdAt || new Date().toISOString(),
          updatedAt: i.updatedAt || new Date().toISOString()
        };
      });
    }
    if (Array.isArray(seed.projects) && s.projects.length === 0) {
      s.projects = seed.projects.slice();
    }
    if (s.milestones.length === 0) s.milestones = defaultMilestones();
    return s;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* file:// storage may be partitioned but still works */ }
    if (raw) {
      try {
        state = JSON.parse(raw);
        // fill any missing top-level keys after schema evolution
        var d = defaults();
        Object.keys(d).forEach(function (k) { if (state[k] === undefined) state[k] = d[k]; });
        Object.keys(d.settings).forEach(function (k) { if (state.settings[k] === undefined) state.settings[k] = d.settings[k]; });
        return;
      } catch (e) { console.error("Corrupt localStorage, resetting", e); }
    }
    state = seedInto(defaults());
    persist();
  }

  function persist() {
    state.meta.updatedAt = new Date().toISOString();
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
    catch (e) { toast("Warning: could not save to browser storage", true); }
    listeners.forEach(function (fn) { fn(state); });
  }

  /* ---------- festivals (static reference from seed) ---------- */
  function festivals() {
    return (window.SEED && window.SEED.festivals && window.SEED.festivals.festivals) || [];
  }
  function academyRules() {
    return (window.SEED && window.SEED.festivals && window.SEED.festivals.academyRules) || null;
  }

  /* ---------- export / import ---------- */
  function exportSnapshot() {
    var snap = JSON.parse(JSON.stringify(state));
    snap.meta.exportedAt = new Date().toISOString();
    snap.meta.exportedBy = state.settings.userName || "unknown";
    return snap;
  }

  function validateSnapshot(obj) {
    return obj && typeof obj === "object" && obj.meta && obj.meta.app === "way-to-oscar-command-center";
  }

  function importReplace(obj) {
    if (!validateSnapshot(obj)) throw new Error("Not a WAY TO OSCAR data file");
    var d = defaults();
    Object.keys(d).forEach(function (k) { if (obj[k] === undefined) obj[k] = d[k]; });
    state = obj;
    persist();
  }

  function newer(a, b) {
    var ta = a && a.updatedAt ? a.updatedAt : "";
    var tb = b && b.updatedAt ? b.updatedAt : "";
    return tb > ta ? b : a;
  }

  function mergeById(mine, theirs) {
    var map = {};
    mine.forEach(function (x) { map[x.id] = x; });
    theirs.forEach(function (x) {
      if (!x || !x.id) return;
      map[x.id] = map[x.id] ? newer(map[x.id], x) : x;
    });
    return Object.keys(map).map(function (k) { return map[k]; });
  }

  function importMerge(obj) {
    if (!validateSnapshot(obj)) throw new Error("Not a WAY TO OSCAR data file");
    state.ideas = mergeById(state.ideas, obj.ideas || []);
    state.projects = mergeById(state.projects, obj.projects || []);
    state.milestones = mergeById(state.milestones, obj.milestones || []);
    state.followers = mergeById(state.followers, obj.followers || []);
    var days = obj.challengeDays || {};
    Object.keys(days).forEach(function (dkey) {
      state.challengeDays[dkey] = state.challengeDays[dkey] ? newer(state.challengeDays[dkey], days[dkey]) : days[dkey];
    });
    var plans = obj.festivalPlans || {};
    Object.keys(plans).forEach(function (fid) {
      state.festivalPlans[fid] = state.festivalPlans[fid] ? newer(state.festivalPlans[fid], plans[fid]) : plans[fid];
    });
    // settings: theirs win only if their file is newer overall
    if ((obj.meta.updatedAt || "") > (state.meta.updatedAt || "")) {
      state.settings = Object.assign({}, state.settings, obj.settings || {});
    }
    persist();
  }

  function resetToSeed() {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    state = seedInto(defaults());
    persist();
  }

  load();

  return {
    get: function () { return state; },
    save: persist,
    onChange: function (fn) { listeners.push(fn); },
    festivals: festivals,
    academyRules: academyRules,
    exportSnapshot: exportSnapshot,
    importReplace: importReplace,
    importMerge: importMerge,
    resetToSeed: resetToSeed,
    defaultMilestones: defaultMilestones
  };
})();
