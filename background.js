"use strict";

importScripts("demo-cases.js");

const LIGHT_NAME = { r: "Rot", y: "Gelb", g: "Grün" };
const BRIGHT = { r: "#e5383b", y: "#f4b400", g: "#2fb35e" };
const DIM = { r: "#6e3437", y: "#6b5a24", g: "#2b5d3d" };

let running = false;
let controller = null;
const autoQueue = new Map();
const autoChecked = new Map();
const openedPopups = new Map();
let draining = false;

function isDemoUrl(value) {
  const url = normUrl(value);
  return !!url && DEMO_CASES.some(entry => normUrl(entry.url) === url);
}

async function openResultPopup(tabId, source, waitForLoad = true) {
  try {
    const url = normUrl(source);
    if (openedPopups.get(tabId) === url) return;
    const tab = await chrome.tabs.get(tabId);
    const window = await chrome.windows.get(tab.windowId);
    if (!tab.active || !window.focused || (waitForLoad && tab.status !== "complete") ||
        normUrl(tab.pendingUrl || tab.url) !== url) return;
    if (openedPopups.get(tabId) === url) return;
    openedPopups.set(tabId, url);
    try {
      await chrome.action.openPopup({ windowId: tab.windowId });
    } catch (error) {
      openedPopups.delete(tabId);
      throw error;
    }
  } catch (error) {
    // The toolbar result remains available if Chrome cannot display the popup.
    console.warn("Ergebnis-Popup konnte nicht geöffnet werden:", error);
  }
}

function queueAutomaticCheck(tab) {
  if (!tab.active || tab.status !== "complete" || !isDemoUrl(tab.url)) return;
  const url = normUrl(tab.url);
  if (autoChecked.get(tab.id) === url) return;
  autoQueue.set(tab.id, url);
  void drainAutomaticChecks().catch(console.error);
}

