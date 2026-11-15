"use strict";
/* Faktencheck – Hintergrund: führt die Prüfung aus (auch wenn das Fenster zu ist)
   und färbt das Ampel-Symbol in der Symbolleiste. */

const API = "https://api.anthropic.com/v1/messages";
const PRICE = { "claude-sonnet-5-5": { in: 2, out: 10 }, "claude-haiku-5-5": { in: 0.10, out: 0.50 } }; // $ pro Mio. Tokens
const DEFAULT_MODEL = "claude-sonnet-5-5";
const RATING_LIGHT = { verlaesslich: "g", ueberwiegend_korrekt: "g", gemischt: "y", irrefuehrend: "y", falschinformation: "r" };
const LIGHT_NAME = { r: "Rot", y: "Gelb", g: "Grün" };

let ctl = null, anim = null, keepAlive = null, running = false;

/* ---------- helpers ---------- */
const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x : null; } catch { return null; } };
const normUrl = u => { const x = safeUrl(u); if (!x) return null; x.hash = ""; return x.href.replace(/\/$/, ""); };
const hostOf = u => { const x = safeUrl(u); return x ? x.hostname.replace(/^www\./, "") : ""; };

function lightFor(report) {
  const r = String(report?.overall?.rating || "").toLowerCase().replace(/ü/g, "ue").replace(/ä/g, "ae").replace(/[\s-]+/g, "_");
  if (RATING_LIGHT[r]) return RATING_LIGHT[r];
  const v = (report?.claims || []).map(c => String(c.verdict || "").toLowerCase());
  if (v.some(x => x.startsWith("falsch"))) return "r";
  if (v.length && v.every(x => x.startsWith("wahr"))) return "g";
  return "y";
}

/* ---------- toolbar icon: a small traffic light ---------- */
const BRIGHT = { r: "#e5383b", y: "#f4b400", g: "#2fb35e" };
const DIM = { r: "#6e3437", y: "#6b5a24", g: "#2b5d3d" };
function rr(x, X, Y, W, H, R) { x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + W, Y, X + W, Y + H, R); x.arcTo(X + W, Y + H, X, Y + H, R); x.arcTo(X, Y + H, X, Y, R); x.arcTo(X, Y, X + W, Y, R); x.closePath(); }
function drawIcon(on) {
  const out = {};
  for (const s of [16, 32]) {
    const c = new OffscreenCanvas(s, s), x = c.getContext("2d"), k = s / 16;
    x.clearRect(0, 0, s, s);
    x.fillStyle = "#141c2b"; rr(x, 3.6 * k, 0.4 * k, 8.8 * k, 15.2 * k, 2.6 * k); x.fill();
    [["r", 3.7], ["y", 8], ["g", 12.3]].forEach(([col, cy]) => {
      x.beginPath(); x.arc(8 * k, cy * k, 1.95 * k, 0, Math.PI * 2);
      x.fillStyle = on === col ? BRIGHT[col] : DIM[col]; x.fill();
    });
    out[s] = x.getImageData(0, 0, s, s);
  }
  return out;
}
const ICONS = { idle: drawIcon(null), r: drawIcon("r"), y: drawIcon("y"), g: drawIcon("g") };
async function setLight(tabId, state, title) {
  if (tabId == null) return;
  try {
    await chrome.action.setIcon({ tabId, imageData: ICONS[state] || ICONS.idle });
    await chrome.action.setTitle({ tabId, title: title || "Faktencheck" });
  } catch { /* tab closed */ }
}
function startAnim(tabId) {
  stopAnim(); let i = 0; const seq = ["r", "y", "g"];
  anim = setInterval(() => setLight(tabId, seq[i++ % 3], "Faktencheck: Prüfung läuft …"), 550);
}
function stopAnim() { if (anim) clearInterval(anim); anim = null; }

