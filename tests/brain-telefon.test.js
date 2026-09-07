/* Unit tests for the Brain-Telefon pure logic.  Run:  node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../js/brain-telefon-core.js");

/* ---------- conversation building ---------- */
test("buildTurns: alternates strictly and ends on the new user text", () => {
  const history = [
    { role: "user", text: "Hallo Brain" },
    { role: "assistant", text: "Hallo Robin" },
    { role: "notice", text: "ignored" },
    { role: "user", text: "Erste Frage" },
    { role: "user", text: "Nachtrag" },        // two user turns in a row → merged
    { role: "assistant", text: "Antwort" }
  ];
  const turns = Core.buildTurns(history, "Neue Frage");
  assert.deepEqual(turns.map(t => t.role), ["user", "assistant", "user", "assistant", "user"]);
  assert.equal(turns[2].content, "Erste Frage\nNachtrag");
  assert.equal(turns[4].content, "Neue Frage");
});

test("buildTurns: history starting with an assistant turn is dropped until a user turn", () => {
  const turns = Core.buildTurns([{ role: "assistant", text: "Ich bin da" }], "Frage");
  assert.deepEqual(turns, [{ role: "user", content: "Frage" }]);
});

test("trimHistory keeps the newest turns under the char budget and starts on user", () => {
  const h = [];
  for (let i = 0; i < 40; i++) h.push({ role: i % 2 ? "assistant" : "user", text: "x".repeat(1000) + i });
  const t = Core.trimHistory(h, 5000);
  assert.ok(t.length <= 6 && t.length >= 4);
  assert.equal(t[0].role, "user");
  assert.equal(t[t.length - 1].text.slice(-2), "39");
});

test("buildSampleInput carries the system instruction in the first user turn only", () => {
  const turns = Core.buildSampleInput([{ role: "user", text: "A" }, { role: "assistant", text: "B" }], "C");
  assert.equal(turns.length, 3);
  assert.match(turns[0].content, /CLAUDE BRAIN/);
  assert.match(turns[0].content, /brain_search/);
  assert.match(turns[0].content, /Robin sagt: A$/);
  assert.equal(turns[2].content, "C");
  assert.doesNotMatch(turns[2].content, /CLAUDE BRAIN/);
});

test("buildSampleInput without brain access tells the model so", () => {
  const turns = Core.buildSampleInput([], "Frage", { brainAvailable: false });
  assert.match(turns[0].content, /KEINEN Zugriff/);
  assert.doesNotMatch(turns[0].content, /brain_search/);
});

test("buildApiRequest: Sonnet 4.6, Dropbox MCP server + mcp_toolset, beta header, no key leaks into body", () => {
  const req = Core.buildApiRequest([{ role: "user", text: "Hi" }, { role: "assistant", text: "Hoi" }], "Was läuft?", { apiKey: "sk-ant-test", dropboxToken: "dbx-token" });
  assert.equal(req.url, "https://api.anthropic.com/v1/messages");
  assert.equal(req.body.model, "claude-sonnet-4-6");
  assert.equal(req.headers["anthropic-beta"], "mcp-client-2025-11-20");
  assert.equal(req.headers["x-api-key"], "sk-ant-test");
  assert.equal(req.headers["anthropic-dangerous-direct-browser-access"], "true");
  assert.deepEqual(req.body.mcp_servers[0].url, "https://mcp.dropbox.com/claude_app_mcp");
  assert.equal(req.body.mcp_servers[0].name, "dropbox");
  assert.equal(req.body.mcp_servers[0].authorization_token, "dbx-token");
  assert.deepEqual(req.body.tools, [{ type: "mcp_toolset", mcp_server_name: "dropbox" }]);
  assert.equal(req.body.messages.length, 3);
  assert.match(req.body.system, /VORGELESEN/);
  assert.doesNotMatch(JSON.stringify(req.body), /sk-ant-test/);
});

/* ---------- response parsing by block type ---------- */
const SEARCH_JSON = JSON.stringify({
  results: [
    { id: "id:AAA", title: "zhaw.md", path_display: "/KOLLEKTIV OSKAR/CLAUDE BRAIN/clients/zhaw.md", last_modified: "2026-08-20T11:53:57Z", match_type: "BOTH_FILENAME_AND_CONTENT" },
    { id: "id:BBB", title: "2026-08-18_robin_zhaw-projekt-teammeeting.md", path_display: "/KOLLEKTIV OSKAR/CLAUDE BRAIN/meetings/2026-08-18_robin_zhaw-projekt-teammeeting.md" }
  ], has_more: false, total_results: 2
});

