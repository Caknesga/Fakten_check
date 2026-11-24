const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const runtimeLinks = {
  getManifest: () => manifest,
  getURL: file => "chrome-extension://demo/" + file
};

function demoWorker() {
  const context = vm.createContext({
    URL, Intl, console,
    importScripts: (...files) => files.forEach(file => vm.runInContext(read(file), context)),
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
    entries: vm.runInContext("DEMO_CASES", context),
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
  assert.throws(() => check({ url: "https://example.org", text: entry.claims[0].quote }), /No demo review/);
  assert.throws(() => check({ url: entry.url, text: "Angeblich: " + entry.claims[0].quote }), /quotes were not found/);
});

test("every configured demo matches its quotes and retains its prepared verdict", () => {
  const { entries, check } = demoWorker();
  const permissions = JSON.parse(read("manifest.json")).host_permissions;
  for (const entry of entries) {
    const hostname = new URL(entry.url).hostname;
    assert.ok(permissions.some(pattern => {
      const allowed = new URL(pattern).hostname;
      return allowed.startsWith("*.")
        ? hostname === allowed.slice(2) || hostname.endsWith(allowed.slice(1))
        : hostname === allowed;
    }), `Missing automatic access for ${hostname}`);
    const report = check({ url: entry.url + "?utm_source=demo&fbclid=tracking", text: entry.claims.map(c => c.quote).join("\n") });
    assert.equal(report.claims.length, entry.claims.length, entry.url);
    assert.deepEqual(report.claims.map(c => c.verdict), entry.claims.map(c => c.verdict));
  }
});

test("Facebook ellipses and scientific sentences wrapped across lines still match", () => {
  const { entries, check } = demoWorker();
  for (const entry of entries) {
    const text = entry.claims.map(c => c.quote.replace(/…/g, "...")
      .replace(/(.{65}?)\s/g, "$1\n")).join("\n");
    assert.equal(check({ url: entry.url, text }).claims.length, entry.claims.length, entry.url);
  }
});

function pageReaderFixture(initialBody, main = "") {
  const state = { body: initialBody, main, disconnected: false };
  const timers = new Map();
  let timerId = 0;
  let changed;
  const context = vm.createContext({
    document: {
      title: "Test page", documentElement: {},
      body: { get innerText() { return state.body; } },
      querySelectorAll: () => [{ get innerText() { return state.main; } }],
      querySelector: () => null
    },
    location: { href: "https://www.facebook.com/example" },
    MutationObserver: class {
      constructor(callback) { changed = callback; }
      observe() {}
      disconnect() { state.disconnected = true; }
    },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(read("page-reader.js"), context);
  return {
    state, read: quotes => context.readDemoPage(quotes),
    change: text => { state.body = text; changed(); },
    runTimer: delay => {
      for (const [id, timer] of [...timers]) {
        if (timer.delay === delay) { timers.delete(id); timer.callback(); }
      }
    },
    timers
  };
}

test("reader finds a short video caption outside a long main element", async () => {
  const caption = "USA airports yesterday …";
  const fixture = pageReaderFixture(caption, "Unrelated main text. ".repeat(100));
  const page = await fixture.read([caption]);
  assert.ok(page.text.includes(caption));
  assert.equal(fixture.timers.size, 0);
});

test("reader waits for dynamically inserted text and releases its observer", async () => {
  const fixture = pageReaderFixture("Loading video...");
  const promise = fixture.read(["USA airports yesterday …"]);
  fixture.change("USA airports yesterday...");
  fixture.runTimer(100);
  const page = await promise;
  assert.match(page.text, /USA airports yesterday/);
  assert.equal(fixture.state.disconnected, true);
  assert.equal(fixture.timers.size, 0);
});

test("reader returns actual page text when login or missing content prevents a match", async () => {
  const fixture = pageReaderFixture("Please log in to view this post.");
  const promise = fixture.read(["USA airports yesterday …"]);
  fixture.runTimer(8000);
  const page = await promise;
  assert.match(page.text, /Please log in/);
  assert.ok(!page.text.includes("USA airports"));
  assert.equal(fixture.state.disconnected, true);
});

// Use IDs from the actual HTML so references to removed controls fail at startup.
class Element {
  constructor() {
    this.value = "";
    this.children = [];
    this.listeners = {};
    this.dataset = {};
    this.attributes = {};
  }
  get childElementCount() { return this.children.length; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, handler) { this.listeners[type] = handler; }
}

async function popupFixture({ loading = false, index = 0 } = {}) {
  const worker = demoWorker();
  const entry = worker.entries[index];
  const html = read("popup.html");
  const ids = new Map([...html.matchAll(/\bid="([^"]+)"/g)]
    .map(([, id]) => [id, new Element()]));
  const changes = [];
  let requests = 0;
  let checks = 0;
  let now = 0;
  const timers = [];
  class FakeDate extends Date { static now() { return now; } }
  const publishReport = () => {
    const report = worker.check({ url: entry.url, text: entry.claims[0].quote });
    for (const handler of changes) handler({ job: { newValue: {
      status: "done", url: entry.url, report
    } } }, "local");
  };
  const context = vm.createContext({
    URL, console, Date: FakeDate,
    setTimeout: (callback, delay) => { timers.push({ callback, at: now + delay }); return timers.length; },
    document: {
      getElementById: id => ids.get(id) || null
    },
    chrome: {
      storage: {
        local: { get: async () => ({}) },
        onChanged: { addListener: handler => changes.push(handler) }
      },
      tabs: { query: async () => [{ id: 1,
        url: loading ? "https://example.org" : entry.url,
        pendingUrl: loading ? entry.url : undefined
      }] },
      permissions: { request: async () => { requests++; return false; } },
      scripting: {
        executeScript: async () => [{ result: {
          title: "Demo article", url: entry.url,
          text: entry.claims[0].quote + "\nMore article text."
        } }]
      },
      runtime: {
        ...runtimeLinks,
        sendMessage: async message => {
          assert.equal(message.type, "check");
          checks++;
          const report = worker.check(message.page);
          // A fast worker can finish before the popup receives its acknowledgement.
          for (const handler of changes) handler({ job: { newValue: {
            status: "done", url: message.page.url, report
          } } }, "local");
          return { ok: true };
        }
      }
    }
  });
  for (const [, src] of html.matchAll(/<script src="([^"]+)">/g)) vm.runInContext(read(src), context);
  await new Promise(resolve => setImmediate(resolve));
  return {
    ids, requests: () => requests, checks: () => checks,
    publishReport,
    reportForTab: () => context.reportForTab(),
    advance: ms => {
      now += ms;
      for (const timer of timers.splice(0)) {
        if (timer.at <= now) timer.callback();
        else timers.push(timer);
      }
    },
    submit: () => ids.get("form").listeners.submit({ preventDefault() {} })
  };
}

test("popup starts with the real HTML and renders a completed active-tab demo", async () => {
  const popup = await popupFixture();
  popup.advance(3000);
  assert.match(popup.ids.get("url").value, /spiegel\.de/);
  assert.equal(popup.ids.get("go").disabled, false);
  await popup.submit();
  assert.equal(popup.checks(), 1);
  assert.equal(popup.requests(), 0);
  assert.equal(popup.ids.get("status-title").textContent, "Claims supported");
  assert.equal(popup.ids.get("status").dataset.tone, "green");
  assert.equal(popup.ids.get("go").disabled, false);
  assert.equal(popup.ids.get("stop").hidden, true);
  assert.match(popup.ids.get("status-scope").textContent, /1 matched claim/);
});

test("denied access to a pasted link displays an error and allows retry", async () => {
  const popup = await popupFixture();
  const input = popup.ids.get("url");
  input.value = "https://example.org/article";
  input.listeners.input();
  await popup.submit();
  assert.equal(popup.requests(), 1);
  assert.equal(popup.checks(), 0);
  assert.match(popup.ids.get("status-description").textContent, /Website access was declined/);
  assert.equal(popup.ids.get("go").disabled, false);
});

async function automaticFixture(index = 0) {
  const entry = demoWorker().entries[index];
  const events = {};
  const data = { marksOn: false };
  const tab = { id: 7, windowId: 2, active: true, status: "complete", url: entry.url };
  const popups = [];
  let reads = 0;
  let text = entry.claims[0].quote;
  let focused = true;
  let now = 0;
  const timers = [];
  const highlights = [];
  class FakeDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    URL, Intl, console, AbortController, Date: FakeDate,
    setTimeout: (callback, delay) => { timers.push({ callback, at: now + delay }); },
    importScripts: (...files) => files.forEach(file => vm.runInContext(read(file), context)),
    chrome: {
      tabs: {
        get: async () => ({ ...tab }),
        onUpdated: { addListener: fn => { events.updated = fn; } },
        onActivated: { addListener: fn => { events.activated = fn; } },
        onRemoved: { addListener: fn => { events.removed = fn; } }
      },
      windows: { get: async () => ({ focused }) },
      runtime: { ...runtimeLinks, onMessage: { addListener() {} } },
      action: {
        setIcon: async () => {}, setTitle: async () => {},
        openPopup: async options => { popups.push({ options, job: structuredClone(data.job) }); }
      },
      storage: { local: {
        get: async () => structuredClone(data),
        set: async values => { Object.assign(data, structuredClone(values)); }
      } },
      scripting: { executeScript: async options => {
        if (options.func?.name === "readDemoPage") {
          reads++;
          return [{ result: { url: tab.url, title: "Article", text } }];
        }
        if (options.args?.[0]?.claims) {
          highlights.push(options.args[0]);
          return [{ result: [true] }];
        }
        return [{ result: null }];
      } }
    }
  });
  vm.runInContext(read("background.js"), context);
  context.drawIcon = () => ({});
  await new Promise(resolve => setImmediate(resolve));
  return {
    tab, data, popups, events, context, reads: () => reads,
    highlights,
    advance: ms => {
      now += ms;
      for (const timer of timers.splice(0)) {
        if (timer.at <= now) timer.callback();
        else timers.push(timer);
      }
    },
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

test("first popup loads for three seconds then reveals the demo verdict automatically", async () => {
  const fixture = await popupFixture({ loading: true });
  assert.match(fixture.ids.get("url").value, /spiegel\.de/);
  assert.equal(fixture.ids.get("status-title").textContent, "Checking this page");
  assert.equal(fixture.ids.get("status").dataset.tone, "neutral");
  assert.equal(fixture.ids.get("go").disabled, true);
  fixture.advance(2999);
  assert.equal(fixture.ids.get("status-title").textContent, "Checking this page");
  fixture.advance(1);
  assert.equal(fixture.ids.get("status").dataset.tone, "green");
  assert.equal(fixture.ids.get("status-scope").textContent, "Prepared demo rating");
  assert.equal(fixture.checks(), 0);
});

test("fast background results stay hidden until the demo loading interval ends", async () => {
  const fixture = await popupFixture();
  fixture.publishReport();
  assert.equal(fixture.ids.get("status-title").textContent, "Checking this page");
  assert.equal(fixture.ids.get("status").dataset.tone, "neutral");
  fixture.advance(3000);
  assert.equal(fixture.ids.get("status").dataset.tone, "green");
  assert.match(fixture.ids.get("status-scope").textContent, /1 matched claim/);
  assert.equal(fixture.ids.get("go").disabled, false);
});

test("an immediately opened popup associates the report with the destination tab", async () => {
  const fixture = await popupFixture({ loading: true });
  fixture.publishReport();
  fixture.advance(3000);
  assert.ok(fixture.reportForTab(), "The marking controls must use the destination URL, not the previous page");
});

test("the popup links to the matching demo report with its explanation and references", async () => {
  const { entries } = demoWorker();
  const tones = ["green", "red", "yellow"];
  for (const [index, entry] of entries.entries()) {
    const popup = await popupFixture({ index });
    popup.publishReport();
    popup.advance(3000);
    assert.equal(popup.ids.get("status").dataset.tone, tones[index]);
    const link = new URL(popup.ids.get("report-link").href);
    assert.equal(link.origin, new URL(manifest.homepage_url || runtimeLinks.getURL("website/index.html")).origin);
    assert.equal(link.hash, "#" + entry.id);

    const targets = { "case-list": new Element(), report: new Element() };
    const context = vm.createContext({
      URL, location: { hash: link.hash }, window: { addEventListener() {} },
      document: { getElementById: id => targets[id], createElement: () => new Element() }
    });
    for (const [, src] of read("website/index.html").matchAll(/<script src="([^"]+)">/g)) {
      vm.runInContext(read(path.join("website", src)), context);
    }
    const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
    const content = descendants(targets.report);
    assert.equal(content.find(node => node.id === "report-title").textContent, entry.title);
    for (const claim of entry.claims) {
      assert.ok(content.some(node => node.textContent === claim.explanation));
      for (const source of [...claim.supporting, ...claim.contradicting]) {
        assert.ok(content.some(node => node.href === source.url), source.url);
      }
    }
  }
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

test("all demo cases run automatically, including navigation without a full reload", async () => {
  for (const [index, entry] of demoWorker().entries.entries()) {
    const fixture = await automaticFixture(index);
    fixture.events.updated(7, { url: entry.url }, fixture.tab);
    await fixture.settle();
    assert.equal(fixture.reads(), 1, entry.url);
    assert.equal(fixture.data.job.status, "done", entry.url);
    assert.equal(fixture.data.job.report.claims[0].verdict, entry.claims[0].verdict);
    assert.equal(fixture.popups.length, 1);
  }
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

test("quotes highlight automatically after the three-second popup loading interval", async () => {
  const fixture = await automaticFixture();
  fixture.data.marksOn = true;
  fixture.events.updated(7, { status: "complete" }, fixture.tab);
  await fixture.settle();
  assert.equal(fixture.popups.length, 1);
  assert.equal(fixture.data.job.status, "done");
  assert.equal(fixture.highlights.length, 0);
  fixture.advance(2999);
  await fixture.settle();
  assert.equal(fixture.highlights.length, 0);
  fixture.advance(1);
  await fixture.settle();
  assert.equal(fixture.highlights.length, 1);
  assert.equal(fixture.highlights[0].claims[0].quote, fixture.data.job.report.claims[0].quote);
});

test("delayed highlighting respects disabling marks or leaving the article", async () => {
  for (const leavePage of [false, true]) {
    const fixture = await automaticFixture();
    fixture.data.marksOn = true;
    fixture.events.updated(7, { status: "complete" }, fixture.tab);
    await fixture.settle();
    if (leavePage) fixture.tab.url = "https://example.org";
    else fixture.data.marksOn = false;
    fixture.advance(3000);
    await fixture.settle();
    assert.equal(fixture.highlights.length, 0);
  }
});