/* ---------- marks in the article ---------- */
async function marksOn() { const { marksOn } = await chrome.storage.local.get("marksOn"); return marksOn !== false; }
async function canRead(url) { const x = safeUrl(url); if (!x) return false; try { return await chrome.permissions.contains({ origins: [x.origin + "/*"] }); } catch { return false; } }
async function applyMarks(tabId, report) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!report || !report.source || normUrl(tab.url) !== normUrl(report.source) || !(await canRead(tab.url))) return null;
    await chrome.scripting.executeScript({ target: { tabId }, files: ["highlight.js"] });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: r => globalThis.__fc.apply(r), args: [{ ...report, light: lightFor(report) }] });
    return result;
  } catch { return null; }
}
async function clearMarks(tabId) {
  try { await chrome.scripting.executeScript({ target: { tabId }, func: () => globalThis.__fc && globalThis.__fc.clear() }); } catch {}
}
async function focusMark(tabId, i) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["highlight.js"] });
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId }, func: k => globalThis.__fc.focus(k), args: [i] });
    return result;
  } catch { return false; }
}

/* restore the right light when a tab loads a page */
chrome.tabs.onUpdated.addListener(async (tabId, info, tab) => {
  if (!info.url && info.status !== "complete") return;
  const { job } = await chrome.storage.local.get("job");
  if (running && job && job.tabId === tabId) return;
  const url = info.url || tab.url;
  const { cache = {} } = await chrome.storage.local.get("cache");
  const rep = cache[normUrl(url)];
  if (rep) {
    const l = lightFor(rep); setLight(tabId, l, `Faktencheck: ${LIGHT_NAME[l]} · ${rep.overall?.score ?? "?"}/100`);
    if (info.status === "complete" && await marksOn()) applyMarks(tabId, rep);
  }
  else setLight(tabId, "idle", "Faktencheck");
});

/* a job marked running when this worker starts was interrupted */
chrome.storage.local.get("job").then(({ job }) => {
  if (job && job.status === "running" && !running) {
    job.status = "error"; job.error = "Die Prüfung wurde unterbrochen. Bitte erneut auf „Prüfen“ tippen.";
    chrome.storage.local.set({ job });
  }
});

/* ---------- messages from the popup ---------- */
chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg.type === "check") {
    if (running) { reply({ ok: false, error: "Es läuft schon eine Prüfung." }); return; }
    runCheck(msg.page, msg.tabId, msg.log || []);
    reply({ ok: true });
  } else if (msg.type === "stop") {
    if (ctl) ctl.abort();
    reply({ ok: true });
  } else if (msg.type === "marks") {
    (async () => {
      await chrome.storage.local.set({ marksOn: msg.on });
      if (!msg.on) { await clearMarks(msg.tabId); reply({ ok: true }); return; }
      reply({ ok: true, found: await applyMarks(msg.tabId, msg.report) });
    })();
    return true;
  } else if (msg.type === "focus") {
    focusMark(msg.tabId, msg.i).then(ok => reply({ ok }));
    return true;
  }
});

/* ---------- job state (the popup renders from this) ---------- */
let job = null;
async function save() { await chrome.storage.local.set({ job }); }
async function log(m, c) { job.log.forEach(l => { if (l.c === "on") l.c = ""; }); job.log.push({ m, c: c ?? "on" }); await save(); }

