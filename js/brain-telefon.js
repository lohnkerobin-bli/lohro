/* ============ brain-telefon.js — Brain-Telefon: a voice call with the CLAUDE BRAIN ============
   Flow: tap → mic → transcript → Claude (with Dropbox brain search) → spoken answer → keep talking.
   Transport: inside the Claude artifact via claude.use("sample") + claude.use("mcp") (no keys);
   locally via the Messages API with an Anthropic key from Settings (Dropbox MCP connector).
   STT/TTS tiers: Basis = Web Speech / speechSynthesis; Pro = Whisper / ElevenLabs (keys in Settings). */
"use strict";

/* ---------- keys live OUTSIDE the Store: never exported, never in JSON snapshots ---------- */
var PhoneKeys = (function () {
  var KEY = "zentrale-brain-phone-keys-v1";
  var FIELDS = ["openai", "eleven", "elevenVoice", "anthropic", "dropboxToken"];
  function get() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) {}
    var o = {};
    try { o = raw ? JSON.parse(raw) : {}; } catch (e) { o = {}; }
    var out = {};
    FIELDS.forEach(function (f) { out[f] = (o && typeof o[f] === "string") ? o[f].trim() : ""; });
    return out;
  }
  function set(patch) {
    var cur = get();
    FIELDS.forEach(function (f) { if (patch && typeof patch[f] === "string") cur[f] = patch[f].trim(); });
    try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) {}
    return cur;
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) {} }
  return { get: get, set: set, clear: clear, FIELDS: FIELDS, STORAGE_KEY: KEY };
})();

