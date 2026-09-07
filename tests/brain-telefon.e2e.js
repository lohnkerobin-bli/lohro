/* Real end-to-end run against the Messages API — text injection instead of a microphone.
   Needs:  ANTHROPIC_API_KEY (and optionally DROPBOX_MCP_TOKEN for the Dropbox MCP connector).
   Run:    ANTHROPIC_API_KEY=sk-ant-… node tests/brain-telefon.e2e.js ["Frage"]
   Exit 0 = the full cycle worked and the answer is speech-friendly; exit 2 = skipped (no key). */
"use strict";
const Core = require("../js/brain-telefon-core.js");

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.log("SKIP: ANTHROPIC_API_KEY not set — the real API run happens in the Claude artifact (sample capability) or with a key.");
  process.exit(2);
}
const question = process.argv[2] || "Was weiss das Brain über die ZHAW-Kampagne?";
const history = [];

async function turn(text) {
  let messages = Core.buildTurns(history, text);
  let rounds = 0, hits = 0, searches = 0, usedBrain = false;
  const t0 = Date.now();
  for (;;) {
    const req = Core.buildApiRequest(history, text, { apiKey: key, dropboxToken: process.env.DROPBOX_MCP_TOKEN, messages });
    const res = await fetch(req.url, { method: req.method, headers: req.headers, body: JSON.stringify(req.body) });
    const json = await res.json();
    const p = Core.parseApiResponse(json);
    if (p.isError) throw new Error("API error: " + p.error);
    hits += p.searchHits; searches += p.searches; usedBrain = usedBrain || p.usedBrain;
    p.toolUses.forEach(u => console.log("  tool:", u.name, JSON.stringify(u.input)));
    if (p.stopReason === "pause_turn" && rounds < 3) { rounds++; messages = messages.concat([{ role: "assistant", content: json.content }]); continue; }
    const ms = Date.now() - t0;
    history.push({ role: "user", text }, { role: "assistant", text: p.text });
    return { text: p.text, ms, hits, searches, usedBrain, stopReason: p.stopReason };
  }
}

(async () => {
  console.log("Q1:", question);
  const a1 = await turn(question);
  console.log("A1 (" + (a1.ms / 1000).toFixed(1) + " s, brain used: " + a1.usedBrain + ", searches: " + a1.searches + ", hits: " + a1.hits + "):\n  " + a1.text);
  const c1 = Core.speechCheck(a1.text);
  console.log("  speech check:", c1.ok ? "ok" : "ISSUES " + c1.issues.join(","), "| sentences:", c1.sentences);
  console.log("Q2: Und was ist daran fürs nächste Mal wichtig?");
  const a2 = await turn("Und was ist daran fürs nächste Mal wichtig?");
  console.log("A2 (" + (a2.ms / 1000).toFixed(1) + " s):\n  " + a2.text);
  const c2 = Core.speechCheck(a2.text);
  console.log("  speech check:", c2.ok ? "ok" : "ISSUES " + c2.issues.join(","));
  const ok = a1.text && a2.text && c1.ok && c2.ok;
  console.log(ok ? "\nE2E OK" : "\nE2E FAILED");
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error("E2E error:", e.message); process.exit(1); });