async function drainAutomaticChecks() {
  if (draining || running) return;
  draining = true;
  try {
    while (autoQueue.size && !running) {
      const [tabId, url] = autoQueue.entries().next().value;
      autoQueue.delete(tabId);
      try {
        const tab = await chrome.tabs.get(tabId);
        if (!tab.active || tab.status !== "complete" || normUrl(tab.url) !== url ||
            autoChecked.get(tabId) === url) continue;
        const [{ result: page }] = await chrome.scripting.executeScript({
          target: { tabId },
          func: () => {
            const clean = text => String(text || "").replace(/[ \t]+\n/g, "\n")
              .replace(/\n{3,}/g, "\n\n").trim();
            const candidates = [...document.querySelectorAll("article, main, [role=main]")]
              .map(node => clean(node.innerText)).sort((a, b) => b.length - a.length);
            let text = candidates[0] || "";
            if (text.length < 600) text = clean(document.body?.innerText);
            return { title: document.title, url: location.href, text: text.slice(0, 30000) };
          }
        });
        if (running) {
          autoQueue.set(tabId, url);
          break;
        }
        if (normUrl(page?.url) !== url) continue;
        autoChecked.set(tabId, url);
        await runCheck(page, tabId, ["Artikel automatisch gelesen"], true);
      } catch (error) {
        console.warn("Automatische Demo-Prüfung fehlgeschlagen:", error);
      }
    }
  } finally {
    draining = false;
  }
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return /^https?:$/.test(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function normUrl(value) {
  const url = safeUrl(value);
  if (!url) return null;
  url.hash = "";
  return url.href.replace(/\/$/, "");
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function checkDemo(page) {
  const url = normUrl(page.url);
  const demo = url && DEMO_CASES.find(entry => normUrl(entry.url) === url);

  if (!demo) {
    throw new Error("Für diese Seite ist keine Demo-Prüfung hinterlegt.");
  }

  // Compare complete sentences so a longer or negated claim can't
  // accidentally inherit a verdict by containing part of a quote.
  const segmenter = new Intl.Segmenter("de", { granularity: "sentence" });
  const sentences = new Set();

  for (const line of String(page.text ?? "").split(/\r?\n/)) {
    for (const { segment } of segmenter.segment(normalizeText(line))) {
      sentences.add(normalizeText(segment));
    }
  }

  const claims = demo.claims
    .filter(entry => sentences.has(normalizeText(entry.quote)))
    .map(entry => ({
      ...entry,
      claim: entry.quote,
      supporting: entry.supporting ?? [],
      contradicting: entry.contradicting ?? []
    }));

  if (!claims.length) {
    throw new Error("Die vorbereiteten Aussagen wurden im Artikel nicht gefunden.");
  }

  const sources = claims.flatMap(claim => [
    ...claim.supporting,
    ...claim.contradicting
  ]);

  const partial = claims.length < demo.claims.length;

  return {
    title: page.title,
    source: page.url,
    summary: partial
      ? "Nur ein Teil der vorbereiteten Aussagen wurde im Artikel gefunden."
      : "Manuell vorbereitete Prüfung ausgewählter Aussagen.",
    overall: partial
      ? { rating: "gemischt", headline: "Nur teilweise geprüft" }
      : null,
    live: false,
    claims,
    allSources: [...new Map(sources.map(source => [source.url, source])).values()],
    checkedAt: new Date().toISOString()
  };
}

function lightFor(report) {
  if (report.overall?.rating === "gemischt") return "y";

  const verdicts = report.claims.map(claim => claim.verdict);
  if (verdicts.includes("falsch")) return "r";
  if (verdicts.length && verdicts.every(verdict => verdict === "wahr")) {
    return "g";
  }
  return "y";
}

function drawIcon(activeLight) {
  const imageData = {};

  for (const size of [16, 32]) {
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext("2d");
    const scale = size / 16;

    ctx.scale(scale, scale);
    ctx.fillStyle = "#141c2b";
    ctx.beginPath();
    ctx.roundRect(3.6, 0.4, 8.8, 15.2, 2.6);
    ctx.fill();

    for (const [color, y] of [["r", 3.7], ["y", 8], ["g", 12.3]]) {
      ctx.fillStyle = activeLight === color ? BRIGHT[color] : DIM[color];
      ctx.beginPath();
      ctx.arc(8, y, 1.95, 0, Math.PI * 2);
      ctx.fill();
    }

    imageData[size] = ctx.getImageData(0, 0, size, size);
  }

  return imageData;
}

async function setLight(tabId, light = null) {
  if (tabId == null) return;

  try {
    await chrome.action.setIcon({ tabId, imageData: drawIcon(light) });
    await chrome.action.setTitle({
      tabId,
      title: light ? `Demo-Prüfung: ${LIGHT_NAME[light]}` : "Faktencheck"
    });
  } catch {
    // The tab may have closed during the check.
  }
}

async function marksOn() {
  const settings = await chrome.storage.local.get("marksOn");
  return settings.marksOn !== false;
}

async function applyMarks(tabId, report) {
  if (tabId == null || !report?.source) return null;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (normUrl(tab.url) !== normUrl(report.source)) return null;

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["highlight.js"]
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: data => globalThis.__fc.apply(data),
      args: [{ ...report, light: lightFor(report) }]
    });

    return result;
  } catch {
    return null;
  }
}

async function clearMarks(tabId) {
  if (tabId == null) return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => globalThis.__fc?.clear()
    });
  } catch {
    // The page may no longer be accessible.
  }
}

async function focusMark(tabId, index) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: i => globalThis.__fc?.focus(i) ?? false,
      args: [index]
    });

    return result;
  } catch {
    return false;
  }
}

