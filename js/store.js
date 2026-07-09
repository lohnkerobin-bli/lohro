/* ============ store.js — state, persistence, export/import ============ */
"use strict";

var Store = (function () {
  var LS_KEY = "way-to-oscar-data-v1";
  var state = null;

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
      festivalPlans: {},   // festivalId: {status, filmTitle, deadlineType, notes, updatedAt}
      brandNotes: [],      // {id, section, title, content, updatedAt} — the Brand Core
      meetings: [],        // {id, date, title, participants, transcript, decisions, actions, updatedAt}
      films: [],           // {id, title, logline, genre, themes, status, script, images[], notes, learnings, fromIdeaId, createdAt, updatedAt}
      visionBoards: []     // {id, title, tiles: [{id, kind: text|image, icon, text, url}], updatedAt}
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

  function normIdea(i) {
    return {
      id: i.id || uid("idea"),
      title: i.title || "(untitled)",
      categories: i.categories || [],
      status: i.status || "Neu",
      energy: i.energy || null,
      notes: i.notes || "",
      source: i.source || "notion",
      createdAt: i.createdAt || null,
      // seed rows must never outrank a real local edit in merge — default to epoch, not now
      updatedAt: i.updatedAt || i.createdAt || "1970-01-01T00:00:00.000Z"
    };
  }

  function seedBrandNotes() {
    var b = window.SEED && window.SEED.brand;
    if (!b || !Array.isArray(b.notes)) return [];
    return b.notes.map(function (n) {
      return {
        id: n.id || uid("brand"), section: n.section || "core",
        title: n.title || "(untitled)", content: n.content || "",
        updatedAt: n.updatedAt || "1970-01-01T00:00:00.000Z"
      };
    });
  }

  var EPOCH = "1970-01-01T00:00:00.000Z";

  function seedFilms() {
    var f = window.SEED && window.SEED.filmsSeed;
    if (!f || !Array.isArray(f.films)) return [];
    return f.films.map(function (x) {
      return Object.assign({ images: [], script: "", learnings: "", fromIdeaId: null, createdAt: EPOCH, updatedAt: EPOCH }, x);
    });
  }
  function seedVision() {
    var v = window.SEED && window.SEED.vision;
    if (!v || !Array.isArray(v.boards)) return [];
    return v.boards.map(function (b) {
      return { id: b.id, title: b.title, tiles: (b.tiles || []).slice(), updatedAt: EPOCH };
    });
  }

  function seedInto(s) {
    var seed = window.SEED || {};
    if (Array.isArray(seed.ideas) && s.ideas.length === 0) {
      s.ideas = seed.ideas.map(normIdea);
    }
    if (Array.isArray(seed.projects) && s.projects.length === 0) {
      s.projects = seed.projects.slice();
    }
    if (s.brandNotes.length === 0) s.brandNotes = seedBrandNotes();
    if (Array.isArray(seed.followers) && seed.followers.length) {
      s.followers = mergeById(seed.followers, s.followers);
    }
    if (s.films.length === 0) s.films = seedFilms();
    if (s.visionBoards.length === 0) s.visionBoards = seedVision();
    if (s.milestones.length === 0) s.milestones = defaultMilestones();
    return s;
  }

  // repair a loaded/imported state object: fill null/missing keys so no render can crash
  function normalize(s) {
    var d = defaults();
    Object.keys(d).forEach(function (k) {
      var bad = s[k] === undefined || s[k] === null ||
        (Array.isArray(d[k]) && !Array.isArray(s[k])) ||
        (!Array.isArray(d[k]) && typeof d[k] === "object" && typeof s[k] !== "object");
      if (bad) s[k] = d[k];
    });
    Object.keys(d.settings).forEach(function (k) {
      if (s.settings[k] === undefined || s.settings[k] === null) s.settings[k] = d.settings[k];
    });
    return s;
  }

  // when a newer seed ships (data regenerated from Notion), merge new rows in without
  // touching local edits; existing ids keep the local version
  function upgradeSeed(s) {
    var seed = window.SEED || {};
    var v = seed.version || 0;
    if ((s.meta.seedVersion || 0) >= v) return false;
    if (Array.isArray(seed.ideas)) s.ideas = mergeById(seed.ideas.map(normIdea), s.ideas);
    if (Array.isArray(seed.projects)) s.projects = mergeById(seed.projects, s.projects);
    s.brandNotes = mergeById(seedBrandNotes(), s.brandNotes);
    if (Array.isArray(seed.followers)) s.followers = mergeById(seed.followers, s.followers);
    s.films = mergeById(seedFilms(), s.films);
    s.visionBoards = mergeById(seedVision(), s.visionBoards);
    s.meta.seedVersion = v;
    return true;
  }

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(LS_KEY); } catch (e) { /* file:// storage may be partitioned but still works */ }
    if (raw) {
      try {
        state = normalize(JSON.parse(raw));
        if (upgradeSeed(state)) persist();
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
    state = normalize(obj);
    persist();
  }

  // parse timestamps for comparison — timezone-naive strings (old seeds) and
  // ISO-with-Z must compare on real time, not lexicographically
  function ts(x) {
    if (!x || !x.updatedAt) return 0;
    var t = Date.parse(x.updatedAt);
    return isNaN(t) ? 0 : t;
  }
  function newer(a, b) {
    return ts(b) > ts(a) ? b : a;
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

  // collection registry: every syncable collection is declared once so
  // merge/replace/export can never silently skip one
  var ID_COLLECTIONS = ["ideas", "projects", "milestones", "followers", "brandNotes", "meetings", "films", "visionBoards"];
  var KEYED_MAPS = ["challengeDays", "festivalPlans"];

  function importMerge(obj) {
    if (!validateSnapshot(obj)) throw new Error("Not a WAY TO OSCAR data file");
    obj = normalize(obj);
    ID_COLLECTIONS.forEach(function (col) {
      state[col] = mergeById(state[col], obj[col]);
    });
    KEYED_MAPS.forEach(function (map) {
      Object.keys(obj[map]).forEach(function (k) {
        state[map][k] = state[map][k] ? newer(state[map][k], obj[map][k]) : obj[map][k];
      });
    });
    // settings: theirs win only if their settings were edited more recently
    if (ts({ updatedAt: (obj.settings || {}).updatedAt }) > ts({ updatedAt: state.settings.updatedAt })) {
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
    festivals: festivals,
    academyRules: academyRules,
    exportSnapshot: exportSnapshot,
    importReplace: importReplace,
    importMerge: importMerge,
    resetToSeed: resetToSeed
  };
})();