async function runCheck(page, tabId, preLog) {
  running = true; ctl = new AbortController();
  job = { id: Date.now(), status: "running", url: page.url || null, title: page.title, tabId, startedAt: Date.now(),
          log: preLog.map(m => ({ m, c: "" })), report: null, error: null };
  await save();
  startAnim(tabId);
  keepAlive = setInterval(() => chrome.runtime.getPlatformInfo(), 20000);
  try {
    const { apiKey, model } = await chrome.storage.local.get(["apiKey", "model"]);
    if (!apiKey) throw { message: "Kein API-Schlüssel gespeichert. Öffne die Einstellungen (Zahnrad)." };
    const report = await check(page, apiKey, PRICE[model] ? model : DEFAULT_MODEL);
    job.status = "done"; job.report = report;
    job.log.forEach(l => { if (l.c === "on") l.c = ""; });
    await save();
    if (page.url) {
      const { cache = {} } = await chrome.storage.local.get("cache");
      cache[normUrl(page.url)] = report;
      const keys = Object.keys(cache); while (keys.length > 30) delete cache[keys.shift()];
      await chrome.storage.local.set({ cache });
    }
    stopAnim();
    const l = lightFor(report);
    setLight(tabId, l, `Faktencheck: ${LIGHT_NAME[l]} · ${report.overall?.score ?? "?"}/100`);
    if (page.url && tabId != null && await marksOn()) {
      const found = await applyMarks(tabId, report);
      if (Array.isArray(found)) { job.marks = found; await save(); }
    }
  } catch (err) {
    stopAnim();
    const stopped = err && err.code === "cancelled";
    job.status = stopped ? "stopped" : "error";
    job.error = stopped ? null : (err && err.message) || "Unbekannter Fehler. Bitte erneut versuchen.";
    job.log.forEach(l => { if (l.c === "on") l.c = ""; });
    job.log.push({ m: stopped ? "Gestoppt" : "Abgebrochen", c: "err" });
    await save();
    setLight(tabId, "idle", "Faktencheck");
  } finally {
    clearInterval(keepAlive); keepAlive = null; running = false; ctl = null;
  }
}

/* ---------- Claude API (streaming, so the worker stays busy and progress is visible) ---------- */
async function streamClaude(body, apiKey, onTool) {
  let r;
  try {
    r = await fetch(API, { method: "POST", signal: ctl.signal,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      body: JSON.stringify({ ...body, stream: true }) });
  } catch (e) {
    if (e && e.name === "AbortError") throw { code: "cancelled" };
    throw { message: "Keine Verbindung zur Claude API. Prüfe deine Internetverbindung." };
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({})); const m = String(j?.error?.message || "");
    if (r.status === 401) throw { message: "Der API-Schlüssel ist ungültig. Prüfe ihn in den Einstellungen (Zahnrad)." };
    if (r.status === 403) throw { message: "Der API-Schlüssel hat keine Berechtigung dafür. (" + m.slice(0, 120) + ")" };
    if (r.status === 429) throw { message: "Zu viele Anfragen in kurzer Zeit. Warte eine Minute und versuch es erneut." };
    if (r.status === 529 || r.status >= 500) throw { message: "Die Claude API ist gerade überlastet. Versuch es in ein paar Minuten erneut." };
    if (/credit|balance|billing/i.test(m)) throw { message: "Dein API-Guthaben ist aufgebraucht. Lade es auf platform.claude.com unter „Billing“ auf." };
    if (/web.?search/i.test(m)) throw { message: "Die Websuche ist für deine API-Organisation nicht freigeschaltet. Aktiviere sie auf platform.claude.com in den Einstellungen." };
    throw { message: "Fehler der Claude API (" + r.status + "): " + m.slice(0, 160) };
  }
  const msg = { content: [], stop_reason: null, usage: {} }; const partial = {};
  const reader = r.body.getReader(), dec = new TextDecoder(); let buf = "";
  try {
    for (;;) {
      const { value, done } = await reader.read(); if (done) break;
      buf += dec.decode(value, { stream: true }); let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, i); buf = buf.slice(i + 2); let data = "";
        for (const line of chunk.split("\n")) if (line.startsWith("data:")) data += line.slice(5).trim();
        if (!data) continue;
        let d; try { d = JSON.parse(data); } catch { continue; }
        if (d.type === "message_start") Object.assign(msg.usage, d.message?.usage || {});
        else if (d.type === "content_block_start") { msg.content[d.index] = structuredClone(d.content_block); if (d.content_block.type === "server_tool_use") partial[d.index] = ""; }
        else if (d.type === "content_block_delta") {
          const b = msg.content[d.index], dl = d.delta;
          if (dl.type === "text_delta") b.text = (b.text || "") + dl.text;
          else if (dl.type === "input_json_delta") partial[d.index] += dl.partial_json;
          else if (dl.type === "citations_delta") (b.citations = b.citations || []).push(dl.citation);
        } else if (d.type === "content_block_stop") {
          const b = msg.content[d.index];
          if (b && b.type === "server_tool_use" && partial[d.index] != null) {
            try { b.input = partial[d.index] ? JSON.parse(partial[d.index]) : {}; } catch { b.input = {}; }
            onTool && onTool(b);
          }
        } else if (d.type === "message_delta") {
          if (d.delta?.stop_reason) msg.stop_reason = d.delta.stop_reason;
          if (d.usage) Object.assign(msg.usage, d.usage);
        } else if (d.type === "error") {
          throw { message: d.error?.type === "overloaded_error" ? "Die Claude API ist gerade überlastet. Versuch es in ein paar Minuten erneut." : "Fehler der Claude API: " + (d.error?.message || "") };
        }
      }
    }
  } catch (e) {
    if (e && e.name === "AbortError") throw { code: "cancelled" };
    throw e;
  }
  msg.content = msg.content.filter(Boolean).map(b => { if (b.type === "text" && b.citations == null) delete b.citations; return b; });
  return msg;
}

