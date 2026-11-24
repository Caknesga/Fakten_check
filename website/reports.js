"use strict";

function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content) node.textContent = content;
  return node;
}

function externalLink(label, url, className) {
  const link = element("a", className, label);
  link.href = url.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  return link;
}

function renderSources(title, sources) {
  const section = element("section", "source-group");
  section.append(element("h4", null, title));

  const list = element("ul");
  for (const source of sources || []) {
    const url = safeUrl(source.url);
    if (!url) continue;
    const item = element("li");
    item.append(externalLink(source.title || url.hostname, url));
    if (source.statement) item.append(element("p", "source-note", source.statement));
    list.append(item);
  }
  section.append(list.childElementCount ? list : element("p", null, "No references listed."));
  return section;
}

function renderClaim(claim) {
  const section = element("section", "claim");
  section.dataset.tone = reviewStatus({ claims: [claim] }).tone;
  const heading = element("div", "claim-heading");
  heading.append(
    element("h3", "section-label", "Reviewed claim"),
    element("span", "rating", CLAIM_LABELS[claim.verdict] || CLAIM_LABELS.unklar)
  );
  section.append(heading, element("blockquote", null, claim.translation || claim.quote));

  if (claim.translation) {
    const original = element("details", "original");
    const quote = element("p", null, claim.quote);
    quote.lang = "de";
    original.append(element("summary", null, "Original quote in German"), quote);
    section.append(original);
  }
  if (claim.explanation) section.append(element("p", "explanation", claim.explanation));

  const sources = element("div", "source-groups");
  sources.append(
    renderSources("Supporting references", claim.supporting),
    renderSources("Opposing references", claim.contradicting)
  );
  section.append(sources);
  return section;
}

const caseList = document.getElementById("case-list");
const report = document.getElementById("report");
const caseLinks = new Map();

for (const demo of DEMO_CASES) {
  const item = element("li");
  const link = element("a", "case-link", demo.title);
  link.href = "#" + demo.id;
  link.append(element("span", "case-domain", safeUrl(demo.url)?.hostname.replace(/^www\./, "")));
  item.append(link);
  caseList.append(item);
  caseLinks.set(demo.id, link);
}

let current = DEMO_CASES[0];
function showReport() {
  const selected = DEMO_CASES.find(demo => "#" + demo.id === location.hash);
  if (selected) current = selected;
  for (const [id, link] of caseLinks) {
    if (id === current.id) link.setAttribute("aria-current", "true");
    else link.removeAttribute("aria-current");
  }

  const status = reviewStatus(current);
  const header = element("header", "report-header");
  const title = element("h2", null, current.title);
  title.id = "report-title";
  const rating = element("span", "rating", status.title);
  rating.dataset.tone = status.tone;
  header.append(rating, title);
  const pageUrl = safeUrl(current.url);
  if (pageUrl) header.append(externalLink("Open original page", pageUrl, "page-link"));

  report.replaceChildren(header, ...current.claims.map(renderClaim));
  document.title = current.title + " | BAware";
}

window.addEventListener("hashchange", showReport);
showReport();