async function runCheck(page, tabId, preLog, automatic = false) {
  running = true;
  controller = new AbortController();

  const job = {
    id: Date.now(),
    status: "running",
    url: page.url || null,
    title: page.title,
    tabId,
    startedAt: Date.now(),
    log: preLog.map(message => ({ m: message, c: "" })),
    report: null,
    error: null
  };

  try {
    await chrome.storage.local.set({ job });
    controller.signal.throwIfAborted();

    const report = checkDemo(page);
    const { cache = {} } = await chrome.storage.local.get("cache");

    controller.signal.throwIfAborted();
    cache[normUrl(page.url)] = report;
    job.status = "done";
    job.report = report;
    job.log.push({ m: "Demo-Prüfung abgeschlossen", c: "" });

    await chrome.storage.local.set({ job, cache });
    await setLight(tabId, lightFor(report));

    if (await marksOn()) {
      const found = await applyMarks(tabId, report);
      if (Array.isArray(found)) {
        job.marks = found;
        await chrome.storage.local.set({ job });
      }
    }
    if (automatic) await openResultPopup(tabId, report.source);
  } catch (error) {
    const stopped = error.name === "AbortError";
    job.status = stopped ? "stopped" : "error";
    job.error = stopped ? null : error.message || "Unbekannter Fehler.";
    job.log.push({ m: stopped ? "Gestoppt" : "Abgebrochen", c: "err" });
    await chrome.storage.local.set({ job });
    await setLight(tabId);
  } finally {
    running = false;
    controller = null;
    void drainAutomaticChecks().catch(console.error);
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" || changeInfo.url) {
    autoChecked.delete(tabId);
    autoQueue.delete(tabId);
    if (changeInfo.status === "loading") openedPopups.delete(tabId);
  }
  const destination = changeInfo.url || tab.pendingUrl || tab.url;
  if (tab.active && isDemoUrl(destination)) {
    void openResultPopup(tabId, destination, false);
  }
  if (changeInfo.status === "complete" && tab.active && isDemoUrl(tab.url)) {
    queueAutomaticCheck(tab);
    return;
  }
  if (!changeInfo.url && changeInfo.status !== "complete") return;

  void (async () => {
    const { job, cache = {} } = await chrome.storage.local.get(["job", "cache"]);
    if (running && job?.tabId === tabId) return;

    const url = normUrl(changeInfo.url || tab.url);
    const report = url ? cache[url] : null;
    await setLight(tabId, report ? lightFor(report) : null);

    if (report && changeInfo.status === "complete" && await marksOn()) {
      await applyMarks(tabId, report);
    }
  })().catch(console.error);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  autoChecked.delete(tabId);
  openedPopups.delete(tabId);
  void chrome.tabs.get(tabId).then(tab => {
    const destination = tab.pendingUrl || tab.url;
    if (isDemoUrl(destination)) void openResultPopup(tabId, destination, false);
    queueAutomaticCheck(tab);
  }).catch(console.error);
});

chrome.tabs.onRemoved.addListener(tabId => {
  autoChecked.delete(tabId);
  autoQueue.delete(tabId);
  openedPopups.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  switch (message.type) {
    case "check":
      if (running) {
        reply({ ok: false, error: "Es läuft schon eine Prüfung." });
        return;
      }

      void runCheck(message.page, message.tabId, message.log || [])
        .catch(console.error);
      reply({ ok: true });
      return;

    case "stop":
      controller?.abort();
      reply({ ok: true });
      return;

    case "marks":
      void (async () => {
        await chrome.storage.local.set({ marksOn: message.on });

        if (!message.on) {
          await clearMarks(message.tabId);
          reply({ ok: true });
          return;
        }

        const found = await applyMarks(message.tabId, message.report);
        reply({ ok: true, found });
      })().catch(() => reply({ ok: false }));
      return true;

    case "focus":
      focusMark(message.tabId, message.i).then(ok => reply({ ok }));
      return true;
  }
});

void chrome.storage.local.get("job").then(({ job }) => {
  if (job?.status === "running" && !running) {
    return chrome.storage.local.set({
      job: {
        ...job,
        status: "error",
        error: "Die Prüfung wurde unterbrochen. Bitte erneut auf „Prüfen“ tippen."
      }
    });
  }
}).catch(console.error);