function buildPrompt(pg) {
  const host = pg.url ? hostOf(pg.url) : "";
  return `Du bist ein sorgfältiger, neutraler Faktenprüfer. Prüfe ${pg.url ? "die folgende Webseite" : "den folgenden Text"} auf Falschinformation.

${pg.url ? `SEITE: ${pg.title}\nURL: ${pg.url}\n` : ""}${pg.desc ? `BESCHREIBUNG: ${pg.desc}\n` : ""}
INHALT:
${pg.text}

AUFGABE:
1. Ziehe ALLE überprüfbaren Tatsachenbehauptungen heraus (keine Meinungen), höchstens 8, nach Wichtigkeit sortiert. Fasse fast gleiche Aussagen zusammen.
2. Suche mit dem Werkzeug web_search nach unabhängigen Quellen (Nachrichtenagenturen, Behörden, Wissenschaft, etablierte Faktenchecker). Arbeite effizient: kombiniere verwandte Aussagen in einer Suche, höchstens 6 Suchen.${host ? ` Die Domain ${host} zählt NIE als Beleg.` : ""}
3. Ordne bei jeder Aussage jede passende Quelle zu: "supporting" (sagt dasselbe) oder "contradicting" (sagt etwas anderes, schwächt ab oder widerlegt). Verwende NUR URLs, die in deinen Suchergebnissen vorkamen, genau so geschrieben. "statement": 1 Satz auf Deutsch, in eigenen Worten.
4. verdict je Aussage: "wahr", "falsch", "irrefuehrend" (Kern stimmt, aber verzerrt, übertrieben oder aus dem Zusammenhang) oder "unklar" (Quellen reichen nicht).
6. "quote": EIN zusammenhängender Ausschnitt von 8 bis 25 Wörtern, Zeichen für Zeichen aus INHALT kopiert, in der Originalsprache (nicht übersetzt), ohne Auslassungspunkte, ohne Umformulierung.
7. Gesamteinschätzung des Ganzen (Faktenlage, Ton, Zuspitzung, Umgang mit Quellen). rating: "verlaesslich", "ueberwiegend_korrekt", "gemischt", "irrefuehrend" oder "falschinformation". score: Glaubwürdigkeit 0-100.

Antworte am Ende AUSSCHLIESSLICH mit einem einzigen JSON-Objekt (kein Markdown, kein Text davor oder danach) in dieser Form:
{"title":"Titel","summary":"1 Satz, worum es geht",
 "overall":{"rating":"…","score":0,"headline":"Allgemeine Einschätzung, max. 15 Wörter","assessment":"höchstens 2 kurze Sätze","points":["max. 3 Stichpunkte, je max. 8 Wörter"]},
 "claims":[{"claim":"Aussage in einem Satz auf Deutsch","quote":"wörtliches Zitat aus INHALT, siehe Regel 6","verdict":"…","confidence":0,"explanation":"2-3 Sätze Begründung",
   "supporting":[{"url":"https://…","title":"Name der Quelle","statement":"…"}],
   "contradicting":[{"url":"https://…","title":"…","statement":"…"}]}]}`;
}
function parseJson(text) {
  const t = String(text || "").replace(/```(?:json)?/g, "");
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(t.slice(a, b + 1)); } catch { return null; }
}

async function check(pg, apiKey, model) {
  const host = pg.url ? hostOf(pg.url) : "";
  await log("Claude sucht unabhängige Quellen");
  const messages = [{ role: "user", content: buildPrompt(pg) }];
  const tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }];
  const blocks = [], usage = { in: 0, out: 0, searches: 0 };
  for (let round = 0; round < 4; round++) {
    const resp = await streamClaude({ model, max_tokens: 8000, messages, tools }, apiKey,
      b => { if (b.name === "web_search" && b.input?.query) log("Suche: " + String(b.input.query).slice(0, 80)); });
    const u = resp.usage || {};
    usage.in += (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
    usage.out += u.output_tokens || 0;
    usage.searches += u.server_tool_use?.web_search_requests || 0;
    blocks.push(...resp.content);
    if (resp.stop_reason === "pause_turn") { messages.push({ role: "assistant", content: resp.content }); continue; }
    if (resp.stop_reason === "max_tokens") throw { message: "Die Antwort wurde zu lang. Versuch es erneut oder prüfe einen kürzeren Artikel." };
    break;
  }
  await log("Bewerte die Aussagen");

  // every URL Claude actually saw in a search result
  const found = [], seen = new Set(); let lastTool = -1;
  blocks.forEach((b, i) => {
    if (b.type !== "web_search_tool_result") return;
    lastTool = i;
    if (!Array.isArray(b.content)) return;
    for (const r of b.content) {
      const n = normUrl(r.url); if (!n || seen.has(n)) continue;
      if (host && hostOf(n) === host) continue;
      seen.add(n); found.push({ url: r.url, title: r.title || hostOf(r.url) });
    }
  });
  const text = blocks.slice(lastTool + 1).filter(b => b.type === "text").map(b => b.text).join("");
  const res = parseJson(text) || parseJson(blocks.filter(b => b.type === "text").map(b => b.text).join(""));
  if (!res || !Array.isArray(res.claims)) throw { message: "Die Antwort von Claude war unvollständig. Bitte erneut prüfen." };

  const keep = list => (Array.isArray(list) ? list : []).filter(s => { const n = normUrl(s && s.url); return n && seen.has(n); })
    .map(s => ({ url: s.url, title: s.title || hostOf(s.url), statement: s.statement }));
  const p = PRICE[model]; const cost = usage.in / 1e6 * p.in + usage.out / 1e6 * p.out + usage.searches * 0.01;
  await log(`Fertig · ${usage.searches} Suchen · Kosten ca. ${cost.toFixed(2).replace(".", ",")} $`, "");
  return {
    title: res.title || pg.title, summary: res.summary, source: pg.url || "Eingefügter Text", live: true,
    overall: res.overall || null,
    claims: res.claims.slice(0, 8).map(c => ({ claim: c.claim, quote: c.quote, verdict: c.verdict, confidence: c.confidence, explanation: c.explanation, supporting: keep(c.supporting), contradicting: keep(c.contradicting) })),
    allSources: found.map(f => ({ title: f.title, url: f.url })),
    checkedAt: new Date().toISOString()
  };
}
