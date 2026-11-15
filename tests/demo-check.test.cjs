const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

function demoWorker() {
  const context = vm.createContext({
    URL, Intl, console,
    importScripts: () => vm.runInContext(read("demo-cases.js"), context),
    chrome: {
      tabs: {
        onUpdated: { addListener() {} },
        onActivated: { addListener() {} },
        onRemoved: { addListener() {} }
      },
      runtime: { onMessage: { addListener() {} } },
      storage: { local: { get: async () => ({}) } }
    }
  });
  vm.runInContext(read("background.js"), context);
  return {
    entry: vm.runInContext("DEMO_CASES[0]", context),
    check: page => context.checkDemo(page)
  };
}

test("configured article matches complete quotes, including whitespace variations", () => {
  const { entry, check } = demoWorker();
  const report = check({
    url: entry.url + "#article", title: "Demo article",
    text: entry.claims[0].quote.replace(/ /g, "  ")
  });
  assert.equal(report.claims.length, 1);
  assert.equal(report.claims[0].verdict, entry.claims[0].verdict);
  assert.equal(report.live, false);
});

test("unknown URLs and altered sentences cannot inherit a demo verdict", () => {
  const { entry, check } = demoWorker();
  assert.throws(() => check({ url: "https://example.org", text: entry.claims[0].quote }), /keine Demo/);
  assert.throws(() => check({ url: entry.url, text: "Angeblich: " + entry.claims[0].quote }), /nicht gefunden/);
});

// Use IDs from the actual HTML so references to removed controls fail at startup.
class Element {
  constructor() {
    this.value = "";
    this.children = [];
    this.listeners = {};
    this.style = { setProperty() {} };
    this.classList = { add() {}, remove() {} };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute() {}
  addEventListener(type, handler) { this.listeners[type] = handler; }
  querySelectorAll() { return []; }
  querySelector() { return new Element(); }
  focus() {}
}

async function popupFixture({ loading = false } = {}) {
  const worker = demoWorker();
  const ids = new Map([...read("popup.html").matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => [id, new Element()]));
  const changes = [];
  let requests = 0;
  let checks = 0;
  const context = vm.createContext({
    URL, console,
    document: {
      getElementById: id => ids.get(id) || null,
      createElement: () => new Element(),
      createDocumentFragment: () => new Element(),
      querySelectorAll: () => []
    },
    chrome: {
      storage: {
        local: { get: async () => ({}) },
        onChanged: { addListener: handler => changes.push(handler) }
      },
      tabs: { query: async () => [{ id: 1,
        url: loading ? "https://example.org" : worker.entry.url,
        pendingUrl: loading ? worker.entry.url : undefined
      }] },
      permissions: { request: async () => { requests++; return false; } },
      scripting: {
        executeScript: async () => [{ result: {
          title: "Demo article", url: worker.entry.url,
          text: worker.entry.claims[0].quote + "\n" + "Weiterer Artikeltext. ".repeat(20)
        } }]
      },
      runtime: {
        sendMessage: async message => {
          assert.equal(message.type, "check");
          checks++;
          const report = worker.check(message.page);
          // A fast worker can finish before the popup receives its acknowledgement.
          for (const handler of changes) handler({ job: { newValue: {
            status: "done", url: message.page.url, report,
            log: [{ m: "Demo-Prüfung abgeschlossen" }]
          } } }, "local");
          return { ok: true };
        }
      }
    }
  });
  vm.runInContext(read("demo-cases.js"), context);
  vm.runInContext(read("popup.js"), context);
  await new Promise(resolve => setImmediate(resolve));
  return {
    ids, requests: () => requests, checks: () => checks,
    submit: () => ids.get("form").listeners.submit({ preventDefault() {} })
  };
}

test("popup starts with the real HTML and renders a completed active-tab demo", async () => {
  const popup = await popupFixture();
  assert.match(popup.ids.get("url").value, /spiegel\.de/);
  assert.equal(popup.ids.get("go").disabled, false);
  await popup.submit();
  assert.equal(popup.checks(), 1);
  assert.equal(popup.requests(), 0);
  assert.equal(popup.ids.get("hudLabel").textContent, "Grün");
  assert.equal(popup.ids.get("go").disabled, false);
  assert.equal(popup.ids.get("stop").hidden, true);
  assert.ok(popup.ids.get("result").children.length);
});

test("denied access to a pasted link displays an error and allows retry", async () => {
  const popup = await popupFixture();
  popup.ids.get("url").value = "https://example.org/article";
  await popup.submit();
  assert.equal(popup.requests(), 1);
  assert.equal(popup.checks(), 0);
  assert.match(popup.ids.get("result").children[0].textContent, /Ohne Leserecht/);
  assert.equal(popup.ids.get("go").disabled, false);
});

async function automaticFixture() {
  const { entry } = demoWorker();
  const events = {};
  const data = { marksOn: false };
  const tab = { id: 7, windowId: 2, active: true, status: "complete", url: entry.url };
  const popups = [];
  let reads = 0;
  let text = entry.claims[0].quote;
  let focused = true;
  const context = vm.createContext({
    URL, Intl, console, AbortController,
    importScripts: () => vm.runInContext(read("demo-cases.js"), context),
    chrome: {
      tabs: {
        get: async () => ({ ...tab }),
        onUpdated: { addListener: fn => { events.updated = fn; } },
        onActivated: { addListener: fn => { events.activated = fn; } },
        onRemoved: { addListener: fn => { events.removed = fn; } }
      },
      windows: { get: async () => ({ focused }) },
      runtime: { onMessage: { addListener() {} } },
      action: {
        setIcon: async () => {}, setTitle: async () => {},
        openPopup: async options => { popups.push({ options, job: structuredClone(data.job) }); }
      },
      storage: { local: {
        get: async () => structuredClone(data),
        set: async values => { Object.assign(data, structuredClone(values)); }
      } },
      scripting: { executeScript: async () => {
        reads++;
        return [{ result: { url: tab.url, title: "Article", text } }];
      } }
    }
  });
  vm.runInContext(read("background.js"), context);
  context.drawIcon = () => ({});
  await new Promise(resolve => setImmediate(resolve));
  return {
    tab, data, popups, events, context, reads: () => reads,
    setText: value => { text = value; },
    setFocused: value => { focused = value; },
    settle: async () => {
      for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve));
    }
  };
}

