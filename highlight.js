// Marks matched quotes in the page and links to the full report.
(() => {
  if (globalThis.__fc?.version === 4) return;
  globalThis.__fc?.clear();

  const COLORS = {
    falsch:       { line: "#d93025", bg: "rgba(229,56,59,.16)", label: "False" },
    irrefuehrend: { line: "#e0a100", bg: "rgba(244,180,0,.20)", label: "Misleading" },
    wahr:         { line: "#1e9e55", bg: "rgba(47,179,94,.15)", label: "Supported" },
    unklar:       { line: "#e0a100", bg: "rgba(244,180,0,.20)", label: "Unclear" }
  };
  const LIGHT = { r: "#e5383b", y: "#f4b400", g: "#2fb35e" };
  const normV = v => { v = String(v || "").toLowerCase().replace("ü", "ue");
    if (v.startsWith("wahr")) return "wahr"; if (v.startsWith("falsch")) return "falsch"; if (v.startsWith("irref")) return "irrefuehrend"; return "unklar"; };
  function reportHref(value) {
    try {
      const url = new URL(value);
      if (/^https?:$/.test(url.protocol)) return url.href;
      if (url.protocol === "chrome-extension:" && url.hostname === chrome.runtime.id && url.pathname === "/website/index.html") return url.href;
    } catch {
      // Older cached reports may not include a details link.
    }
    return null;
  }

  /* ---------- page styles for the marks (custom tag, so page CSS rarely touches it) ---------- */
  function ensureStyle() {
    const st = document.getElementById("__fc-style") || document.createElement("style"); st.id = "__fc-style";
    st.textContent = Object.entries(COLORS).map(([k, c]) =>
      `fc-mark[data-v="${k}"]{background:${c.bg};border-bottom:2.5px solid ${c.line};}`).join("\n") +
      `fc-mark{display:inline;cursor:help;border-radius:2px;padding:0 1px;color:inherit;font:inherit;transition:box-shadow .2s;}
       fc-mark[data-v="unklar"]{border-bottom-style:dashed;}
       fc-mark.__fc-flash{box-shadow:0 0 0 3px rgba(28,79,196,.55);}`;
    (document.head || document.documentElement).append(st);
  }

  /* ---------- text index: normalized page text with a map back to text nodes ---------- */
  const SKIP = "script,style,noscript,template,textarea,select,option,svg,canvas,iframe,fc-ui";
  const BLOCK = "p,div,li,h1,h2,h3,h4,h5,h6,td,th,blockquote,section,article,figcaption,dd,dt,pre,header,footer,main,aside";
  function normChar(c) {
    if (/\s/.test(c)) return " ";
    if ("­​‌‍﻿".includes(c)) return "";
    if ("‘’‚‛′`´".includes(c)) return "'";
    if ("“”„‟″«»‹›".includes(c)) return '"';
    if ("‐‑‒–—―−".includes(c)) return "-";
    if (c === "…") return "...";
    return c.toLowerCase();
  }
  function norm(s) { let o = "", sp = true; for (const c of String(s)) { const n = normChar(c); for (const ch of n) { if (ch === " ") { if (!sp) o += " "; sp = true; } else { o += ch; sp = false; } } } return o.trim(); }

  function buildIndex() {
    let text = "", map = [], sp = true, lastBlock = null;
    const hidden = new WeakMap();
    const isHidden = el => {
      if (!el) return false;
      if (hidden.has(el)) return hidden.get(el);
      const style = getComputedStyle(el);
      // display:contents has no rectangle, although its text is visible.
      const h = style.display === "none" || style.visibility === "hidden" ||
        style.visibility === "collapse" || isHidden(el.parentElement);
      hidden.set(el, h);
      return h;
    };
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(n) { const p = n.parentElement; if (!p || p.closest(SKIP) || isHidden(p)) return NodeFilter.FILTER_REJECT; return NodeFilter.FILTER_ACCEPT; }
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      const block = n.parentElement.closest(BLOCK);
      if (block !== lastBlock && !sp) { text += " "; map.push(null); sp = true; }
      lastBlock = block;
      const v = n.nodeValue;
      for (let i = 0; i < v.length; i++) {
        const nc = normChar(v[i]);
        for (const ch of nc) {
          if (ch === " ") { if (!sp) { text += " "; map.push(null); } sp = true; }
          else { text += ch; map.push([n, i]); sp = false; }
        }
      }
    }
    return { text, map };
  }

  function locate(idx, quote, claim) {
    const q = norm(quote || "").replace(/^["'\s]+|["'\s.,;:]+$/g, "");
    const t = idx.text;
    const parts = q.split(/\s*(?:\.\.\.|\[\.\.\.\]|\(\.\.\.\))\s*/).map(s => s.trim()).filter(s => s.length >= 12).sort((a, b) => b.length - a.length);
    for (const p of parts) { const i = t.indexOf(p); if (i >= 0) return [i, i + p.length]; }
    const longest = parts[0] || q;
    if (longest.length > 50) {
      // a partial match is stretched to the sentence it sits in, so the mark never stops mid-phrase
      const sentenceEnd = i => { const m = /[.!?](?:\s|$)/g; m.lastIndex = i; const r = m.exec(t); return r ? r.index + 1 : t.length; };
      const sentenceStart = i => { const s = Math.max(t.lastIndexOf(". ", i), t.lastIndexOf("! ", i), t.lastIndexOf("? ", i)); return s < 0 ? 0 : s + 2; };
      const head = longest.slice(0, 50).trim(), tail = longest.slice(-50).trim();
      let i = t.indexOf(head);
      if (i >= 0) return [i, Math.min(sentenceEnd(i + head.length), i + longest.length + 40)];
      i = t.indexOf(tail);
      if (i >= 0) return [Math.max(sentenceStart(i), i + tail.length - longest.length - 40), i + tail.length];
    }
    // fuzzy: the sentence that shares most words with the quote (or the claim)
    const words = s => new Set(s.split(/[^\p{L}\p{N}]+/u).filter(x => x.length >= 4));
    const target = words(q.length >= 20 ? q : norm(claim || ""));
    if (target.size < 3) return null;
    let best = null, bestScore = 0;
    const re = /[^.!?]+[.!?]?/g; let m;
    while ((m = re.exec(t))) {
      const s = m[0]; if (s.trim().length < 25) continue;
      const ws = words(s); let hit = 0; for (const x of target) if (ws.has(x)) hit++;
      const score = hit / target.size;
      if (score > bestScore) { bestScore = score; const lead = s.length - s.trimStart().length; best = [m.index + lead, m.index + s.trimEnd().length]; }
    }
    return bestScore >= 0.55 ? best : null;
  }

  function wrapRange(idx, [a, b], i, v) {
    const groups = new Map();
    for (let k = a; k < b; k++) { const e = idx.map[k]; if (!e) continue; const [n, o] = e;
      const g = groups.get(n); if (g) { g[0] = Math.min(g[0], o); g[1] = Math.max(g[1], o + 1); } else groups.set(n, [o, o + 1]); }
    const marks = [];
    for (const [node, [s, e]] of groups) {
      if (!node.parentNode || node.parentElement.closest("fc-mark")) continue;
      let mid = node; if (s > 0) mid = node.splitText(s);
      if (e - s < mid.nodeValue.length) mid.splitText(e - s);
      const m = document.createElement("fc-mark"); m.dataset.i = i; m.dataset.v = v;
      mid.parentNode.replaceChild(m, mid); m.append(mid); marks.push(m);
    }
    return marks;
  }

  /* ---------- tooltip + summary pill (shadow DOM, isolated from page CSS) ---------- */
  let ui = null, report = null, pinned = false, hideT = null;
  let markObserver = null, markRetry = null;

  function watchMarks() {
    markObserver = new MutationObserver(() => {
      if (!report || markRetry !== null) return;
      if (report.claims.every((_, i) => document.querySelector(`fc-mark[data-i="${i}"]`))) return;
      markRetry = setTimeout(() => {
        markRetry = null;
        if (report) apply(report);
      }, 200);
    });
    markObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function ensureUi() {
    if (ui) return ui;
    const hostEl = document.createElement("fc-ui");
    hostEl.style.cssText = "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647";
    const root = hostEl.attachShadow({ mode: "open" });
    root.innerHTML = `<style>
      *{box-sizing:border-box;font-family:"IBM Plex Sans",system-ui,-apple-system,"Segoe UI",sans-serif}
      .tip{position:fixed;width:270px;max-width:calc(100vw - 24px);background:#fff;color:#0f1b2d;border:1px solid #dde2ea;border-radius:12px;box-shadow:0 12px 32px -10px rgba(15,27,45,.35);padding:14px;pointer-events:auto;font-size:13.5px;line-height:1.5;display:none}
      .tip.on{display:block}
      .row{display:flex;justify-content:space-between;align-items:center;gap:8px}
      .chip{font-weight:600;font-size:12px;border-radius:999px;padding:3px 9px;color:#fff}
      .brand{font:500 10.5px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em;text-transform:uppercase;color:#566275}
      .report-link{display:inline-block;margin-top:8px;color:#244b9d;font-weight:600;text-underline-offset:2px}
      .pill{position:fixed;right:16px;bottom:16px;display:flex;align-items:center;gap:10px;background:#141c2b;color:#fff;border-radius:999px;padding:8px 8px 8px 12px;font-size:13px;pointer-events:auto;box-shadow:0 8px 24px -8px rgba(0,0,0,.45)}
      .lamp{display:flex;gap:3px}.lamp i{width:9px;height:9px;border-radius:50%;background:#3a4458;display:block}
      .pill button{all:unset;cursor:pointer;background:rgba(255,255,255,.12);border-radius:999px;padding:4px 10px;font-size:12px}
      .pill button:hover{background:rgba(255,255,255,.22)}
      .pill[hidden]{display:none}
    </style><div class="tip" part="tip"></div><div class="pill" hidden></div>`;
    document.documentElement.append(hostEl);
    const tip = root.querySelector(".tip");
    tip.addEventListener("mouseenter", () => clearTimeout(hideT));
    tip.addEventListener("mouseleave", () => { if (!pinned) hideSoon(); });
    ui = { hostEl, root, tip, pill: root.querySelector(".pill") };
    return ui;
  }
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function showTip(mark) {
    clearTimeout(hideT);
    const c = report && report.claims[+mark.dataset.i]; if (!c) return;
    const { tip } = ensureUi(); const v = normV(c.verdict), col = COLORS[v];
    tip.replaceChildren();
    const row = el("div", "row");
    const chip = el("span", "chip", col.label);
    chip.style.background = col.line;
    if (v === "unklar" || v === "irrefuehrend") chip.style.color = "#231b08";
    row.append(chip, el("span", "brand", "Demo review"));
    tip.append(row);
    const href = reportHref(report.detailsUrl);
    if (href) {
      const link = el("a", "report-link", "View full report");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      if (href.startsWith("chrome-extension:")) {
        link.onclick = event => {
          event.preventDefault();
          void chrome.runtime.sendMessage({ type: "open-report", source: report.source }).catch(console.error);
        };
      }
      tip.append(link);
    }
    tip.classList.add("on");
    const r = mark.getBoundingClientRect(), tw = Math.min(270, innerWidth - 24);
    let left = Math.min(Math.max(12, r.left), innerWidth - tw - 12);
    tip.style.left = left + "px"; tip.style.top = "0px";
    const th = tip.offsetHeight;
    const below = r.bottom + 8, above = r.top - th - 8;
    tip.style.top = (below + th < innerHeight - 8 || above < 8 ? Math.min(below, innerHeight - th - 8) : above) + "px";
  }
  function hideSoon() { clearTimeout(hideT); hideT = setTimeout(() => ui && ui.tip.classList.remove("on"), 250); }

  function onOver(e) { const m = e.target.closest && e.target.closest("fc-mark"); if (m) showTip(m); }
  function onOut(e) { const m = e.target.closest && e.target.closest("fc-mark"); if (m && !pinned) hideSoon(); }
  function onClick(e) {
    const m = e.target.closest && e.target.closest("fc-mark");
    if (m) { pinned = true; showTip(m); return; }
    if (ui && !e.composedPath().includes(ui.hostEl)) { pinned = false; ui.tip.classList.remove("on"); }
  }

  function showPill(found) {
    const { pill } = ensureUi(); pill.replaceChildren();
    const lamp = el("span", "lamp"); const light = report.light;
    for (const k of ["r", "y", "g"]) { const i = el("i"); if (k === light) { i.style.background = LIGHT[k]; i.style.boxShadow = "0 0 6px " + LIGHT[k]; } lamp.append(i); }
    const score = report.overall && report.overall.score != null ? " · " + Math.round(+report.overall.score) + "/100" : "";
    const b = el("button", null, "Hide"); b.onclick = () => clear();
    pill.append(lamp, el("span", null, `BAware${score} · ${found} of ${report.claims.length} claims highlighted`), b);
    pill.hidden = false;
  }

  function clear() {
    markObserver?.disconnect(); markObserver = null;
    clearTimeout(markRetry); markRetry = null;
    document.querySelectorAll("fc-mark").forEach(m => { const p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
    if (ui) { ui.tip.classList.remove("on"); ui.pill.hidden = true; }
    document.removeEventListener("mouseover", onOver, true); document.removeEventListener("mouseout", onOut, true); document.removeEventListener("click", onClick, true);
    report = null; pinned = false;
  }

  function apply(rep) {
    clear(); if (!rep || !Array.isArray(rep.claims) || !document.body) return [];
    report = rep; ensureStyle();
    const found = rep.claims.map((c, i) => {
      const idx = buildIndex(); const r = locate(idx, c.quote, c.claim);
      return r ? wrapRange(idx, r, i, normV(c.verdict)).length > 0 : false;
    });
    document.addEventListener("mouseover", onOver, true); document.addEventListener("mouseout", onOut, true); document.addEventListener("click", onClick, true);
    showPill(found.filter(Boolean).length);
    watchMarks();
    return found;
  }

  function focus(i) {
    const marks = [...document.querySelectorAll(`fc-mark[data-i="${i}"]`)]; if (!marks.length) return false;
    marks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    marks.forEach(m => m.classList.add("__fc-flash"));
    setTimeout(() => { marks.forEach(m => m.classList.remove("__fc-flash")); pinned = true; showTip(marks[0]); }, 650);
    return true;
  }

  globalThis.__fc = { version: 4, apply, clear, focus, active: () => !!report };
})();