test("parseApiResponse: text, mcp_tool_use and mcp_tool_result blocks dispatched by type", () => {
  const p = Core.parseApiResponse({
    id: "msg_1", stop_reason: "end_turn",
    content: [
      { type: "mcp_tool_use", id: "tu_1", name: "search", server_name: "dropbox", input: { query: "ZHAW" } },
      { type: "mcp_tool_result", tool_use_id: "tu_1", is_error: false, content: [{ type: "text", text: SEARCH_JSON }] },
      { type: "mcp_tool_use", id: "tu_2", name: "fetch", server_name: "dropbox", input: { id: "id:AAA" } },
      { type: "mcp_tool_result", tool_use_id: "tu_2", is_error: false, content: [{ type: "text", text: JSON.stringify({ title: "zhaw.md", text: "ZHAW ist Endkunde von kordial." }) }] },
      { type: "thinking", thinking: "" },
      { type: "text", text: "Die ZHAW ist nicht unser direkter Kunde, " },
      { type: "text", text: "der Auftraggeber ist kordial." }
    ]
  });
  assert.equal(p.isError, false);
  assert.equal(p.stopReason, "end_turn");
  assert.equal(p.toolUses.length, 2);
  assert.equal(p.toolResults.length, 2);
  assert.equal(p.searches, 1);
  assert.equal(p.searchHits, 2);
  assert.equal(p.usedBrain, true);
  assert.match(p.text, /^Die ZHAW ist nicht unser direkter Kunde/);
  assert.match(p.text, /kordial\.$/);
});

test("parseApiResponse: empty brain search counts zero hits", () => {
  const p = Core.parseApiResponse({
    content: [
      { type: "mcp_tool_use", id: "tu_1", name: "search", server_name: "dropbox", input: { query: "Quantenphysik" } },
      { type: "mcp_tool_result", tool_use_id: "tu_1", content: [{ type: "text", text: JSON.stringify({ results: [], has_more: false }) }] },
      { type: "text", text: "Dazu finde ich nichts im Brain." }
    ]
  });
  assert.equal(p.searches, 1);
  assert.equal(p.searchHits, 0);
  assert.equal(p.text, "Dazu finde ich nichts im Brain.");
});

test("parseApiResponse: API error object is reported, never thrown", () => {
  const p = Core.parseApiResponse({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } });
  assert.equal(p.isError, true);
  assert.equal(p.error, "Overloaded");
  assert.equal(Core.parseApiResponse(null).isError, true);
  assert.equal(Core.parseApiResponse({ content: [] }).text, "");
});

test("extractMcpToolResult handles string, array and object content", () => {
  assert.equal(Core.extractMcpToolResult({ content: "plain" }), "plain");
  assert.equal(Core.extractMcpToolResult({ content: [{ type: "text", text: "a" }, { type: "image" }, { type: "text", text: "b" }] }), "a\nb");
  assert.equal(Core.extractMcpToolResult({ content: { text: "obj" } }), "obj");
  assert.equal(Core.extractMcpToolResult(null), "");
});

/* ---------- Dropbox payload shapes (observed from the real connector) ---------- */
test("parseSearchPayload: observed Dropbox MCP shape (object, JSON string, wrapped content)", () => {
  const fromObj = Core.parseSearchPayload(JSON.parse(SEARCH_JSON));
  assert.equal(fromObj.length, 2);
  assert.equal(fromObj[0].id, "id:AAA");
  assert.equal(fromObj[0].title, "zhaw.md");
  assert.equal(fromObj[0].path, "/KOLLEKTIV OSKAR/CLAUDE BRAIN/clients/zhaw.md");
  assert.deepEqual(Core.parseSearchPayload(SEARCH_JSON)[1].id, "id:BBB");
  assert.equal(Core.parseSearchPayload({ content: [{ type: "text", text: SEARCH_JSON }] }).length, 2);
  assert.deepEqual(Core.parseSearchPayload({ results: [] }), []);
  assert.deepEqual(Core.parseSearchPayload("not json"), []);
  assert.deepEqual(Core.parseSearchPayload(null), []);
});