test("loading a demo opens the popup before the check and updates results automatically", async () => {
  const fixture = await automaticFixture();
  fixture.tab.status = "loading";
  fixture.events.updated(7, { status: "loading" }, fixture.tab);
  await fixture.settle();
  assert.equal(fixture.popups.length, 1);
  assert.equal(fixture.reads(), 0);
  assert.equal(fixture.popups[0].job, undefined);
  fixture.tab.status = "complete";
  fixture.events.updated(7, { status: "complete" }, fixture.tab);
  await fixture.settle();
  assert.equal(fixture.reads(), 1);
  assert.equal(fixture.popups.length, 1);
  assert.equal(fixture.popups[0].options.windowId, 2);
  assert.equal(fixture.data.job.status, "done");
  assert.equal(fixture.data.job.report.claims.length, 1);
  // Reload must inspect the current document rather than reuse a stale report.
  fixture.setText("The article no longer contains the prepared sentence.");
  fixture.events.updated(7, { status: "loading" }, fixture.tab);
  fixture.events.updated(7, { status: "complete" }, fixture.tab);
  await fixture.settle();
  assert.equal(fixture.reads(), 2);
  assert.equal(fixture.data.job.status, "error");
  assert.equal(fixture.popups.length, 2);
});

test("first popup shows the prepared demo verdict for a loading page without a button click", async () => {
  const fixture = await popupFixture({ loading: true });
  assert.match(fixture.ids.get("url").value, /spiegel\.de/);
  assert.equal(fixture.ids.get("hudLabel").textContent, "Grün");
  assert.match(fixture.ids.get("modeNote").textContent, /Vorbereitete Demo-Bewertung/);
  assert.ok(fixture.ids.get("result").children.length);
  assert.equal(fixture.checks(), 0);
});

test("activating an already loaded demo triggers a check", async () => {
  const fixture = await automaticFixture();
  fixture.events.activated({ tabId: 7 });
  await fixture.settle();
  assert.equal(fixture.reads(), 1);
  assert.equal(fixture.popups.length, 1);
  fixture.events.activated({ tabId: 7 });
  await fixture.settle();
  assert.equal(fixture.reads(), 2);
  assert.equal(fixture.popups.length, 2);
});

test("unsupported URLs are not read and background windows do not open popups", async () => {
  const fixture = await automaticFixture();
  const demoUrl = fixture.tab.url;
  fixture.tab.url = "https://example.org";
  fixture.events.updated(7, { status: "complete" }, fixture.tab);
  await fixture.settle();
  assert.equal(fixture.reads(), 0);
  fixture.tab.url = demoUrl;
  fixture.setFocused(false);
  fixture.events.updated(7, { status: "complete" }, fixture.tab);
  await fixture.settle();
  assert.equal(fixture.data.job.status, "done");
  assert.equal(fixture.popups.length, 0);
});

test("a finished result cannot open over a different page", async () => {
  const fixture = await automaticFixture();
  const source = fixture.tab.url;
  fixture.tab.url = "https://example.org";
  await fixture.context.openResultPopup(7, source);
  assert.equal(fixture.popups.length, 0);
  fixture.tab.url = source;
  fixture.tab.active = false;
  await fixture.context.openResultPopup(7, source);
  assert.equal(fixture.popups.length, 0);
});
