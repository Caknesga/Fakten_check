"use strict";

importScripts("demo-cases.js", "website/review.js", "page-reader.js");

const LIGHT_NAME = { r: "Red", y: "Yellow", g: "Green" };
const BRIGHT = { r: "#e5383b", y: "#f4b400", g: "#2fb35e" };
const DIM = { r: "#6e3437", y: "#6b5a24", g: "#2b5d3d" };

let running = false;
let controller = null;
const autoQueue = new Map();
const autoChecked = new Map();
const openedPopups = new Map();
const highlightRevealAt = new Map();
let draining = false;

function isDemoUrl(value) {
  return !!demoForUrl(value);
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
    highlightRevealAt.set(tabId, { url, at: Date.now() + DEMO_LOADING_MS });
    // Hide marks left from an earlier visit while the popup shows its loading state.
    await clearMarks(tabId);
    try {
      await chrome.action.openPopup({ windowId: tab.windowId });
    } catch (error) {
      openedPopups.delete(tabId);
      throw error;
    }
  } catch (error) {
    // The toolbar result remains available if Chrome cannot display the popup.
    console.warn("The results popup could not be opened", error);
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
          func: readDemoPage,
          args: [demoForUrl(url).claims.map(claim => claim.quote)]
        });
        if (running) {
          autoQueue.set(tabId, url);
          break;
        }
        if (normUrl(page?.url) !== url) continue;
        autoChecked.set(tabId, url);
        await runCheck(page, tabId, ["Page read automatically"], true);
      } catch (error) {
        console.warn("The automatic demo check failed", error);
      }
    }
  } finally {
    draining = false;
  }
}

function normalizeText(value) {
  return String(value ?? "").normalize("NFC")
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, "")
    .replace(/…/g, "...").replace(/\s*\.{3}/g, "...")
    .replace(/[‐‑‒–—―−]/g, "-").replace(/\s+/g, " ").trim();
}

function checkDemo(page) {
  const demo = demoForUrl(page.url);

  if (!demo) {
    throw new Error("No demo review is available for this page.");
  }

  // Compare complete sentences so a longer or negated claim can't
  // accidentally inherit a verdict by containing part of a quote.
  const segmenter = new Intl.Segmenter("de", { granularity: "sentence" });
  const sentences = new Set();

  // Keep caption lines as candidates, and also join wrapped article sentences.
  for (const line of [String(page.text ?? ""), ...String(page.text ?? "").split(/\r?\n/)]) {
    for (const { segment } of segmenter.segment(normalizeText(line))) {
      sentences.add(normalizeText(segment));
    }
  }
  const claims = demo.claims
    .filter(entry => {
      const quote = normalizeText(entry.quote);
      return quote && sentences.has(quote);
    })
    .map(entry => ({
      ...entry,
      claim: entry.quote,
      supporting: entry.supporting ?? [],
      contradicting: entry.contradicting ?? []
    }));

  if (!claims.length) {
    throw new Error("The prepared quotes were not found. Check whether a sign-in prompt, consent dialog, or paywall is hiding the text.");
  }

  const sources = claims.flatMap(claim => [
    ...claim.supporting,
    ...claim.contradicting
  ]);

  const partial = claims.length < demo.claims.length;

  return {
    title: page.title,
    source: page.url,
    overall: partial
      ? { rating: "gemischt", headline: "Partial check" }
      : null,
    live: false,
    claims,
    allSources: [...new Map(sources.map(source => [source.url, source])).values()],
    checkedAt: new Date().toISOString()
  };
}

function lightFor(report) {
  return reviewStatus(report).light;
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
      title: light ? `BAware · ${LIGHT_NAME[light]}` : "BAware"
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
    // Keep website highlights behind the same demo loading interval as the popup.
    for (;;) {
      const reveal = highlightRevealAt.get(tabId);
      const remaining = reveal?.url === normUrl(report.source) ? reveal.at - Date.now() : 0;
      if (remaining <= 0) break;
      await new Promise(resolve => setTimeout(resolve, remaining));
    }
    if (!(await marksOn())) return null;
    const tab = await chrome.tabs.get(tabId);
    if (normUrl(tab.url) !== normUrl(report.source)) return null;

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["highlight.js"]
    });

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId },
      func: data => globalThis.__fc.apply(data),
      args: [{ ...report, light: lightFor(report), detailsUrl: reportUrl(demoForUrl(report.source)) }]
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
    const focus = async () => {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId },
        func: i => globalThis.__fc?.focus(i) ?? false,
        args: [index]
      });
      return result;
    };
    if (await focus()) return true;
    const tab = await chrome.tabs.get(tabId);
    const { cache = {} } = await chrome.storage.local.get("cache");
    const report = cache[normUrl(tab.url)];
    if (!report || !(await marksOn())) return false;
    await applyMarks(tabId, report);
    return await focus();
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
    job.log.push({ m: "Demo check complete", c: "" });

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
    job.error = stopped ? null : error.message || "The check could not be completed.";
    job.log.push({ m: stopped ? "Stopped" : "Check failed", c: "err" });
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
  if ((changeInfo.status === "complete" || changeInfo.url) && tab.status === "complete" && tab.active && isDemoUrl(tab.url)) {
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
  highlightRevealAt.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, _sender, reply) => {
  switch (message.type) {
    case "check":
      if (running) {
        reply({ ok: false, error: "A check is already running." });
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
    case "open-report":
      chrome.tabs.create({ url: reportUrl(demoForUrl(message.source)) })
        .then(() => reply({ ok: true }), () => reply({ ok: false }));
      return true;

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
        error: "The check was interrupted. Try again in Check options."
      }
    });
  }
}).catch(console.error);