test("parseSearchPayload caps hits at MAX_SEARCH_HITS", () => {
  const many = { results: Array.from({ length: 30 }, (_, i) => ({ id: "id:" + i, title: "f" + i + ".md" })) };
  assert.equal(Core.parseSearchPayload(many).length, Core.MAX_SEARCH_HITS);
});

test("parseFetchPayload: observed shape, truncation and empty detection", () => {
  const f = Core.parseFetchPayload({ id: "id:AAA", title: "zhaw.md", text: "Hallo ".repeat(2000), metadata: { path_display: "/x/zhaw.md", server_modified: "2026-08-20T11:53:57Z" } }, 500);
  assert.equal(f.title, "zhaw.md");
  assert.equal(f.path, "/x/zhaw.md");
  assert.equal(f.truncated, true);
  assert.ok(f.text.length < 560);
  assert.match(f.text, /gekürzt/);
  assert.equal(Core.parseFetchPayload({ title: "leer", text: "   " }).empty, true);
  assert.equal(Core.parseFetchPayload(JSON.stringify({ title: "s", text: "json string" })).text, "json string");
});

/* ---------- speech ---------- */
test("toSpeech strips markdown, lists, links and headings", () => {
  const md = "## Antwort\n\n**Die ZHAW** ist *kein* direkter Kunde.\n- Auftraggeber: kordial\n- Dreh: August\n\nMehr: [Brain](https://dropbox.com/x) https://foo.bar/baz";
  const s = Core.toSpeech(md);
  assert.doesNotMatch(s, /[*#\[\]]/);
  assert.doesNotMatch(s, /https?:/);
  assert.match(s, /Die ZHAW ist kein direkter Kunde/);
  assert.match(s, /Auftraggeber: kordial/);
});

test("speechChunks splits long answers on sentence boundaries", () => {
  const long = Array.from({ length: 12 }, (_, i) => "Das ist Satz Nummer " + (i + 1) + " mit etwas Text drin.").join(" ");
  const chunks = Core.speechChunks(long, 120);
  assert.ok(chunks.length >= 4);
  chunks.forEach(c => { assert.ok(c.length <= 130); assert.match(c, /\.$/); });
  assert.equal(chunks.join(" "), Core.toSpeech(long));
  assert.deepEqual(Core.speechChunks(""), []);
});

test("speechCheck accepts a short spoken answer and flags markdown / lists / length", () => {
  assert.equal(Core.speechCheck("Die ZHAW ist Endkunde von kordial. Dreh war im August, Veröffentlichung ab 2027.").ok, true);
  const bad = Core.speechCheck("**Fazit**\n- eins\n- zwei\nhttps://x.y");
  assert.equal(bad.ok, false);
  assert.ok(bad.issues.includes("list") && bad.issues.includes("markdown") && bad.issues.includes("url"));
  const long = Core.speechCheck("Satz. ".repeat(9));
  assert.ok(long.issues.some(i => i.startsWith("too_long")));
});

test("normalizeTranscript capitalises and punctuates questions", () => {
  assert.equal(Core.normalizeTranscript("  was weiss das brain über die zhaw kampagne "), "Was weiss das brain über die zhaw kampagne?");
  assert.equal(Core.normalizeTranscript("merk dir das"), "Merk dir das.");
  assert.equal(Core.normalizeTranscript("Fertig!"), "Fertig!");
  assert.equal(Core.normalizeTranscript(""), "");
});

/* ---------- tier decision (Basis ↔ Pro fallback) ---------- */
test("chooseTier: no keys → Basis; keys + external fetch → Pro; keys inside artifact sandbox → Basis with reason", () => {
  const basis = Core.chooseTier({ hasWebSpeech: true, hasSynth: true });
  assert.equal(basis.label, "Basis");
  assert.equal(basis.stt.engine, "web-speech");
  assert.equal(basis.tts.engine, "speech-synthesis");

  const pro = Core.chooseTier({ openaiKey: "sk", elevenKey: "xi", canExternalFetch: true, hasMediaRecorder: true });
  assert.equal(pro.label, "Pro");
  assert.equal(pro.stt.engine, "whisper-1");
  assert.equal(pro.tts.engine, "elevenlabs");

  const sandboxed = Core.chooseTier({ openaiKey: "sk", elevenKey: "xi", canExternalFetch: false, hasWebSpeech: true, hasSynth: true });
  assert.equal(sandboxed.label, "Basis");
  assert.match(sandboxed.stt.reason, /Sandbox/);
  assert.match(sandboxed.tts.reason, /Sandbox/);

  const mixed = Core.chooseTier({ openaiKey: "sk", canExternalFetch: true, hasMediaRecorder: true, hasSynth: true });
  assert.equal(mixed.stt.tier, "pro");
  assert.equal(mixed.tts.tier, "basis");
  assert.equal(mixed.label, "Pro");
});

test("chooseTier: browser without speech APIs → Text tier, never a crash", () => {
  const t = Core.chooseTier({ hasWebSpeech: false, hasSynth: false });
  assert.equal(t.label, "Text");
  assert.equal(t.stt.tier, "none");
  assert.equal(t.tts.tier, "none");
});

test("fallbackTier steps Pro → Basis → Text for STT and TTS", () => {
  const s1 = Core.fallbackTier({ tier: "pro", engine: "whisper-1" }, "stt", { hasWebSpeech: true });
  assert.equal(s1.tier, "basis"); assert.equal(s1.fellBack, true);
  const s2 = Core.fallbackTier(s1, "stt", { hasWebSpeech: true });
  assert.equal(s2.tier, "none");
  const s3 = Core.fallbackTier({ tier: "pro", engine: "whisper-1" }, "stt", { hasWebSpeech: false });
  assert.equal(s3.tier, "none");
  const t1 = Core.fallbackTier({ tier: "pro", engine: "elevenlabs" }, "tts", { hasSynth: true });
  assert.equal(t1.engine, "speech-synthesis");
  assert.equal(Core.fallbackTier(t1, "tts", {}).tier, "none");
});

test("chooseTransport prefers the artifact runtime, then a direct key, else none", () => {
  assert.equal(Core.chooseTransport({ hasSample: true, hasMcp: true }).kind, "artifact");
  assert.equal(Core.chooseTransport({ hasSample: true, hasMcp: false }).brain, "none");
  assert.equal(Core.chooseTransport({ hasSample: false, anthropicKey: "k" }).kind, "direct");
  assert.equal(Core.chooseTransport({}).kind, "none");
});

/* ---------- error classification: the four required failure cases + friends ---------- */
test("classifyError maps mic denial, API failure, offline and empty answers to spoken+visible messages", () => {
  assert.equal(Core.classifyError({ code: "not-allowed" }), "mic_denied");
  assert.equal(Core.classifyError({ name: "NotAllowedError", message: "Permission denied" }), "mic_denied");
  assert.equal(Core.classifyError({ code: "audio-capture" }), "mic_unavailable");
  assert.equal(Core.classifyError(new Error("boom"), { online: false }), "offline");
  assert.equal(Core.classifyError(new TypeError("Failed to fetch")), "offline");
  assert.equal(Core.classifyError({ code: "network" }), "offline");
  assert.equal(Core.classifyError({ code: "upstream_error", message: "500" }), "api_error");
  assert.equal(Core.classifyError({ code: "rate_limited" }), "rate_limited");
  assert.equal(Core.classifyError(new Error("HTTP 429 rate limit")), "rate_limited");
  assert.equal(Core.classifyError({ code: "not_granted" }), "not_granted");
  assert.equal(Core.classifyError({ code: "cancelled" }), "cancelled");
  assert.equal(Core.classifyError({ code: "empty_completion" }), "empty_answer");
  assert.equal(Core.classifyError(null), "api_error");
  ["mic_denied", "api_error", "empty_brain", "offline", "no_transport", "not_granted", "rate_limited", "empty_answer", "brain_unreachable"].forEach(k => {
    const m = Core.messageFor(k);
    assert.ok(m.spoken.length > 20, k + " spoken");
    assert.ok(m.visible.length > 10, k + " visible");
    assert.equal(Core.speechCheck(m.spoken).ok, true, k + " spoken message must itself be speakable");
  });
});

test("turnMeta / fmtMeta produce the transcript footer", () => {
  const m = Core.turnMeta(1000, 5200, 3, "Basis", "artifact");
  assert.equal(m.ms, 4200);
  assert.equal(Core.fmtMeta(m), "3 Brain-Dateien · 4.2 s · Basis");
  assert.equal(Core.fmtMeta(Core.turnMeta(0, 0, 0, "Pro")), "0 Brain-Treffer · Pro");
});
