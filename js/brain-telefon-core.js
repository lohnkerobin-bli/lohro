/* ============ brain-telefon-core.js — pure logic for the Brain-Telefon (no DOM) ============
   Loaded as a classic script in the app (window.BrainPhoneCore) AND as a Node module
   in tests/brain-telefon.test.js. Keep it free of DOM / browser globals.           */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.BrainPhoneCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var BRAIN_PATH = "/KOLLEKTIV OSKAR/CLAUDE BRAIN";
  var MODEL = "claude-sonnet-4-6";
  var API_URL = "https://api.anthropic.com/v1/messages";
  var MCP_BETA = "mcp-client-2025-11-20";
  var DROPBOX_MCP = { type: "url", url: "https://mcp.dropbox.com/claude_app_mcp", name: "dropbox" };
  var MAX_HISTORY_CHARS = 14000;   // full transcript is resent every turn (API is stateless)
  var MAX_FILE_CHARS = 7000;       // one brain file as tool result — keep the prompt small
  var MAX_SEARCH_HITS = 8;

  /* ---------- prompt ---------- */
  function systemPrompt(opts) {
    opts = opts || {};
    var brain = opts.brainAvailable !== false;
    var lines = [
      "Du bist das CLAUDE BRAIN von Robin Lohnke (Lohro, Kollektiv Oskar, St. Gallen) — am Telefon.",
      "Robin spricht mit dir per Sprache, oft Schweizerdeutsch, und deine Antwort wird ihm VORGELESEN.",
      "",
      "So arbeitest du:"
    ];
    if (brain) {
      lines.push(
        "1. Suche ZUERST im CLAUDE BRAIN (Dropbox-Ordner " + BRAIN_PATH + ") mit der Suche" +
          (opts.toolStyle === "mcp" ? " des Dropbox-Servers (search, Pfad-Filter auf diesen Ordner)" : " brain_search") + ".",
        "2. Lies mit " + (opts.toolStyle === "mcp" ? "fetch" : "brain_read") + " NUR die 1 bis 3 relevantesten Dateien, nie alles —",
        "   und wenn es mehrere sind, alle in DERSELBEN Runde parallel (Robin wartet am Telefon, jede Runde kostet Sekunden).",
        "3. Antworte aus dem, was im Brain steht. Steht nichts drin, sag das ehrlich in einem Satz und frag kurz nach, was er genau meint."
      );
    } else {
      lines.push(
        "1. Du hast in diesem Gespräch KEINEN Zugriff auf das Brain (Dropbox nicht verbunden). Sag das in einem kurzen Satz,",
        "   bevor du aus allgemeinem Wissen antwortest — und rate nichts über Robins Projekte."
      );
    }
    lines.push(
      "",
      "So klingst du:",
      "- Deutsch, gesprochen, wie ein Kollege am Telefon. 2 bis 4 Sätze. Erst die Antwort, dann höchstens ein Detail.",
      "- KEIN Markdown, keine Listen, keine Aufzählungszeichen, keine Sternchen, keine Überschriften, keine Dateipfade,",
      "  keine URLs. Zahlen und Daten ausgeschrieben lesbar (zum Beispiel „am 18. August“).",
      "- Transkripte aus Schweizerdeutsch enthalten Fehler: interpretiere grosszügig, frag nur nach, wenn es wirklich unklar ist.",
      "- Nenne Quellen nur beiläufig („laut dem Meeting vom 18. August“), nie als Liste."
    );
    return lines.join("\n");
  }

  /* ---------- conversation ---------- */
  // history: [{role:"user"|"assistant", text}] — the on-screen transcript
  function trimHistory(history, maxChars) {
    maxChars = maxChars || MAX_HISTORY_CHARS;
    var out = [], total = 0;
    for (var i = history.length - 1; i >= 0; i--) {
      var h = history[i];
      if (!h || !h.text || (h.role !== "user" && h.role !== "assistant")) continue;
      total += h.text.length;
      if (total > maxChars && out.length) break;
      out.unshift(h);
    }
    // must start with a user turn
    while (out.length && out[0].role !== "user") out.shift();
    return out;
  }

  // strictly alternating user/assistant turns, ending on the new user text
  function buildTurns(history, userText) {
    var turns = [];
    trimHistory(history || []).forEach(function (h) {
      if (h.role !== "user" && h.role !== "assistant") return;   // notices / errors never reach the model
      var role = h.role;
      var text = String(h.text || "").trim();
      if (!text) return;
      if (turns.length && turns[turns.length - 1].role === role) {
        turns[turns.length - 1].content += "\n" + text;   // merge doubles instead of breaking alternation
      } else {
        turns.push({ role: role, content: text });
      }
    });
    var q = String(userText || "").trim();
    if (q) {
      if (turns.length && turns[turns.length - 1].role === "user") turns[turns.length - 1].content += "\n" + q;
      else turns.push({ role: "user", content: q });
    }
    if (turns.length && turns[turns.length - 1].role !== "user") turns.pop();
    return turns;
  }

  // artifact `sample` has no system prompt → instructions ride in the first user turn
  function buildSampleInput(history, userText, opts) {
    var turns = buildTurns(history, userText);
    if (!turns.length) return turns;
    turns[0] = {
      role: "user",
      content: systemPrompt(Object.assign({ toolStyle: "page" }, opts)) + "\n\n---\nRobin sagt: " + turns[0].content
    };
    return turns;
  }

  // direct Messages API request (local use with an Anthropic key in Settings)
  function buildApiRequest(history, userText, opts) {
    opts = opts || {};
    var server = Object.assign({}, DROPBOX_MCP);
    if (opts.dropboxToken) server.authorization_token = opts.dropboxToken;
    var body = {
      model: opts.model || MODEL,
      max_tokens: opts.maxTokens || 700,
      system: systemPrompt({ toolStyle: "mcp", brainAvailable: true }),
      messages: opts.messages || buildTurns(history, userText),
      mcp_servers: [server],
      tools: [{ type: "mcp_toolset", mcp_server_name: server.name }]
    };
    var headers = {
      "content-type": "application/json",
      "anthropic-version": "2023-06-01",
      "anthropic-beta": MCP_BETA,
      "anthropic-dangerous-direct-browser-access": "true"
    };
    if (opts.apiKey) headers["x-api-key"] = opts.apiKey;
    return { url: opts.url || API_URL, method: "POST", headers: headers, body: body };
  }

  /* ---------- response parsing ---------- */
  function extractMcpToolResult(block) {
    if (!block) return "";
    var c = block.content;
    if (typeof c === "string") return c;
    if (Array.isArray(c)) {
      return c.map(function (b) {
        if (!b) return "";
        if (typeof b === "string") return b;
        if (b.type === "text") return b.text || "";
        return "";
      }).filter(Boolean).join("\n");
    }
    if (c && typeof c === "object" && typeof c.text === "string") return c.text;
    return "";
  }

  // one Messages API response → what the phone needs. Dispatches on block.type.
  function parseApiResponse(json) {
    var out = { text: "", toolUses: [], toolResults: [], searchHits: 0, searches: 0, usedBrain: false,
      stopReason: (json && json.stop_reason) || null, isError: false, error: null };
    if (!json || typeof json !== "object") { out.isError = true; out.error = "Leere Antwort"; return out; }
    if (json.type === "error" || json.error) {
      out.isError = true;
      out.error = (json.error && json.error.message) || "API-Fehler";
      return out;
    }
    var texts = [];
    (json.content || []).forEach(function (b) {
      if (!b || typeof b !== "object") return;
      switch (b.type) {
        case "text":
          if (b.text) texts.push(b.text);
          break;
        case "mcp_tool_use":
        case "tool_use":
        case "server_tool_use":
          out.toolUses.push({ id: b.id, name: b.name, server: b.server_name || null, input: b.input || {} });
          out.usedBrain = true;
          break;
        case "mcp_tool_result":
        case "tool_result":
          var txt = extractMcpToolResult(b);
          var r = { toolUseId: b.tool_use_id, isError: !!b.is_error, text: txt };
          var use = out.toolUses.filter(function (u) { return u.id === b.tool_use_id; })[0];
          if (use && /search/i.test(use.name || "")) {
            out.searches++;
            r.hits = parseSearchPayload(txt).length;
            out.searchHits += r.hits;
          }
          out.toolResults.push(r);
          break;
        default:
          break; // thinking / unknown blocks are ignored for speech
      }
    });
    out.text = texts.join("\n").trim();
    return out;
  }

  /* ---------- Dropbox tool payloads (observed shapes of Dropbox MCP search/fetch) ---------- */
  function coercePayload(p) {
    if (p === null || p === undefined) return null;
    if (typeof p === "string") {
      var s = p.trim();
      if (!s) return null;
      try { return JSON.parse(s); } catch (e) { return { text: s }; }
    }
    if (typeof p === "object" && Array.isArray(p.content) && !p.results && !p.text) {
      return coercePayload(extractMcpToolResult(p));
    }
    return p;
  }

  function parseSearchPayload(payload) {
    var p = coercePayload(payload);
    if (!p) return [];
    var arr = Array.isArray(p) ? p : (Array.isArray(p.results) ? p.results : (Array.isArray(p.matches) ? p.matches : []));
    return arr.map(function (r) {
      if (!r || typeof r !== "object") return null;
      var md = r.metadata && r.metadata.metadata ? r.metadata.metadata : r;   // raw Dropbox API shape fallback
      var title = r.title || md.name || "";
      if (!title && (r.path_display || md.path_display)) title = String(r.path_display || md.path_display).split("/").pop();
      if (!title) return null;
      return {
        id: r.id || md.id || r.path || md.path_lower || "",
        title: title,
        path: r.path_display || md.path_display || r.path || "",
        modified: r.last_modified || md.server_modified || md.client_modified || null,
        match: r.match_type || null
      };
    }).filter(function (x) { return x && (x.id || x.path); }).slice(0, MAX_SEARCH_HITS);
  }

  function parseFetchPayload(payload, maxChars) {
    maxChars = maxChars || MAX_FILE_CHARS;
    var p = coercePayload(payload);
    if (!p) return { title: "", path: "", text: "", truncated: false, empty: true };
    var text = typeof p.text === "string" ? p.text : (typeof p === "string" ? p : "");
    var truncated = false;
    if (text.length > maxChars) { text = text.slice(0, maxChars) + "\n[… gekürzt]"; truncated = true; }
    return {
      title: p.title || "",
      path: (p.metadata && p.metadata.path_display) || p.path_display || "",
      modified: (p.metadata && p.metadata.server_modified) || null,
      text: text,
      truncated: truncated,
      empty: !text.trim()
    };
  }

  /* ---------- SpeakApp (voice notes recorded in the SpeakApp iPhone app, fetched via the connector) ----------
     The connector answers TOON-encoded text (observed):
       items[3]{id,title,createdAt,createdAtWeekday,updatedAt,durationSec,sourceType,language,status}:
         6814c0dc-…,"Periodensimulator: …","2026-09-08T09:17:28.041Z",Tue,"…",14.993,audioTrackTranscript,German,done
       hasMore: true
     and for one recording `key: value` lines with renderedText: "…" (JSON-style quoting). */
  function toolText(payload) {
    if (payload === null || payload === undefined) return "";
    if (typeof payload === "string") return payload;
    if (typeof payload === "object") {
      if (Array.isArray(payload.content)) return extractMcpToolResult(payload);
      if (typeof payload.text === "string") return payload.text;
      if (payload.payload !== undefined) return toolText(payload.payload);
      try { return JSON.stringify(payload); } catch (e) { return ""; }
    }
    return String(payload);
  }
  function splitCsvRow(line) {
    var out = [], cur = "", q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === "\\" && i + 1 < line.length) { cur += line[++i]; continue; }
        if (c === '"') { q = false; continue; }
        cur += c;
      } else {
        if (c === '"') { q = true; continue; }
        if (c === ",") { out.push(cur); cur = ""; continue; }
        cur += c;
      }
    }
    out.push(cur);
    return out.map(function (v) { return v.trim(); });
  }
  function toonValue(raw) {
    var v = String(raw || "").trim();
    if (v === "null" || v === "") return null;
    if (v[0] === '"') {
      try { return JSON.parse(v); } catch (e) {}
      return v.replace(/^"/, "").replace(/"\s*$/, "").replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    }
    return v;
  }
  function parseSpeakAppList(payload) {
    var txt = toolText(payload);
    // JSON fallback (structuredContent)
    if (/^\s*[\[{]/.test(txt)) {
      try { var j = JSON.parse(txt); var arr = Array.isArray(j) ? j : (j.items || []); return arr.map(normRec).filter(Boolean); } catch (e) {}
    }
    var lines = txt.split(/\r?\n/);
    var fields = null, items = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var m = ln.match(/^\s*items\[\d+\]\{([^}]*)\}\s*:\s*$/);
      if (m) { fields = m[1].split(",").map(function (f) { return f.trim(); }); continue; }
      if (!fields) continue;
      if (/^\s*(hasMore|totalCount)\s*:/.test(ln)) { fields = null; continue; }
      if (!ln.trim()) continue;
      var cells = splitCsvRow(ln.trim());
      var o = {};
      fields.forEach(function (f, idx) { o[f] = cells[idx] !== undefined ? toonValue(cells[idx]) : null; });
      var r = normRec(o);
      if (r) items.push(r);
    }
    return items;
  }
  function normRec(o) {
    if (!o || !o.id) return null;
    return {
      id: String(o.id), title: o.title || "", createdAt: o.createdAt || null,
      durationSec: o.durationSec === null || o.durationSec === undefined ? null : Number(o.durationSec),
      status: o.status || "unknown", language: o.language || null
    };
  }
  function parseSpeakAppRecording(payload) {
    var txt = toolText(payload);
    if (/^\s*\{/.test(txt)) { try { var j = JSON.parse(txt); return { id: j.id, status: j.status, createdAt: j.createdAt, title: j.title, text: cleanSpeakAppText(j.renderedText || ""), error: j.errorText || null }; } catch (e) {} }
    var out = { id: null, status: null, createdAt: null, title: "", text: "", error: null };
    var lines = txt.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var m = lines[i].match(/^\s*(\w+)\s*:\s*(.*)$/);
      if (!m) continue;
      var k = m[1], v = m[2];
      if (k === "id") out.id = toonValue(v);
      else if (k === "status") out.status = toonValue(v);
      else if (k === "createdAt") out.createdAt = toonValue(v);
      else if (k === "title") out.title = toonValue(v) || "";
      else if (k === "errorText") out.error = toonValue(v);
      else if (k === "renderedText") {
        var raw = v.trim();
        if (raw[0] === '"') {
          // quoted; normally one physical line, but tolerate a value that runs over several lines
          var parsed = null;
          try { parsed = JSON.parse(raw); } catch (e) {
            var buf = raw, j = i;
            while (j + 1 < lines.length && !/^\s*\w+\s*:/.test(lines[j + 1])) { j++; buf += "\n" + lines[j]; }
            i = j;
            parsed = toonValue(buf);
          }
          out.text = cleanSpeakAppText(parsed || "");
        } else out.text = cleanSpeakAppText(toonValue(raw) || "");
      }
    }
    return out;
  }
  // "Speaker 1: Kurzfilmidee …" → plain spoken text
  function cleanSpeakAppText(t) {
    return String(t || "").replace(/(^|\n)\s*(Speaker|Sprecher)\s*\d*\s*:\s*/gi, "$1").replace(/\s*\n\s*/g, " ").replace(/\s{2,}/g, " ").trim();
  }
  // which recording is the new question? newer than the baseline seen when listening started, finished, not consumed
  function pickNewRecording(items, baseline, consumed) {
    consumed = consumed || {};
    var base = baseline && baseline.createdAt ? Date.parse(baseline.createdAt) : 0;
    var fresh = (items || []).filter(function (r) {
      if (!r || consumed[r.id]) return false;
      if (baseline && r.id === baseline.id) return false;
      var t = r.createdAt ? Date.parse(r.createdAt) : 0;
      return t > base;
    });
    fresh.sort(function (a, b) { return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0); });
    var done = fresh.filter(function (r) { return r.status === "done"; });
    return { ready: done[0] || null, pending: fresh.filter(function (r) { return r.status !== "done" && r.status !== "error"; }).length, errored: fresh.filter(function (r) { return r.status === "error"; }).length };
  }

  /* ---------- speech ---------- */
  // strip markdown & structure so TTS never reads "Sternchen Sternchen"
  function toSpeech(text) {
    var t = String(text || "");
    t = t.replace(/```[\s\S]*?```/g, " ");
    t = t.replace(/`([^`]*)`/g, "$1");
    t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, " ");
    t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");
    t = t.replace(/https?:\/\/\S+/g, " ");
    t = t.replace(/^\s{0,3}#{1,6}\s+/gm, "");
    t = t.replace(/^\s*[-*•+]\s+/gm, "");
    t = t.replace(/^\s*\d+[.)]\s+/gm, "");
    t = t.replace(/^\s*>\s?/gm, "");
    t = t.replace(/(\*\*|__)(.*?)\1/g, "$2");
    t = t.replace(/(\*|_)(\S(?:.*?\S)?)\1/g, "$2");
    t = t.replace(/[*_#|>~]+/g, " ");
    t = t.replace(/\s*\n\s*\n\s*/g, ". ");
    t = t.replace(/\s*\n\s*/g, " ");
    t = t.replace(/\.\s*\./g, ".");
    t = t.replace(/[ \t]{2,}/g, " ").trim();
    return t;
  }

  // split for speechSynthesis (Chrome cuts utterances > ~15 s)
  function speechChunks(text, maxLen) {
    maxLen = maxLen || 180;
    var clean = toSpeech(text);
    if (!clean) return [];
    var sentences = clean.match(/[^.!?]+[.!?]+["»)]?\s*|[^.!?]+$/g) || [clean];
    var chunks = [], cur = "";
    sentences.forEach(function (s) {
      s = s.trim();
      if (!s) return;
      if ((cur + " " + s).trim().length > maxLen && cur) { chunks.push(cur.trim()); cur = s; }
      else cur = (cur + " " + s).trim();
    });
    if (cur) chunks.push(cur.trim());
    return chunks;
  }

  // acceptance check: is the answer speakable? (used by tests and the live self-check)
  function speechCheck(text) {
    var issues = [];
    var t = String(text || "");
    if (/(^|\n)\s*([-*•]|\d+[.)])\s+/.test(t)) issues.push("list");
    if (/\*\*|__|(^|\n)#{1,6}\s/.test(t)) issues.push("markdown");
    if (/https?:\/\//.test(t)) issues.push("url");
    var sentences = (toSpeech(t).match(/[^.!?]+[.!?]+/g) || []).length;
    if (sentences > 6) issues.push("too_long:" + sentences);
    if (t.length > 900) issues.push("too_many_chars:" + t.length);
    return { ok: issues.length === 0, issues: issues, sentences: sentences };
  }

  function normalizeTranscript(t) {
    var s = String(t || "").replace(/\s+/g, " ").trim();
    if (!s) return "";
    s = s.charAt(0).toUpperCase() + s.slice(1);
    if (!/[.!?]$/.test(s)) s += /^(was|wer|wie|wo|wann|warum|wieso|weshalb|welche|welcher|welches|hat|ist|gibt|kann|soll|weiss|weisst|wott|wottsch|isch|het|wie viel|wieviel)\b/i.test(s) ? "?" : ".";
    return s;
  }

  /* ---------- tiers ---------- */
  // Basis = Web Speech / speechSynthesis (no keys). Pro = Whisper / ElevenLabs (keys in Settings).
  // canExternalFetch=false inside the Claude artifact sandbox (CSP blocks other hosts) → Pro impossible there.
  function chooseTier(env) {
    env = env || {};
    var stt, tts;
    if (env.hasSpeakApp && (env.sttMode === "speakapp" || env.hasWebSpeech === false)) {
      stt = { tier: "speakapp", engine: "speakapp", reason: env.sttMode === "speakapp" ? "SpeakApp gewählt" : "kein Mikrofon-Modus im Browser — SpeakApp-Aufnahmen" };
    } else if (env.openaiKey && env.canExternalFetch !== false && env.hasMediaRecorder !== false) {
      stt = { tier: "pro", engine: "whisper-1", reason: "OpenAI-Key gesetzt" };
    } else if (env.hasWebSpeech !== false) {
      stt = { tier: "basis", engine: "web-speech", reason: env.openaiKey
        ? (env.canExternalFetch === false ? "Pro nicht möglich: Artifact-Sandbox blockiert externe Hosts" : "Pro nicht möglich: kein MediaRecorder")
        : "kein OpenAI-Key" };
    } else {
      stt = { tier: "none", engine: "text", reason: "Browser ohne Spracherkennung — tippen" };
    }
    if (env.elevenKey && env.canExternalFetch !== false) {
      tts = { tier: "pro", engine: "elevenlabs", reason: "ElevenLabs-Key gesetzt" };
    } else if (env.hasSynth !== false) {
      tts = { tier: "basis", engine: "speech-synthesis", reason: env.elevenKey ? "Pro nicht möglich: Artifact-Sandbox blockiert externe Hosts" : "kein ElevenLabs-Key" };
    } else {
      tts = { tier: "none", engine: "text", reason: "Browser ohne Sprachausgabe — nur Text" };
    }
    var label = (stt.tier === "pro" || tts.tier === "pro") ? "Pro" : (stt.tier === "none" && tts.tier === "none" ? "Text" : "Basis");
    if (stt.tier === "speakapp") label = tts.tier === "pro" ? "Pro" : "SpeakApp";
    return { stt: stt, tts: tts, label: label };
  }
  // the microphone is blocked (typical inside the claude.ai iframe on iPhone) → SpeakApp takes over if connected
  function speakAppTier(env) {
    env = env || {};
    if (!env.hasSpeakApp) return null;
    return { tier: "speakapp", engine: "speakapp", reason: "Mikrofon blockiert — Aufnahmen kommen aus SpeakApp", fellBack: true };
  }

  // a Pro engine failed at runtime (network, 401, CSP) → next lower tier, never a dead end
  function fallbackTier(current, kind, env) {
    env = env || {};
    var next;
    if (kind === "stt") {
      next = current.tier === "pro"
        ? (env.hasWebSpeech !== false ? { tier: "basis", engine: "web-speech" } : { tier: "none", engine: "text" })
        : { tier: "none", engine: "text" };
    } else {
      next = current.tier === "pro"
        ? (env.hasSynth !== false ? { tier: "basis", engine: "speech-synthesis" } : { tier: "none", engine: "text" })
        : { tier: "none", engine: "text" };
    }
    next.reason = "Fallback nach Fehler in " + current.engine;
    next.fellBack = true;
    return next;
  }

  /* ---------- transport choice ---------- */
  // artifact = claude.use("sample") (+ mcp Dropbox) — no key; direct = Anthropic key in Settings (local file)
  function chooseTransport(env) {
    env = env || {};
    if (env.hasSample) return { kind: "artifact", brain: env.hasMcp ? "dropbox-connector" : "none", label: env.hasMcp ? "Claude-Artifact · Brain via Dropbox" : "Claude-Artifact · ohne Brain" };
    if (env.anthropicKey) return { kind: "direct", brain: "dropbox-mcp", label: "Direkte API · Dropbox-MCP" };
    return { kind: "none", brain: "none", label: "kein Zugang" };
  }

  /* ---------- errors → spoken + visible German messages ---------- */
  var MESSAGES = {
    mic_denied: {
      spoken: "Ich kann dich nicht hören, das Mikrofon ist blockiert. Erlaube den Zugriff in den Browser-Einstellungen oder tippe deine Frage unten ein.",
      visible: "Mikrofon blockiert. Zugriff im Browser erlauben (Schloss-Symbol in der Adresszeile; im Artifact ggf. die ZENTRALE in einem eigenen Tab öffnen) — oder Frage unten eintippen."
    },
    mic_unavailable: {
      spoken: "Dieser Browser hat keine Spracherkennung. Tippe deine Frage unten ein, ich antworte trotzdem.",
      visible: "Keine Spracherkennung in diesem Browser — Frage unten eintippen (Safari oder Chrome nutzen)."
    },
    offline: {
      spoken: "Die Verbindung ist weg. Sobald du wieder Netz hast, frag einfach nochmal.",
      visible: "Keine Internetverbindung. Frage wird nicht gesendet — bei Netz erneut versuchen."
    },
    api_error: {
      spoken: "Das Brain antwortet gerade nicht, da ist ein Fehler passiert. Versuch es gleich nochmal.",
      visible: "Brain-Anfrage fehlgeschlagen."
    },
    rate_limited: {
      spoken: "Das Brain ist gerade überlastet. Warte einen Moment und frag dann nochmal.",
      visible: "Zu viele Anfragen — kurz warten und erneut versuchen."
    },
    not_granted: {
      spoken: "Du musst der ZENTRALE erst erlauben, Claude und Dropbox zu nutzen. Bestätige die Anfrage im Fenster und ruf nochmal an.",
      visible: "Zugriff nicht erteilt. Die Freigabe für Claude / Dropbox im Artifact bestätigen, dann erneut anrufen."
    },
    empty_brain: {
      spoken: "Dazu finde ich im Brain nichts. Formulier es anders, oder sag mir, ob ich es mir merken soll.",
      visible: "Brain-Suche ohne Treffer."
    },
    brain_unreachable: {
      spoken: "Ich komme gerade nicht an das Brain in der Dropbox. Ich antworte ohne Brain, aber nur aus allgemeinem Wissen.",
      visible: "Dropbox-Connector nicht verbunden — Antworten ohne Brain-Zugriff."
    },
    no_transport: {
      spoken: "Ich habe keinen Zugang zum Brain. Öffne die ZENTRALE als Claude-Artifact, oder hinterlege einen Anthropic-Key in den Settings.",
      visible: "Kein Brain-Zugang: App als Claude-Artifact öffnen (claude.ai) oder Anthropic-API-Key unter Data & Settings eintragen."
    },
    cancelled: {
      spoken: "",
      visible: "Abgebrochen."
    },
    speakapp_switch: {
      spoken: "Das Mikrofon ist hier blockiert, ich höre jetzt über SpeakApp. Nimm deine Frage dort auf, ich hole sie automatisch.",
      visible: "Mikrofon im Artifact blockiert — Umschaltung auf SpeakApp: Frage in SpeakApp aufnehmen, hierher zurückkommen, die Aufnahme wird automatisch geholt."
    },
    speakapp_error: {
      spoken: "Ich komme gerade nicht an SpeakApp ran. Tippe deine Frage unten ein oder versuch es gleich nochmal.",
      visible: "SpeakApp-Connector nicht erreichbar (Freigabe im Artifact prüfen) — Frage unten eintippen."
    },
    speakapp_transcribe_error: {
      spoken: "SpeakApp konnte die Aufnahme nicht transkribieren. Nimm sie bitte nochmal auf.",
      visible: "SpeakApp meldet einen Transkriptionsfehler — Aufnahme wiederholen."
    },
    empty_answer: {
      spoken: "Das Brain hat keine Antwort geliefert. Frag nochmal, vielleicht etwas anders.",
      visible: "Leere Antwort vom Brain."
    }
  };

  function messageFor(kind) {
    return MESSAGES[kind] || MESSAGES.api_error;
  }

  function classifyError(err, ctx) {
    ctx = ctx || {};
    if (ctx.online === false) return "offline";
    if (!err) return "api_error";
    var code = err.code || err.name || "";
    var msg = String(err.message || err.error || err || "").toLowerCase();
    if (code === "not-allowed" || code === "service-not-allowed" || code === "NotAllowedError" || code === "PermissionDeniedError" || /permission denied|not allowed|mikrofon/.test(msg)) return "mic_denied";
    if (code === "audio-capture" || code === "NotFoundError" || /no microphone|requested device not found/.test(msg)) return "mic_unavailable";
    if (code === "cancelled" || code === "AbortError" || code === "aborted") return "cancelled";
    if (code === "rate_limited" || /429|rate limit|overloaded|529/.test(msg)) return "rate_limited";
    if (code === "not_in_manifest" || code === "server_not_found") return "speakapp_error";
    if (code === "not_granted" || code === "not_declared" || code === "needs_reauth" || code === "server_not_connected" || code === "sampling_disabled") return "not_granted";
    if (code === "network" || code === "TypeError" && /fetch|network|load failed/.test(msg) || /networkerror|failed to fetch|network request failed|load failed|err_internet_disconnected/.test(msg)) return "offline";
    if (code === "empty_completion") return "empty_answer";
    return "api_error";
  }

  /* ---------- turn bookkeeping ---------- */
  function turnMeta(started, ended, hits, tier, transport) {
    return {
      ms: Math.max(0, (ended || 0) - (started || 0)),
      hits: hits || 0,
      tier: tier || "Basis",
      transport: transport || "artifact"
    };
  }
  function fmtMeta(meta) {
    var parts = [];
    if (meta.hits) parts.push(meta.hits + (meta.hits === 1 ? " Brain-Datei" : " Brain-Dateien"));
    else parts.push("0 Brain-Treffer");
    if (meta.ms) parts.push((meta.ms / 1000).toFixed(1) + " s");
    if (meta.tier) parts.push(meta.tier);
    return parts.join(" · ");
  }

  return {
    BRAIN_PATH: BRAIN_PATH, MODEL: MODEL, API_URL: API_URL, MCP_BETA: MCP_BETA, DROPBOX_MCP: DROPBOX_MCP,
    MAX_FILE_CHARS: MAX_FILE_CHARS, MAX_SEARCH_HITS: MAX_SEARCH_HITS,
    systemPrompt: systemPrompt,
    trimHistory: trimHistory, buildTurns: buildTurns, buildSampleInput: buildSampleInput, buildApiRequest: buildApiRequest,
    parseApiResponse: parseApiResponse, extractMcpToolResult: extractMcpToolResult,
    parseSearchPayload: parseSearchPayload, parseFetchPayload: parseFetchPayload,
    toSpeech: toSpeech, speechChunks: speechChunks, speechCheck: speechCheck, normalizeTranscript: normalizeTranscript,
    chooseTier: chooseTier, fallbackTier: fallbackTier, speakAppTier: speakAppTier, chooseTransport: chooseTransport,
    parseSpeakAppList: parseSpeakAppList, parseSpeakAppRecording: parseSpeakAppRecording, cleanSpeakAppText: cleanSpeakAppText,
    pickNewRecording: pickNewRecording, splitCsvRow: splitCsvRow,
    classifyError: classifyError, messageFor: messageFor, MESSAGES: MESSAGES,
    turnMeta: turnMeta, fmtMeta: fmtMeta
  };
});
