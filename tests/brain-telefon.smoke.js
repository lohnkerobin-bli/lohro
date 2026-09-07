/* Headless smoke test for the Brain-Telefon.
   Run:  NODE_PATH=/opt/node22/lib/node_modules node tests/brain-telefon.smoke.js
   Drives dist/way-to-oscar.html via file:// in Chromium with a mocked artifact runtime
   (window.claude.use → sample + mcp), mocked SpeechRecognition and speechSynthesis.        */
"use strict";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const APP = "file://" + path.join(ROOT, "dist", "way-to-oscar.html");
const OUT = process.env.SMOKE_OUT || path.join(ROOT, "tests", ".out");
fs.mkdirSync(OUT, { recursive: true });

const SEARCH_HITS = {
  results: [
    { id: "id:AAA", title: "zhaw.md", path_display: "/KOLLEKTIV OSKAR/CLAUDE BRAIN/clients/zhaw.md", last_modified: "2026-08-20T11:53:57Z" },
    { id: "id:BBB", title: "2026-08-18_robin_zhaw-projekt-teammeeting.md", path_display: "/KOLLEKTIV OSKAR/CLAUDE BRAIN/meetings/2026-08-18_robin_zhaw-projekt-teammeeting.md" }
  ], has_more: false, total_results: 2
};
const FILE = { id: "id:AAA", title: "zhaw.md", text: "# ZHAW\n\nKein direkter Kunde. Auftraggeber ist kordial. Sie schneiden selbst.", metadata: { path_display: "/KOLLEKTIV OSKAR/CLAUDE BRAIN/clients/zhaw.md" } };
const ANSWER = "Die ZHAW ist nicht unser direkter Kunde, der Auftraggeber ist kordial. Wir liefern eine Shot-Library plus ein Template-Video, geschnitten wird bei der ZHAW selbst.";

// installed before any app script: fake artifact runtime + fake speech APIs, all recording into window.__mock
function initScript(scenario) {
  return `(() => {
    const S = ${JSON.stringify(scenario)};
    const M = window.__mock = { sampleCalls: [], mcpCalls: [], spoken: [], recognitions: [], scenario: S };
    const SEARCH = ${JSON.stringify(SEARCH_HITS)}, FILE = ${JSON.stringify(FILE)}, ANSWER = ${JSON.stringify(ANSWER)};
    const mcp = {
      async callTool(server, tool, input, opts) {
        M.mcpCalls.push({ server, tool, input });
        if (S.mcpError) { const e = { code: "server_not_connected", message: "Dropbox not connected" }; throw e; }
        if (tool === "search") return { content: [{ type: "text", text: JSON.stringify(S.emptyBrain ? { results: [], has_more: false } : SEARCH) }], payload: S.emptyBrain ? { results: [], has_more: false } : SEARCH };
        if (tool === "fetch") return { content: [{ type: "text", text: JSON.stringify(FILE) }], payload: FILE };
        throw { code: "not_in_manifest", message: tool };
      },
      async listTools() { return { servers: [{ server: "Dropbox", authStatus: "connected", tools: [{ name: "search" }, { name: "fetch" }] }] }; }
    };
    const sample = async function (input, opts) {
      M.sampleCalls.push({ input, hasTools: !!(opts && opts.tools), toolNames: (opts && opts.tools || []).map(t => t.name) });
      if (S.offlineDuringCall) { window.__setOnline(false); const e = new TypeError("Failed to fetch"); throw e; }
      if (S.apiError) { throw { code: "upstream_error", message: "Upstream 500 from the model" }; }
      if (S.notGranted) { throw { code: "not_granted", message: "not granted" }; }
      const tools = (opts && opts.tools) || [];
      let hits = 0, text;
      if (tools.length) {
        const search = tools.find(t => t.name === "brain_search"), read = tools.find(t => t.name === "brain_read");
        const r = await search.execute({ query: "ZHAW Kampagne" }, { signal: opts.signal });
        hits = (r.results || []).length;
        if (hits && read) await read.execute({ id: r.results[0].id }, { signal: opts.signal });
        text = hits ? ANSWER : "Dazu finde ich im Brain nichts. Meinst du ein anderes Projekt?";
      } else {
        text = "Ich habe gerade keinen Zugriff aufs Brain. Allgemein gesagt: frag mich später nochmal.";
      }
      if (opts && opts.onText) opts.onText({ text, delta: text });
      if (S.slowMs) await new Promise(r => setTimeout(r, S.slowMs));
      return { text, truncated: false, modelTierApplied: "default" };
    };
    sample.limits = async () => ({ maxPromptBytes: 200000, tools: { maxCount: 8 } });
    sample.json = async () => ({});
    window.claude = { use: async (name) => { await new Promise(r => setTimeout(r, 30)); if (name === "sample") return sample; if (name === "mcp") return S.noMcp ? null : mcp; return null; } };

    // network state
    let online = true;
    Object.defineProperty(navigator, "onLine", { get: () => online, configurable: true });
    window.__setOnline = (v) => { online = v; };
    if (S.offline) online = false;

    // speechSynthesis mock
    class Utt { constructor(t) { this.text = t; this.onend = null; this.onerror = null; } }
    Object.defineProperty(window, "SpeechSynthesisUtterance", { value: Utt, configurable: true, writable: true });
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      cancel() { M.cancelled = (M.cancelled || 0) + 1; },
      getVoices() { return [{ name: "Anna", lang: "de-CH" }, { name: "Google Deutsch", lang: "de-DE" }]; },
      speak(u) { M.spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 20); }
    } });

    // SpeechRecognition mock
    class Rec {
      constructor() { this.lang = ""; M.recognitions.push(this); }
      start() {
        M.started = (M.started || 0) + 1;
        const self = this;
        setTimeout(() => {
          if (S.micDenied) { self.onerror && self.onerror({ error: "not-allowed" }); self.onend && self.onend(); return; }
          if (S.transcript && !M.delivered) {
            M.delivered = true;
            self.onresult && self.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: S.transcript }], { isFinal: true })] });
            self.onend && self.onend();
          }
          // otherwise stay "listening" (no end) — the call sits open
        }, 40);
      }
      abort() { this.onend = null; this.onerror = null; }
      stop() { this.onend && this.onend(); }
    }
    window.SpeechRecognition = Rec;
    window.webkitSpeechRecognition = Rec;
  })();`;
}