var BrainPhoneView = (function () {
  var Core = window.BrainPhoneCore;
  var DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"; // ElevenLabs "Rachel" (multilingual) — overridable in Settings

  /* ---------- runtime detection (injected in tests via window.claude / globals) ---------- */
  var rt = { resolved: false, sample: null, mcp: null, sampleTools: false };

  function isArtifactHost() {
    return !!(window.claude && typeof window.claude.use === "function");
  }
  // inside the artifact sandbox, fetch to other hosts is blocked by CSP → Pro tiers impossible there
  function canExternalFetch() {
    if (window.__phoneForceExternalFetch !== undefined) return !!window.__phoneForceExternalFetch;
    return !isArtifactHost();
  }
  function hasWebSpeech() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
  function hasSynth() { return !!(window.speechSynthesis && window.SpeechSynthesisUtterance); }
  function hasMediaRecorder() { return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }

  function resolveRuntime() {
    if (rt.promise) return rt.promise;
    rt.promise = (function () {
      if (!isArtifactHost()) { rt.resolved = true; return Promise.resolve(rt); }
      return Promise.all([
        window.claude.use("sample").catch(function () { return null; }),
        window.claude.use("mcp").catch(function () { return null; })
      ]).then(function (r) {
        rt.sample = r[0]; rt.mcp = r[1]; rt.resolved = true;
        if (rt.sample && typeof rt.sample.limits === "function") {
          return rt.sample.limits().then(function (lim) { rt.sampleTools = !!(lim && lim.tools); return rt; })
            .catch(function () { rt.sampleTools = true; return rt; });
        }
        rt.sampleTools = !!rt.sample;
        return rt;
      });
    })();
    return rt.promise;
  }

  function env() {
    var k = PhoneKeys.get();
    return {
      openaiKey: k.openai, elevenKey: k.eleven, anthropicKey: k.anthropic,
      canExternalFetch: canExternalFetch(), hasWebSpeech: hasWebSpeech(), hasSynth: hasSynth(),
      hasMediaRecorder: hasMediaRecorder(), hasSample: !!rt.sample, hasMcp: !!rt.mcp, online: navigator.onLine !== false
    };
  }

  /* ---------- call state ---------- */
  var call = null;      // {phase, history:[{role,text,meta}], tier, transport, startedAt, abort, hits, status}
  var ui = {};          // cached DOM refs for the active render
  var listeners = [];   // test/debug hooks

  function emit(ev, data) { listeners.forEach(function (fn) { try { fn(ev, data); } catch (e) {} }); }

  function newCall() {
    var e = env();
    return {
      phase: "idle", history: [], hits: 0, status: "",
      tier: Core.chooseTier(e), transport: Core.chooseTransport(e),
      startedAt: Date.now(), turnStart: 0, abort: null, rec: null, recStop: null, timer: null,
      noSpeechCount: 0, active: false, interim: ""
    };
  }

  function setPhase(phase, status) {
    if (!call) return;
    call.phase = phase;
    call.status = status || "";
    paintState();
    emit("phase", { phase: phase, status: call.status });
  }

  /* ---------- transcript ---------- */
  function pushTurn(role, text, meta) {
    var t = { role: role, text: text, meta: meta || null, at: Date.now() };
    call.history.push(t);
    paintTranscript();
    emit("turn", t);
    return t;
  }
  function pushNotice(text, kind) {
    var t = { role: "notice", text: text, kind: kind || "info", at: Date.now() };
    call.history.push(t);
    paintTranscript();
    emit("notice", t);
    return t;
  }

  /* ---------- STT: Basis (Web Speech) ---------- */
  function listenWebSpeech(onResult, onError) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = new SR();
    rec.lang = call.sttLang || "de-CH";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    var finalText = "", done = false;
    rec.onresult = function (ev) {
      var interim = "";
      for (var i = ev.resultIndex; i < ev.results.length; i++) {
        var r = ev.results[i];
        if (r.isFinal) finalText += r[0].transcript; else interim += r[0].transcript;
      }
      call.interim = finalText || interim;
      paintInterim();
    };
    rec.onerror = function (ev) {
      if (done) return;
      done = true;
      var code = ev && ev.error;
      if (code === "language-not-supported" && rec.lang !== "de-DE") {
        call.sttLang = "de-DE";
        pushNotice("Schweizerdeutsch (de-CH) nicht verfügbar — Erkennung läuft auf de-DE.", "info");
        return onError({ code: "retry" });
      }
      if (code === "no-speech" || code === "aborted") return onError({ code: code });
      onError({ code: code || "unknown", message: "SpeechRecognition " + code });
    };
    rec.onend = function () {
      if (done) return;
      done = true;
      var t = (finalText || call.interim || "").trim();
      call.interim = "";
      if (t) onResult(t); else onError({ code: "no-speech" });
    };
    try { rec.start(); } catch (e) { done = true; return onError({ code: "NotAllowedError", message: e.message }); }
    call.rec = rec;
    call.recStop = function () { done = true; try { rec.abort(); } catch (e) {} };
  }

  /* ---------- STT: Pro (Whisper via MediaRecorder + silence detection) ---------- */
  function listenWhisper(onResult, onError) {
    var keys = PhoneKeys.get();
    var stream, recorder, ctx, chunks = [], stopped = false, spoke = false, silenceSince = 0, raf = 0, hardStop;
    function cleanup() {
      cancelAnimationFrame(raf);
      clearTimeout(hardStop);
      try { if (ctx) ctx.close(); } catch (e) {}
      try { if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    }
    function finish() {
      if (stopped) return;
      stopped = true;
      try { if (recorder && recorder.state !== "inactive") recorder.stop(); else onError({ code: "no-speech" }); } catch (e) { onError({ code: "no-speech" }); }
    }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      var mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].filter(function (m) {
        return window.MediaRecorder.isTypeSupported && window.MediaRecorder.isTypeSupported(m);
      })[0];
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = function () {
        cleanup();
        var blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        if (!spoke || blob.size < 2000) return onError({ code: "no-speech" });
        setPhase("thinking", "Whisper transkribiert…");
        var fd = new FormData();
        fd.append("file", blob, "frage." + ((recorder.mimeType || "audio/webm").indexOf("mp4") >= 0 ? "mp4" : "webm"));
        fd.append("model", "whisper-1");
        fd.append("language", "de");
        fd.append("prompt", "Schweizerdeutsch. Robin, Lohro, Kollektiv Oskar, ZENTRALE, Brain, ZHAW, Säntis, Simon, Jasmin, Oscar.");
        fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: "Bearer " + keys.openai }, body: fd })
          .then(function (r) { if (!r.ok) throw new Error("Whisper HTTP " + r.status); return r.json(); })
          .then(function (j) { var t = (j && j.text || "").trim(); if (t) onResult(t); else onError({ code: "no-speech" }); })
          .catch(function (e) { onError({ code: "pro-failed", message: e.message }); });
      };
      // silence detection
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        var src = ctx.createMediaStreamSource(stream), an = ctx.createAnalyser();
        an.fftSize = 512; src.connect(an);
        var buf = new Uint8Array(an.fftSize);
        (function tick() {
          if (stopped) return;
          an.getByteTimeDomainData(buf);
          var sum = 0;
          for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
          var rms = Math.sqrt(sum / buf.length);
          call.level = rms; paintLevel();
          var now = Date.now();
          if (rms > 0.035) { spoke = true; silenceSince = 0; }
          else if (spoke) { if (!silenceSince) silenceSince = now; else if (now - silenceSince > 1400) return finish(); }
          raf = requestAnimationFrame(tick);
        })();
      } catch (e) { /* no analyser → rely on the hard stop / tap */ }
      hardStop = setTimeout(finish, 30000);
      recorder.start(250);
    }).catch(function (e) { cleanup(); onError({ code: e && e.name || "NotAllowedError", message: e && e.message }); });
    call.recStop = function () { if (!stopped) { stopped = true; cleanup(); try { recorder && recorder.state !== "inactive" && recorder.stop(); } catch (er) {} } };
    call.recSend = finish;   // "Fertig" button: send now
  }

  function startListening() {
    if (!call || !call.active) return;
    call.interim = "";
    setPhase("listening", call.tier.stt.tier === "pro" ? "Ich höre zu (Whisper)…" : "Ich höre zu…");
    var onResult = function (text) {
      if (!call || !call.active) return;
      call.noSpeechCount = 0;
      handleUserText(text);
    };
    var onError = function (err) {
      if (!call || !call.active) return;
      var code = err && err.code;
      if (code === "retry") return startListening();
      if (code === "no-speech" || code === "aborted") {
        call.noSpeechCount++;
        if (call.noSpeechCount >= 3) { setPhase("idle-in-call", "Nichts gehört. Tipp auf Sprechen oder tippe unten."); return; }
        return startListening();
      }
      if (code === "pro-failed") {
        call.tier.stt = Core.fallbackTier(call.tier.stt, "stt", env());
        pushNotice("Whisper nicht erreichbar — Spracherkennung läuft jetzt auf Basis (Web Speech).", "warn");
        paintState();
        return startListening();
      }
      var kind = Core.classifyError(err, { online: navigator.onLine !== false });
      failSpoken(kind, err);
    };
    if (call.tier.stt.tier === "pro") return listenWhisper(onResult, onError);
    if (call.tier.stt.tier === "basis") return listenWebSpeech(onResult, onError);
    setPhase("idle-in-call", "Kein Mikrofon-Modus — Frage unten eintippen.");
    if (!call.noMicNoticeShown) { call.noMicNoticeShown = true; failSpoken("mic_unavailable"); }
  }

  function stopListening() {
    if (call && call.recStop) { try { call.recStop(); } catch (e) {} }
    if (call) { call.rec = null; call.recStop = null; call.recSend = null; }
  }

  /* ---------- TTS ---------- */
  var speaking = { audio: null, cancel: null };

  function stopSpeaking() {
    if (speaking.cancel) { try { speaking.cancel(); } catch (e) {} }
    speaking.cancel = null; speaking.audio = null;
    if (hasSynth()) { try { window.speechSynthesis.cancel(); } catch (e) {} }
  }

  function pickVoice() {
    if (!hasSynth()) return null;
    var voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
    var byLang = function (l) { return voices.filter(function (v) { return (v.lang || "").replace("_", "-").toLowerCase().indexOf(l) === 0; }); };
    var pref = byLang("de-ch").concat(byLang("de-de"), byLang("de"));
    var premium = pref.filter(function (v) { return /premium|enhanced|natural|siri|google/i.test(v.name); });
    return premium[0] || pref[0] || null;
  }

  function speakSynth(text) {
    return new Promise(function (resolve) {
      if (!hasSynth()) return resolve(false);
      var chunks = Core.speechChunks(text);
      if (!chunks.length) return resolve(false);
      var synth = window.speechSynthesis;
      try { synth.cancel(); } catch (e) {}
      var voice = pickVoice(), i = 0, cancelled = false;
      speaking.cancel = function () { cancelled = true; try { synth.cancel(); } catch (e) {} resolve(false); };
      (function next() {
        if (cancelled) return;
        if (i >= chunks.length) { speaking.cancel = null; return resolve(true); }
        var u = new SpeechSynthesisUtterance(chunks[i++]);
        u.lang = (voice && voice.lang) || "de-CH";
        if (voice) u.voice = voice;
        u.rate = 1.02; u.pitch = 1;
        u.onend = next;
        u.onerror = function () { next(); };
        try { synth.speak(u); } catch (e) { console.warn("[Brain-Telefon] speechSynthesis failed:", e); speaking.cancel = null; resolve(false); }
      })();
    });
  }

  function speakEleven(text) {
    var keys = PhoneKeys.get();
    var voice = keys.elevenVoice || DEFAULT_VOICE;
    var ctl = new AbortController();
    speaking.cancel = function () { ctl.abort(); if (speaking.audio) { try { speaking.audio.pause(); } catch (e) {} } };
    return fetch("https://api.elevenlabs.io/v1/text-to-speech/" + encodeURIComponent(voice) + "?output_format=mp3_44100_128", {
      method: "POST", signal: ctl.signal,
      headers: { "xi-api-key": keys.eleven, "content-type": "application/json", accept: "audio/mpeg" },
      body: JSON.stringify({ text: Core.toSpeech(text), model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.45, similarity_boost: 0.8 } })
    }).then(function (r) {
      if (!r.ok) throw new Error("ElevenLabs HTTP " + r.status);
      return r.blob();
    }).then(function (blob) {
      return new Promise(function (resolve, reject) {
        var a = new Audio(URL.createObjectURL(blob));
        speaking.audio = a;
        a.onended = function () { resolve(true); };
        a.onerror = function () { reject(new Error("Audio playback failed")); };
        a.play().catch(reject);
      });
    });
  }

  // never rejects: a broken voice must not break the conversation
  function speak(text) {
    if (!call) return Promise.resolve(false);
    stopSpeaking();
    var tier = call.tier.tts.tier;
    var p;
    if (tier === "none") p = Promise.resolve(false);
    else if (tier === "pro") {
      p = speakEleven(text).catch(function (e) {
        if (e && e.name === "AbortError") return false;
        call.tier.tts = Core.fallbackTier(call.tier.tts, "tts", env());
        pushNotice("ElevenLabs nicht erreichbar — Stimme läuft jetzt auf Basis (System-Stimme).", "warn");
        paintState();
        return speakSynth(text);
      });
    } else p = speakSynth(text);
    return p.catch(function (e) { console.warn("[Brain-Telefon] speak failed:", e); return false; });
  }

  /* ---------- the brain call (transport) ---------- */
  function brainTools(signal) {
    var mcp = rt.mcp;
    if (!mcp) return [];
    return [
      {
        name: "brain_search",
        description: "Volltextsuche im CLAUDE BRAIN (Dropbox-Ordner " + Core.BRAIN_PATH + "). Liefert bis zu " + Core.MAX_SEARCH_HITS + " Treffer mit id, title, path, modified. Danach mit brain_read die relevanten lesen.",
        inputSchema: { type: "object", properties: { query: { type: "string", description: "Suchbegriffe, kurz (Thema, Kunde, Projekt, Person)" } }, required: ["query"] },
        execute: function (input, ctx) {
          var q = String(input && input.query || "").trim();
          if (!q) return { results: [], note: "leere Suche" };
          setPhase("thinking", "Brain durchsuchen: „" + q + "“");
          return mcp.callTool("Dropbox", "search", { query: q, path: Core.BRAIN_PATH, max_results: Core.MAX_SEARCH_HITS }, { signal: ctx && ctx.signal || signal, cache: false })
            .then(function (res) {
              var hits = Core.parseSearchPayload(res && (res.payload !== undefined ? res.payload : res));
              call.searches = (call.searches || 0) + 1;
              call.hits += hits.length;
              emit("brain-search", { query: q, hits: hits.length });
              return hits.length ? { results: hits } : { results: [], note: "Keine Treffer im Brain für „" + q + "“. Anders formulieren oder zugeben, dass nichts drinsteht." };
            });
        }
      },
      {
        name: "brain_read",
        description: "Liest den Text einer Brain-Datei. id = die id aus brain_search (z.B. id:AbC…) oder ein Dropbox-Pfad. Max. " + Core.MAX_FILE_CHARS + " Zeichen.",
        inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        execute: function (input, ctx) {
          var id = String(input && input.id || "").trim();
          if (!id) throw new Error("id fehlt");
          setPhase("thinking", "Lese Brain-Datei…");
          return mcp.callTool("Dropbox", "fetch", { id: id }, { signal: ctx && ctx.signal || signal, cache: false })
            .then(function (res) {
              var f = Core.parseFetchPayload(res && (res.payload !== undefined ? res.payload : res));
              call.reads = (call.reads || 0) + 1;
              if (f.title) setPhase("thinking", "Gelesen: " + f.title);
              emit("brain-read", { id: id, title: f.title });
              return f.empty ? { note: "Datei leer oder nicht lesbar." } : { title: f.title, path: f.path, modified: f.modified, text: f.text };
            });
        }
      }
    ];
  }

  function askArtifact(history, text, signal) {
    var tools = rt.sampleTools ? brainTools(signal) : [];
    var input = Core.buildSampleInput(history, text, { brainAvailable: tools.length > 0 });
    var opts = { modelTier: "default", signal: signal, onText: function (u) { if (u && u.text) { call.partial = u.text; paintPartial(); } } };
    if (tools.length) opts.tools = tools;
    return rt.sample(input, opts).then(function (res) {
      return { text: (res && res.text || "").trim(), brain: tools.length > 0 };
    });
  }

  function askDirect(history, text, signal) {
    var keys = PhoneKeys.get();
    var messages = Core.buildTurns(history, text);
    var rounds = 0, hits = 0;
    function round() {
      var req = Core.buildApiRequest(history, text, { apiKey: keys.anthropic, dropboxToken: keys.dropboxToken, messages: messages });
      setPhase("thinking", rounds ? "Brain liest weiter…" : "Brain denkt…");
      return fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body), signal: signal })
        .then(function (r) { return r.json().then(function (j) { if (!r.ok && !j.error) throw new Error("HTTP " + r.status); return j; }); })
        .then(function (json) {
          var p = Core.parseApiResponse(json);
          if (p.isError) { var e = new Error(p.error); e.code = /rate|overload/i.test(p.error) ? "rate_limited" : "api_error"; throw e; }
          p.toolUses.forEach(function (u) { emit("brain-search", { query: JSON.stringify(u.input), hits: null }); });
          hits += p.searchHits;
          call.hits += p.searchHits;
          if (p.stopReason === "pause_turn" && rounds < 3) {
            rounds++;
            messages = messages.concat([{ role: "assistant", content: json.content }]);
            return round();
          }
          return { text: p.text, brain: true, usedBrain: p.usedBrain, searches: p.searches, hits: hits };
        });
    }
    return round();
  }

  function ask(history, text, signal) {
    if (call.transport.kind === "artifact") return askArtifact(history, text, signal);
    if (call.transport.kind === "direct") return askDirect(history, text, signal);
    var e = new Error("no transport"); e.code = "no_transport";
    return Promise.reject(e);
  }

  /* ---------- one turn ---------- */
  function handleUserText(rawText) {
    var text = Core.normalizeTranscript(rawText);
    if (!text || !call) return;
    stopListening();
    stopSpeaking();
    if (call.abort) { try { call.abort.abort(); } catch (e) {} }
    var before = call.history.filter(function (h) { return h.role === "user" || h.role === "assistant"; });
    pushTurn("user", text);
    if (navigator.onLine === false) return failSpoken("offline");
    if (call.transport.kind === "none") return failSpoken("no_transport");
    var ctl = new AbortController();
    call.abort = ctl;
    call.turnStart = Date.now();
    call.partial = "";
    var hitsBefore = call.hits;
    setPhase("thinking", "Brain denkt…");
    startTimer();
    ask(before, text, ctl.signal).then(function (res) {
      stopTimer();
      if (!call || ctl.signal.aborted) return;
      var answer = (res && res.text || "").trim();
      var hits = call.hits - hitsBefore;
      var meta = Core.turnMeta(call.turnStart, Date.now(), hits, call.tier.label, call.transport.kind);
      if (!answer) return failSpoken(hits === 0 && (call.searches || res.searches) ? "empty_brain" : "empty_answer");
      var searched = res.searches || (call.searches || 0);
      if (call.transport.kind === "artifact" && !res.brain) meta.noBrain = true;
      if (searched && hits === 0) meta.emptyBrain = true;
      pushTurn("assistant", answer, meta);
      var check = Core.speechCheck(answer);
      if (!check.ok) console.warn("[Brain-Telefon] answer not speech-friendly:", check.issues);
      setPhase("speaking", "Brain spricht…");
      return speak(answer).then(function () {
        if (!call || !call.active) return;
        if (call.phase === "speaking") startListening();
      });
    }).catch(function (err) {
      stopTimer();
      if (!call || ctl.signal.aborted) return;
      var kind = Core.classifyError(err, { online: navigator.onLine !== false });
      if (kind === "cancelled") return;
      console.warn("[Brain-Telefon] ask failed:", err);
      failSpoken(kind, err);
    });
  }

  // every failure → visible notice in the transcript AND spoken, then back to listening
  function failSpoken(kind, err) {
    if (!call) return;
    var m = Core.messageFor(kind);
    var detail = err && err.message && kind === "api_error" ? " (" + String(err.message).slice(0, 120) + ")" : "";
    pushNotice(m.visible + detail, kind === "empty_brain" || kind === "cancelled" ? "info" : "error");
    emit("error", { kind: kind, message: m.visible });
    setPhase("error", m.visible);
    var p = m.spoken ? speak(m.spoken) : Promise.resolve(false);
    p.then(function () {
      if (!call || !call.active) return;
      if (kind === "mic_denied" || kind === "mic_unavailable" || kind === "no_transport" || kind === "not_granted") {
        setPhase("idle-in-call", "Frage unten eintippen — oder auflegen.");
        return;
      }
      if (call.phase === "error") startListening();
    });
  }

  /* ---------- call control ---------- */
  function startCall() {
    if (call && call.active) return;
    call = newCall();
    call.active = true;
    setPhase("connecting", "Verbinde mit dem Brain…");
    resolveRuntime().then(function () {
      if (!call || !call.active) return;
      var e = env();
      call.tier = Core.chooseTier(e);
      call.transport = Core.chooseTransport(e);
      paintState();
      emit("call-start", { tier: call.tier, transport: call.transport });
      if (call.transport.kind === "artifact" && !rt.mcp) pushNotice(Core.messageFor("brain_unreachable").visible, "warn");
      if (call.transport.kind === "none") { failSpoken("no_transport"); return; }
      // warm up the system voice list (Safari loads voices lazily)
      if (hasSynth() && window.speechSynthesis.getVoices) window.speechSynthesis.getVoices();
      startListening();
    });
  }

  function hangUp() {
    if (!call) return;
    stopListening();
    stopSpeaking();
    stopTimer();
    if (call.abort) { try { call.abort.abort(); } catch (e) {} }
    var turns = call.history.filter(function (h) { return h.role === "assistant"; }).length;
    call.active = false;
    call.phase = "ended";
    call.status = "Aufgelegt · " + turns + (turns === 1 ? " Antwort" : " Antworten") + " · " + Math.round((Date.now() - call.startedAt) / 1000) + " s";
    paintState();
    emit("call-end", { turns: turns });
  }

  function interrupt() {   // tap while the brain speaks → stop and listen
    if (!call || !call.active) return;
    stopSpeaking();
    startListening();
  }

  /* ---------- timer for the "Brain denkt…" latency display ---------- */
  function startTimer() {
    stopTimer();
    call.timer = setInterval(function () {
      if (!call || call.phase !== "thinking") return;
      var s = ((Date.now() - call.turnStart) / 1000);
      if (ui.timer) ui.timer.textContent = s.toFixed(0) + " s";
    }, 250);
  }
  function stopTimer() { if (call && call.timer) { clearInterval(call.timer); call.timer = null; } if (ui.timer) ui.timer.textContent = ""; }

  /* ---------- rendering ---------- */
  function tierBadge() {
    var t = call ? call.tier : Core.chooseTier(env());
    var cls = t.label === "Pro" ? "pro" : (t.label === "Text" ? "text" : "basis");
    return '<span class="ph-tier ' + cls + '" title="STT: ' + esc(t.stt.engine + " — " + t.stt.reason) + ' · TTS: ' + esc(t.tts.engine + " — " + t.tts.reason) + '">' +
      '<b>' + esc(t.label) + '</b> <small>' + esc(t.stt.tier === "pro" ? "Whisper" : t.stt.tier === "basis" ? "Web Speech" : "Text") + ' · ' +
      esc(t.tts.tier === "pro" ? "ElevenLabs" : t.tts.tier === "basis" ? "System-Stimme" : "nur Text") + '</small></span>';
  }
  function transportBadge() {
    var tr = call ? call.transport : Core.chooseTransport(env());
    var cls = tr.kind === "none" ? "off" : (tr.brain === "none" ? "warn" : "on");
    return '<span class="ph-transport ' + cls + '">' + esc(tr.label) + '</span>';
  }

  function render(root) {
    root.innerHTML =
      '<div class="ph-wrap">' +
        '<div class="ph-head">' +
          '<h1 class="view-title">Brain-Telefon</h1>' +
          '<p class="view-sub">Ruf dein CLAUDE BRAIN an. Sprechen, zuhören, weiterreden — die Antwort kommt aus deiner Dropbox.</p>' +
        '</div>' +
        '<div class="ph-status-row" id="ph-badges"></div>' +
        '<div class="card ph-card">' +
          '<div class="ph-transcript" id="ph-transcript"></div>' +
          '<div class="ph-live" id="ph-live" hidden>' +
            '<div class="ph-pulse" id="ph-pulse"><span></span><span></span><span></span></div>' +
            '<div class="ph-live-text"><div class="ph-live-status" id="ph-live-status"></div><div class="ph-live-interim" id="ph-live-interim"></div><div class="ph-live-timer" id="ph-timer"></div></div>' +
          '</div>' +
        '</div>' +
        '<div class="ph-dock">' +
          '<form class="ph-type" id="ph-type-form" autocomplete="off">' +
            '<input id="ph-type" placeholder="…oder tippen statt sprechen" aria-label="Frage tippen">' +
            '<button type="submit" class="ghost" id="ph-type-send" title="Senden">↑</button>' +
          '</form>' +
          '<div class="ph-controls">' +
            '<button class="ph-side" id="ph-mic" title="Nochmal sprechen" hidden>🎙️<small>Sprechen</small></button>' +
            '<button class="ph-call" id="ph-call" aria-label="Anrufen"><span class="ph-call-icon">📞</span><span class="ph-call-label">Anrufen</span></button>' +
            '<button class="ph-side" id="ph-stop" title="Unterbrechen" hidden>✋<small>Stopp</small></button>' +
          '</div>' +
          '<div class="ph-hint" id="ph-hint">Tippen → sprechen (auch Schweizerdeutsch) → das Brain antwortet mit Stimme.</div>' +
        '</div>' +
      '</div>';

    ui = {
      badges: $("#ph-badges", root), transcript: $("#ph-transcript", root), live: $("#ph-live", root), pulse: $("#ph-pulse", root),
      liveStatus: $("#ph-live-status", root), interim: $("#ph-live-interim", root), timer: $("#ph-timer", root),
      call: $("#ph-call", root), mic: $("#ph-mic", root), stop: $("#ph-stop", root), hint: $("#ph-hint", root),
      form: $("#ph-type-form", root), input: $("#ph-type", root)
    };
    ui.call.onclick = function () { if (call && call.active) hangUp(); else startCall(); };
    ui.mic.onclick = function () {
      if (!call || !call.active) return startCall();
      if (call.phase === "listening" && call.recSend) return call.recSend();
      stopSpeaking(); startListening();
    };
    ui.stop.onclick = interrupt;
    ui.form.onsubmit = function (e) {
      e.preventDefault();
      var t = ui.input.value.trim();
      if (!t) return;
      ui.input.value = "";
      injectText(t);
    };
    resolveRuntime().then(paintState);
    paintState();
    paintTranscript();
  }

  function paintState() {
    if (!ui.call) return;
    var active = !!(call && call.active);
    var phase = call ? call.phase : "idle";
    ui.badges.innerHTML = tierBadge() + transportBadge();
    ui.call.classList.toggle("active", active);
    ui.call.querySelector(".ph-call-icon").textContent = active ? "📵" : "📞";
    ui.call.querySelector(".ph-call-label").textContent = active ? "Auflegen" : "Anrufen";
    ui.call.setAttribute("aria-label", active ? "Auflegen" : "Anrufen");
    ui.live.hidden = !active;
    ui.pulse.className = "ph-pulse " + phase;
    ui.liveStatus.textContent = call ? call.status : "";
    ui.mic.hidden = !active || phase === "listening" && call.tier.stt.tier !== "pro";
    ui.mic.innerHTML = active && phase === "listening" && call.tier.stt.tier === "pro" ? "✅<small>Fertig</small>" : "🎙️<small>Sprechen</small>";
    ui.stop.hidden = !(active && (phase === "speaking" || phase === "thinking"));
    ui.hint.textContent = !active
      ? (call && call.phase === "ended" ? call.status : "Tippen → sprechen (auch Schweizerdeutsch) → das Brain antwortet mit Stimme.")
      : phase === "listening" ? "Sprich jetzt. Pause = gesendet." + (call.tier.stt.tier === "pro" ? " Oder „Fertig“ tippen." : "")
      : phase === "thinking" ? "Das Brain sucht in der Dropbox…"
      : phase === "speaking" ? "Tipp auf Stopp, um zu unterbrechen."
      : phase === "connecting" ? "Verbinde…"
      : "Nochmal sprechen oder unten tippen.";
    document.body.classList.toggle("ph-in-call", active);
    paintInterim();
  }

  function paintInterim() {
    if (!ui.interim) return;
    ui.interim.textContent = call && call.phase === "listening" ? (call.interim || "") : "";
  }
  function paintPartial() {
    if (!ui.interim || !call) return;
    if (call.phase === "thinking" && call.partial) ui.interim.textContent = Core.toSpeech(call.partial).slice(-160);
  }
  function paintLevel() {
    if (!ui.pulse || !call) return;
    var lvl = Math.min(1, (call.level || 0) * 6);
    ui.pulse.style.setProperty("--lvl", (1 + lvl * 0.6).toFixed(2));
  }

  function paintTranscript() {
    if (!ui.transcript) return;
    if (!call || !call.history.length) {
      ui.transcript.innerHTML = '<div class="ph-empty">' +
        '<div class="ph-empty-icon">🧠</div>' +
        '<div><strong>Noch kein Gespräch.</strong><br>Frag zum Beispiel: „Was weiss das Brain über die ZHAW-Kampagne?“ oder „Was haben wir mit Säntis abgemacht?“</div></div>';
      return;
    }
    ui.transcript.innerHTML = call.history.map(function (h) {
      if (h.role === "notice") return '<div class="ph-notice ' + esc(h.kind) + '">' + esc(h.text) + '</div>';
      var meta = h.meta ? '<div class="ph-meta">' + esc(Core.fmtMeta(h.meta)) + (h.meta.emptyBrain ? ' · <em>ohne Brain-Treffer</em>' : '') + (h.meta.noBrain ? ' · <em>ohne Brain-Zugriff</em>' : '') + '</div>' : "";
      return '<div class="ph-bubble ' + h.role + '"><div class="ph-bubble-text">' + esc(h.text) + '</div>' + meta + '</div>';
    }).join("");
    ui.transcript.scrollTop = ui.transcript.scrollHeight;
  }

  /* ---------- public / test API ---------- */
  // text injection: same path as a spoken transcript (used by the typing field and the tests)
  function injectText(text) {
    if (!call || !call.active) {
      call = newCall();
      call.active = true;
      setPhase("connecting", "Verbinde mit dem Brain…");
      return resolveRuntime().then(function () {
        var e = env();
        call.tier = Core.chooseTier(e);
        call.transport = Core.chooseTransport(e);
        if (call.transport.kind === "artifact" && !rt.mcp) pushNotice(Core.messageFor("brain_unreachable").visible, "warn");
        paintState();
        emit("call-start", { tier: call.tier, transport: call.transport, typed: true });
        handleUserText(text);
      });
    }
    handleUserText(text);
    return Promise.resolve();
  }

  window.BrainPhone = {
    startCall: startCall, hangUp: hangUp, injectText: injectText, interrupt: interrupt,
    getState: function () { return call ? { phase: call.phase, active: call.active, history: call.history.slice(), tier: call.tier, transport: call.transport, hits: call.hits } : null; },
    onEvent: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    runtime: function () { return rt; },
    env: env,
    _resetForTest: function () { hangUp(); call = null; rt = { resolved: false, sample: null, mcp: null, sampleTools: false }; }
  };

  return { render: render };
})();
