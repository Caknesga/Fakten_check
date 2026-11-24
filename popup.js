"use strict";

function updatePopupWidth() {
  const screenWidth = globalThis.screen?.width;
  if (screenWidth > 0) {
    document.documentElement.style.setProperty("--popup-width", `${screenWidth / 6}px`);
  }
}

updatePopupWidth();
globalThis.screen?.addEventListener("change", updatePopupWidth);

const $ = id => document.getElementById(id);
const revealAt = Date.now() + DEMO_LOADING_MS;
const state = { job: null, cache: {} };
let tab = null;
let ready = false;
let reading = false;
let manualError = "";
let revealTimer = null;

function jobForUrl(url) {
  const key = normUrl(url);
  return key && key === normUrl(state.job?.url) ? state.job : null;
}

function reportForTab() {
  const key = normUrl(tab?.url);
  if (!key) return null;
  const job = jobForUrl(tab.url);
  return (job?.status === "done" && job.report) || state.cache[key] || null;
}

function showStatus({ title, reason, tone = "neutral" }, scope = "Demo review", busy = false) {
  $("status").dataset.tone = tone;
  $("status").setAttribute("aria-busy", String(busy));
  $("status-scope").textContent = scope;
  $("status-title").textContent = title;
  $("status-description").textContent = reason;
}

function paint() {
  if (!ready) return;

  const input = $("url").value.trim();
  const url = input || tab?.url;
  const key = normUrl(url);
  const demo = demoForUrl(url);
  const job = jobForUrl(url);
  const remaining = revealAt - Date.now();
  const waiting = !!demo && key === normUrl(tab?.url) && remaining > 0;
  const hostname = safeUrl(url)?.hostname.replace(/^www\./, "");
  $("site").textContent = hostname || "";
  $("site").hidden = !hostname;
  $("report-link").href = reportUrl(demo);
  $("go").disabled = waiting || reading || state.job?.status === "running";
  $("stop").hidden = waiting || job?.status !== "running";
  $("marks").disabled = tab?.id == null;

  if (waiting && revealTimer === null) {
    revealTimer = setTimeout(() => {
      revealTimer = null;
      paint();
    }, remaining);
  }
  if (waiting || reading || job?.status === "running") {
    showStatus({
      title: "Checking this page",
      reason: "Looking for the claims in the demo review."
    }, "Demo review", true);
    return;
  }

  if (manualError || job?.status === "error") {
    const reason = manualError || (demo
      ? "Make sure the page text is visible, then try again in Check options."
      : "This page is outside the set of demo reviews.");
    showStatus({ title: "Check unavailable", reason });
    return;
  }

  if (job?.status === "stopped") {
    showStatus({ title: "Check stopped", reason: "You can try again in Check options." });
    return;
  }

  const report = (job?.status === "done" && job.report) || (key && state.cache[key]);
  if (report) {
    const count = report.claims.length;
    showStatus(reviewStatus(report), "Demo review · " + count + (count === 1 ? " matched claim" : " matched claims"));
    return;
  }

  if (demo) {
    const overview = reviewStatus(demo);
    showStatus({
      ...overview,
      reason: "The page text has yet to be matched to this review."
    }, "Prepared demo rating");
    return;
  }

  showStatus({
    title: "No rating",
    reason: "This page is outside the set of demo reviews."
  }, "Page credibility");
}

$("marks").addEventListener("change", async () => {
  const on = $("marks").checked;
  const response = await chrome.runtime.sendMessage({
    type: "marks",
    on,
    tabId: tab?.id,
    report: reportForTab()
  }).catch(() => null);
  if (!response?.ok && $("marks").checked === on) $("marks").checked = !on;
});

async function readTab(demo) {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readDemoPage,
      args: [demo?.claims.map(claim => claim.quote) || []]
    });
    return result;
  } catch {
    throw new Error("The page could not be read. Refresh the page and try again.");
  }
}

async function fetchPage(url) {
  let response;
  try {
    response = await fetch(url, { credentials: "omit", redirect: "follow" });
  } catch {
    throw new Error("The link could not be opened. Check the address and try again.");
  }
  if (!response.ok) {
    throw new Error("The website blocked the request. Open the page in a tab and check it there.");
  }

  const doc = new DOMParser().parseFromString(await response.text(), "text/html");
  doc.querySelectorAll("script,style,noscript,nav,footer,header,aside,form").forEach(node => node.remove());
  const root = doc.querySelector("article") || doc.querySelector("main") || doc.body;
  let text = [...root.querySelectorAll("h1,h2,h3,h4,p,li,blockquote")]
    .map(node => node.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).join("\n");
  if (text.length < 600) text = (root.textContent || "").replace(/\s+/g, " ").trim();
  return { title: doc.title || url, url: response.url || url, text: text.slice(0, 30000) };
}

$("stop").onclick = () => chrome.runtime.sendMessage({ type: "stop" });

$("form").addEventListener("submit", async event => {
  event.preventDefault();
  if ($("go").disabled) return;

  const url = safeUrl($("url").value.trim());
  if (!url) {
    manualError = "Enter a valid website link.";
    paint();
    return;
  }

  reading = true;
  manualError = "";
  $("url").disabled = true;
  paint();
  try {
    let page;
    if (tab?.id != null && normUrl(tab.url) === normUrl(url)) {
      page = await readTab(demoForUrl(url));
    } else {
      // Chrome requires the permission request to start during the submit gesture.
      if (!(await chrome.permissions.request({ origins: [url.origin + "/*"] }))) {
        throw new Error("Website access was declined. Allow access to check this link.");
      }
      page = await fetchPage(url.href);
    }
    if (!page?.text.trim()) throw new Error("No readable text was found on this page.");

    const reply = await chrome.runtime.sendMessage({
      type: "check",
      page,
      tabId: tab?.id,
      log: ["Page read"]
    });
    if (!reply?.ok) throw new Error(reply?.error || "The check could not be started.");
  } catch (error) {
    manualError = error.message || "The check could not be started.";
  } finally {
    reading = false;
    $("url").disabled = false;
    paint();
  }
});

$("url").addEventListener("input", () => {
  manualError = "";
  paint();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.job) state.job = changes.job.newValue || null;
  if (changes.cache) state.cache = changes.cache.newValue || {};
  if (changes.marksOn) $("marks").checked = changes.marksOn.newValue !== false;
  if (changes.job || changes.cache) paint();
});

(async () => {
  try {
    const saved = await chrome.storage.local.get(["job", "cache", "marksOn"]);
    state.job = saved.job || null;
    state.cache = saved.cache || {};
    $("marks").checked = saved.marksOn !== false;
  } catch {
    // The page overview can still open without a stored report.
  }
  try {
    [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch {
    tab = null;
  }
  const currentUrl = tab?.pendingUrl || tab?.url;
  if (safeUrl(currentUrl)) {
    tab = { ...tab, url: currentUrl };
    $("url").value = currentUrl;
  }
  ready = true;
  paint();
})();