const results = [];
function check(name, cond, detail) {
  results.push({ name, ok: !!cond, detail });
  console.log((cond ? "  ✓ " : "  ✗ ") + name + (cond ? "" : "  — " + (detail || "")));
}

async function newPage(browser, scenario, viewport) {
  const ctx = await browser.newContext({ viewport: viewport || { width: 1280, height: 900 }, deviceScaleFactor: viewport ? 2 : 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript(initScript(scenario));
  await page.goto(APP + "#/phone");
  await page.waitForSelector("#ph-call");
  return { page, ctx, errors };
}

const history = (page) => page.evaluate(() => window.BrainPhone.getState() && window.BrainPhone.getState().history.map(h => ({ role: h.role, text: h.text, kind: h.kind, meta: h.meta })));
const mock = (page) => page.evaluate(() => ({ spoken: window.__mock.spoken, sampleCalls: window.__mock.sampleCalls, mcpCalls: window.__mock.mcpCalls, started: window.__mock.started || 0 }));

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-fake-ui-for-media-stream"] });
  try {
    /* 1 — app loads, tab exists, button renders, full happy path with spoken transcript */
    {
      const { page, errors } = await newPage(browser, { transcript: "Was weiss das Brain über die ZHAW-Kampagne?" });
      check("tab 'Brain-Telefon' exists in nav", await page.locator('#main-nav a[data-route="phone"]').count() === 1);
      check("call button renders with 'Anrufen'", (await page.locator("#ph-call").textContent()).includes("Anrufen"));
      check("tier badge shows Basis before keys", (await page.locator(".ph-tier").textContent()).includes("Basis"));
      check("idle: side buttons and live strip are hidden (no stray controls)", await page.evaluate(() => ["ph-mic", "ph-stop", "ph-live"].every(id => getComputedStyle(document.getElementById(id)).display === "none")));
      await page.click("#ph-call");
      await page.waitForFunction(() => document.querySelector(".ph-bubble.assistant"), null, { timeout: 8000 });
      const h = await history(page), m = await mock(page);
      check("mic permission flow started recognition with de-CH", m.started >= 1 && await page.evaluate(() => window.__mock.recognitions[0].lang === "de-CH"));
      check("user transcript appears in the conversation", h.some(x => x.role === "user" && /ZHAW-Kampagne\?$/.test(x.text)), JSON.stringify(h));
      check("brain search ran through the Dropbox connector (search + fetch)", m.mcpCalls.some(c => c.tool === "search" && c.input.path === "/KOLLEKTIV OSKAR/CLAUDE BRAIN") && m.mcpCalls.some(c => c.tool === "fetch"), JSON.stringify(m.mcpCalls));
      check("sample was called with brain tools", m.sampleCalls.length === 1 && m.sampleCalls[0].toolNames.join() === "brain_search,brain_read");
      check("system instruction rides in the first user turn", m.sampleCalls[0].input[0].content.includes("CLAUDE BRAIN") && m.sampleCalls[0].input[0].content.includes("Robin sagt:"));
      const a = h.find(x => x.role === "assistant");
      check("assistant answer appears in the conversation with meta (hits + latency)", a && a.text === ANSWER && a.meta && a.meta.hits === 2 && a.meta.ms >= 0, JSON.stringify(a));
      check("TTS was called with the (markdown-free) answer", m.spoken.length >= 1 && m.spoken.join(" ").includes("Die ZHAW ist nicht unser direkter Kunde"), JSON.stringify(m.spoken));
      check("call resumes listening after speaking (phone feel)", await page.waitForFunction(() => window.BrainPhone.getState().phase === "listening", null, { timeout: 4000 }).then(() => true).catch(() => false));
      check("button switched to 'Auflegen' during the call", (await page.locator("#ph-call").textContent()).includes("Auflegen"));
      await page.screenshot({ path: path.join(OUT, "01-happy-desktop.png") });
      await page.click("#ph-call");
      check("hang up ends the call and restores 'Anrufen'", (await page.locator("#ph-call").textContent()).includes("Anrufen") && await page.evaluate(() => window.BrainPhone.getState().active === false));
      check("no page errors in happy path", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 2 — text injection instead of mic, multi-turn history is resent */
    {
      const { page, errors } = await newPage(browser, {});
      await page.fill("#ph-type", "Was weiss das Brain über die ZHAW-Kampagne?");
      await page.press("#ph-type", "Enter");
      await page.waitForFunction(() => document.querySelectorAll(".ph-bubble.assistant").length === 1, null, { timeout: 8000 });
      await page.fill("#ph-type", "Und wer ist dort die Ansprechperson?");
      await page.press("#ph-type", "Enter");
      await page.waitForFunction(() => document.querySelectorAll(".ph-bubble.assistant").length === 2, null, { timeout: 8000 });
      const m = await mock(page);
      const second = m.sampleCalls[1].input;
      check("typed question starts a call and gets an answer", m.sampleCalls.length === 2);
      check("second turn resends full history (user, assistant, user) — API is stateless", second.length === 3 && second[0].role === "user" && second[1].role === "assistant" && second[2].content === "Und wer ist dort die Ansprechperson?", JSON.stringify(second.map(t => t.role)));
      check("no page errors in text injection", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 3 — error: microphone denied */
    {
      const { page, errors } = await newPage(browser, { micDenied: true });
      await page.click("#ph-call");
      await page.waitForSelector(".ph-notice.error", { timeout: 6000 });
      const h = await history(page), m = await mock(page);
      check("mic denied → visible notice", h.some(x => x.role === "notice" && /Mikrofon blockiert/.test(x.text)), JSON.stringify(h));
      check("mic denied → spoken notice", m.spoken.some(t => /Mikrofon ist blockiert/.test(t)), JSON.stringify(m.spoken));
      check("mic denied → call stays open for typing", await page.evaluate(() => window.BrainPhone.getState().active === true && !document.getElementById("ph-type").disabled));
      check("no page errors (mic denied)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 4 — error: API failure */
    {
      const { page, errors } = await newPage(browser, { apiError: true });
      await page.fill("#ph-type", "Testfrage");
      await page.press("#ph-type", "Enter");
      await page.waitForSelector(".ph-notice.error", { timeout: 6000 });
      const h = await history(page), m = await mock(page);
      check("API error → visible notice", h.some(x => x.role === "notice" && /Brain-Anfrage fehlgeschlagen/.test(x.text)), JSON.stringify(h));
      check("API error → spoken notice", m.spoken.some(t => /antwortet gerade nicht/.test(t)), JSON.stringify(m.spoken));
      check("no page errors (API error)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 5 — empty brain search */
    {
      const { page, errors } = await newPage(browser, { emptyBrain: true });
      await page.fill("#ph-type", "Was weiss das Brain über Quantenphysik?");
      await page.press("#ph-type", "Enter");
      await page.waitForFunction(() => document.querySelector(".ph-bubble.assistant"), null, { timeout: 8000 });
      const h = await history(page), m = await mock(page);
      const a = h.find(x => x.role === "assistant");
      check("empty brain → honest spoken answer + '0 Brain-Treffer' meta", a && /finde ich im Brain nichts/.test(a.text) && a.meta.hits === 0 && a.meta.emptyBrain === true && (await page.locator(".ph-meta").textContent()).includes("0 Brain-Treffer"), JSON.stringify(a));
      check("empty brain → spoken", m.spoken.some(t => /nichts/.test(t)));
      check("no page errors (empty brain)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 6 — network drops mid-conversation */
    {
      const { page, errors } = await newPage(browser, {});
      await page.fill("#ph-type", "Erste Frage zur ZHAW");
      await page.press("#ph-type", "Enter");
      await page.waitForFunction(() => document.querySelectorAll(".ph-bubble.assistant").length === 1, null, { timeout: 8000 });
      await page.evaluate(() => window.__setOnline(false));
      await page.fill("#ph-type", "Zweite Frage");
      await page.press("#ph-type", "Enter");
      await page.waitForSelector(".ph-notice.error", { timeout: 6000 });
      const h = await history(page), m = await mock(page);
      check("offline mid-call → visible notice", h.some(x => x.role === "notice" && /Keine Internetverbindung/.test(x.text)), JSON.stringify(h));
      check("offline mid-call → spoken notice", m.spoken.some(t => /Verbindung ist weg/.test(t)), JSON.stringify(m.spoken));
      check("offline mid-call → no request sent", m.sampleCalls.length === 1);
      check("no page errors (offline)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 6b — network dies while the request is in flight (fetch rejects) */
    {
      const { page, errors } = await newPage(browser, { offlineDuringCall: true });
      await page.fill("#ph-type", "Frage während Netz wegbricht");
      await page.press("#ph-type", "Enter");
      await page.waitForSelector(".ph-notice.error", { timeout: 6000 });
      const h = await history(page);
      check("fetch failure in flight → classified as offline, visible + spoken", h.some(x => x.role === "notice" && /Keine Internetverbindung/.test(x.text)) && (await mock(page)).spoken.some(t => /Verbindung ist weg/.test(t)), JSON.stringify(h));
      check("no page errors (in-flight failure)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 7 — Dropbox connector missing: answers without brain, says so */
    {
      const { page, errors } = await newPage(browser, { noMcp: true });
      await page.fill("#ph-type", "Frage ohne Brain");
      await page.press("#ph-type", "Enter");
      await page.waitForFunction(() => document.querySelector(".ph-bubble.assistant"), null, { timeout: 8000 });
      const h = await history(page), m = await mock(page);
      check("no Dropbox → warning notice + sample without tools + transport badge warns", h.some(x => x.role === "notice" && /Dropbox-Connector nicht verbunden/.test(x.text)) && m.sampleCalls[0].hasTools === false && (await page.locator(".ph-transport").textContent()).includes("ohne Brain"), JSON.stringify(h));
      check("no page errors (no mcp)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 8 — tier fallback both directions: keys → Pro (local), keys inside artifact → Basis, remove keys → Basis */
    {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      // plain file (no artifact runtime) with keys → Pro
      await page.addInitScript(() => { try { localStorage.setItem("zentrale-brain-phone-keys-v1", JSON.stringify({ openai: "sk-test-openai", eleven: "xi-test-eleven", anthropic: "sk-ant-test" })); } catch (e) {} window.MediaRecorder = window.MediaRecorder || function () {}; });
      await page.goto(APP + "#/phone");
      await page.waitForSelector(".ph-tier");
      check("keys present + plain file → Pro tier (Whisper · ElevenLabs) + direct API transport", (await page.locator(".ph-tier").textContent()).includes("Pro") && (await page.locator(".ph-tier").textContent()).includes("Whisper") && (await page.locator(".ph-transport").textContent()).includes("Direkte API"));
      // export must never contain keys
      const exp = await page.evaluate(() => JSON.stringify(Store.exportSnapshot()));
      check("JSON export contains no key material", !/sk-test-openai|xi-test-eleven|sk-ant-test/.test(exp));
      // remove keys via settings → Basis
      await page.goto(APP + "#/settings");
      await page.waitForSelector("#k-clear");
      check("settings show key fields as password inputs", await page.evaluate(() => document.getElementById("k-openai").type === "password" && document.getElementById("k-eleven").type === "password"));
      await page.click("#k-clear");
      await page.goto(APP + "#/phone");
      await page.waitForSelector(".ph-tier");
      check("keys removed → Basis tier", (await page.locator(".ph-tier").textContent()).includes("Basis"));
      // add a key through the settings form → Pro again
      await page.goto(APP + "#/settings");
      await page.fill("#k-openai", "sk-again");
      await page.click("#k-save");
      await page.goto(APP + "#/phone");
      await page.waitForSelector(".ph-tier");
      check("key added via Settings → Pro again", (await page.locator(".ph-tier").textContent()).includes("Pro"));
      check("no page errors (tier switching)", errors.length === 0, errors.join(" | "));
      await ctx.close();

      // keys inside the artifact sandbox → Basis with reason, still works end-to-end
      const { page: p2, errors: e2 } = await (async () => {
        const c = await browser.newContext(); const p = await c.newPage(); const errs = [];
        p.on("pageerror", e => errs.push(String(e)));
        await p.addInitScript(() => { try { localStorage.setItem("zentrale-brain-phone-keys-v1", JSON.stringify({ openai: "sk-test-openai", eleven: "xi-test-eleven" })); } catch (e) {} });
        await p.addInitScript(initScript({}));
        await p.goto(APP + "#/phone"); await p.waitForSelector("#ph-call");
        return { page: p, errors: errs };
      })();
      await p2.fill("#ph-type", "ZHAW?");
      await p2.press("#ph-type", "Enter");
      await p2.waitForFunction(() => document.querySelector(".ph-bubble.assistant"), null, { timeout: 8000 });
      const badge = await p2.locator(".ph-tier").textContent();
      const title = await p2.locator(".ph-tier").getAttribute("title");
      check("keys inside artifact → falls back to Basis (sandbox blocks external hosts), answer still spoken", badge.includes("Basis") && /Sandbox/.test(title) && (await mock(p2)).spoken.length >= 1, badge + " / " + title);
      check("no page errors (artifact + keys)", e2.length === 0, e2.join(" | "));
      await p2.context().close();
    }

    /* 9 — iPhone viewport 390px: thumb-friendly, no horizontal scroll, latency indicator visible */
    {
      const { page, errors } = await newPage(browser, { slowMs: 900 }, { width: 390, height: 844 });
      const btn = await page.locator("#ph-call").boundingBox();
      check("390px: call button is big (≥ 80px) and centred in the lower half", btn && btn.width >= 80 && btn.height >= 80 && Math.abs((btn.x + btn.width / 2) - 195) < 12 && btn.y > 400, JSON.stringify(btn));
      check("390px: no horizontal page scroll", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      await page.screenshot({ path: path.join(OUT, "02-iphone-idle.png") });
      await page.fill("#ph-type", "Was weiss das Brain über die ZHAW-Kampagne?");
      await page.press("#ph-type", "Enter");
      await page.waitForFunction(() => window.BrainPhone.getState() && window.BrainPhone.getState().phase === "thinking", null, { timeout: 4000 });
      await page.waitForTimeout(350);
      const status = await page.locator("#ph-live-status").textContent();
      const pulseClass = await page.locator("#ph-pulse").getAttribute("class");
      const timer = await page.locator("#ph-timer").textContent();
      check("latency display while waiting: 'Brain …' status + thinking pulse + seconds", /Brain|Gelesen/.test(status) && /thinking/.test(pulseClass) && /\d+ s/.test(timer), status + " / " + pulseClass + " / " + timer);
      await page.screenshot({ path: path.join(OUT, "03-iphone-thinking.png") });
      await page.waitForFunction(() => document.querySelector(".ph-bubble.assistant"), null, { timeout: 8000 });
      await page.waitForTimeout(200);
      await page.screenshot({ path: path.join(OUT, "04-iphone-answer.png") });
      check("390px: still no horizontal scroll with transcript", await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
      const geo = await page.evaluate(() => {
        const r = id => document.getElementById(id).getBoundingClientRect();
        const live = r("ph-live"), input = r("ph-type"), call = r("ph-call");
        return { liveBottom: live.bottom, inputTop: input.top, callBottom: call.bottom, inner: window.innerHeight, scrollH: document.documentElement.scrollHeight };
      });
      check("390px: live strip does not overlap the dock and the phone fits one screen", geo.liveBottom <= geo.inputTop + 1 && geo.callBottom <= geo.inner && geo.scrollH <= geo.inner + 2, JSON.stringify(geo));
      check("no page errors (iPhone)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 9b — long wait: filler line spoken once after ~7 s, then the real answer replaces it */
    {
      const { page, errors } = await newPage(browser, { slowMs: 8200 });
      await page.fill("#ph-type", "Langsame Frage");
      await page.press("#ph-type", "Enter");
      await page.waitForFunction(() => window.__mock.spoken.filter(t => t.trim()).length >= 1, null, { timeout: 12000 });
      const spokenEarly = await page.evaluate(() => window.__mock.spoken.filter(t => t.trim()));
      await page.waitForFunction(() => document.querySelector(".ph-bubble.assistant"), null, { timeout: 12000 });
      await page.waitForTimeout(100);
      const m = await mock(page);
      m.spoken = m.spoken.filter(t => t.trim());   // the silent iOS unlock utterance is not speech
      check("long wait → one spoken filler ('Moment…') before the answer, answer spoken after", /Moment|Sekunde|Augenblick/.test(spokenEarly[0]) && m.spoken.filter(t => /Moment|Sekunde|Augenblick/.test(t)).length === 1 && /ZHAW/.test(m.spoken[m.spoken.length - 1]), JSON.stringify(m.spoken));
      check("no page errors (filler)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 9c — Stopp while thinking aborts the request; leaving the tab hangs up */
    {
      const { page, errors } = await newPage(browser, { slowMs: 3000 });
      await page.fill("#ph-type", "Frage, die ich abbreche");
      await page.press("#ph-type", "Enter");
      await page.waitForFunction(() => window.BrainPhone.getState() && window.BrainPhone.getState().phase === "thinking", null, { timeout: 4000 });
      check("thinking: mic button hidden, Stopp visible", await page.evaluate(() => getComputedStyle(document.getElementById("ph-mic")).display === "none" && getComputedStyle(document.getElementById("ph-stop")).display !== "none"));
      await page.click("#ph-stop");
      await page.waitForTimeout(3500);
      const h = await history(page);
      check("Stopp while thinking → aborted notice, no answer bubble arrives later, back to listening", h.some(x => x.role === "notice" && /abgebrochen/i.test(x.text)) && !h.some(x => x.role === "assistant") && (await page.evaluate(() => window.BrainPhone.getState().phase)) === "listening", JSON.stringify(h));
      await page.evaluate(() => { location.hash = "#/dashboard"; });
      await page.waitForTimeout(150);
      check("navigating away hangs up (mic never keeps running in the background)", await page.evaluate(() => window.BrainPhone.getState().active === false && !document.body.classList.contains("ph-in-call")));
      check("no page errors (abort / navigate)", errors.length === 0, errors.join(" | "));
      await page.context().close();
    }

    /* 10 — other views still render (regression) */
    {
      const ctx = await browser.newContext(); const page = await ctx.newPage(); const errors = [];
      page.on("pageerror", e => errors.push(String(e)));
      for (const r of ["dashboard", "films", "ideas", "extern", "brain", "settings", "phone"]) {
        await page.goto(APP + "#/" + r);
        await page.waitForSelector("#view h1, #view .hero-greeting", { timeout: 5000 });
      }
      check("all main views render without page errors", errors.length === 0, errors.join(" | "));
      await ctx.close();
    }
  } finally {
    await browser.close();
  }
  const failed = results.filter(r => !r.ok);
  console.log("\n" + (results.length - failed.length) + "/" + results.length + " smoke checks passed" + (failed.length ? " — FAILED: " + failed.map(f => f.name).join("; ") : ""));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
