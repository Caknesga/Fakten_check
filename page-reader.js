// Self-contained so Chrome can inject the same reader from the popup and worker.
async function readDemoPage(quotes = []) {
  const normalize = value => String(value || "").normalize("NFC")
    .replace(/[\u00ad\u200b-\u200d\ufeff]/g, "")
    .replace(/…/g, "...").replace(/\s*\.{3}/g, "...")
    .replace(/[‐‑‒–—―−]/g, "-").replace(/\s+/g, " ").trim();
  const extract = () => {
    const candidates = [...document.querySelectorAll("article, main, [role=main]")]
      .map(node => node.innerText || "");
    // Captions and scientific abstracts may sit outside the main article element.
    const text = [...candidates, document.body?.innerText || ""].join("\n\n");
    return {
      title: document.title, url: location.href, text: text.slice(0, 200000),
      desc: String(document.querySelector('meta[name="description"],meta[property="og:description"]')?.content || "").slice(0, 400)
    };
  };
  const ready = page => !quotes.length || quotes.every(quote => normalize(page.text).includes(normalize(quote)));
  const initial = extract();
  if (ready(initial)) return initial;

  // Social feeds and publisher pages often render their text after the load event.
  return new Promise(resolve => {
    let pending = null;
    let finished = false;
    const finish = page => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      clearTimeout(timeout);
      clearTimeout(pending);
      resolve(page);
    };
    const observer = new MutationObserver(() => {
      if (pending !== null) return;
      pending = setTimeout(() => {
        pending = null;
        const page = extract();
        if (ready(page)) finish(page);
      }, 100);
    });
    const timeout = setTimeout(() => finish(extract()), 8000);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true, attributes: true
    });
    // Cover content inserted between the initial read and attaching the observer.
    const page = extract();
    if (ready(page)) finish(page);
  });
}
