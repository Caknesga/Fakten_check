const DEMO_LOADING_MS = 3000;

const CLAIM_LABELS = {
  wahr: "Supported",
  falsch: "False",
  irrefuehrend: "Misleading",
  unklar: "Unclear"
};

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
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
  }
  return url.href.replace(/\/$/, "");
}

function demoForUrl(value) {
  const url = normUrl(value);
  return url ? DEMO_CASES.find(entry => normUrl(entry.url) === url) : undefined;
}

function reportUrl(demo) {
  const homepage = safeUrl(chrome.runtime.getManifest().homepage_url);
  const url = homepage || new URL(chrome.runtime.getURL("website/index.html"));
  if (demo?.id) url.hash = demo.id;
  return url.href;
}

function reviewStatus(report) {
  const verdicts = report.claims.map(claim => claim.verdict);
  if (report.overall?.rating === "gemischt") {
    return { tone: "yellow", light: "y", title: "Partial check", reason: "Only some of the prepared claims were found on the page." };
  }
  if (verdicts.includes("falsch")) {
    return { tone: "red", light: "r", title: "Use caution", reason: "The demo flags at least one claim as false." };
  }
  if (verdicts.includes("irrefuehrend")) {
    return { tone: "yellow", light: "y", title: "Use caution", reason: "The demo flags at least one claim as misleading." };
  }
  if (verdicts.length && verdicts.every(verdict => verdict === "wahr")) {
    return { tone: "green", light: "g", title: "Claims supported", reason: "The prepared review supports the claims it covers." };
  }
  return { tone: "yellow", light: "y", title: "Evidence unclear", reason: "The sources in the demo leave the claim unresolved." };
}
