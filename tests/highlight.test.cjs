const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

// Small DOM fixture exercising the actual text walker and range wrapping code.
class Element {
  constructor(tag) {
    this.tag = tag; this.children = []; this.dataset = {}; this.style = {};
    this.classList = { add() {}, remove() {} };
  }
  get parentElement() { return this.parentNode || null; }
  get firstChild() { return this.children[0] || null; }
  get textContent() { return this.children.map(child => child.textContent).join(""); }
  set textContent(text) { this.replaceChildren(new Text(text)); }
  append(...nodes) {
    for (const node of nodes) {
      node.parentNode?.removeChild(node);
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    for (const child of [...this.children]) this.removeChild(child);
    this.append(...nodes);
  }
  insertBefore(node, before) {
    node.parentNode?.removeChild(node);
    this.children.splice(this.children.indexOf(before), 0, node);
    node.parentNode = this;
  }
  removeChild(node) {
    this.children.splice(this.children.indexOf(node), 1);
    node.parentNode = null;
  }
  replaceChild(node, old) { this.insertBefore(node, old); this.removeChild(old); }
  normalize() {}
  addEventListener() {}
  getClientRects() { return this.style.display === "contents" ? [] : [{}]; }
  closest(selectors) {
    return selectors.split(",").includes(this.tag) ? this : this.parentElement?.closest(selectors) || null;
  }
  attachShadow() {
    const tip = new Element("div"), pill = new Element("div");
    return { set innerHTML(_) {}, querySelector: selector => selector === ".tip" ? tip : pill };
  }
}

class Text {
  constructor(text) { this.nodeValue = text; }
  get parentElement() { return this.parentNode || null; }
  get textContent() { return this.nodeValue; }
  splitText(offset) {
    const tail = new Text(this.nodeValue.slice(offset));
    this.nodeValue = this.nodeValue.slice(0, offset);
    const parent = this.parentNode;
    parent.children.splice(parent.children.indexOf(this) + 1, 0, tail);
    tail.parentNode = parent;
    return tail;
  }
}

function fixture() {
  const html = new Element("html"), head = new Element("head"), body = new Element("body");
  html.append(head, body);
  const paragraph = new Element("p"), span = new Element("span");
  span.style.display = "contents";
  const quote = "This visible scientific statement needs further evidence.";
  span.append(new Text(quote)); paragraph.append(span); body.append(paragraph);
  const all = root => root.children.flatMap(child => child instanceof Element ? [child, ...all(child)] : []);
  const find = selector => all(html).filter(node => {
    if (selector.startsWith("#")) return node.id === selector.slice(1);
    const match = selector.match(/^fc-mark(?:\[data-i="(\d+)"\])?$/);
    return match && node.tag === "fc-mark" && (match[1] === undefined || node.dataset.i == match[1]);
  });
  let observer;
  const timers = new Map();
  let timerId = 0;
  const context = vm.createContext({
    console, URL,
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    getComputedStyle: node => ({ display: node.style.display || "block", visibility: node.style.visibility || "visible" }),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe() { this.connected = true; }
      disconnect() { this.connected = false; }
    },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; },
    clearTimeout: id => timers.delete(id),
    document: {
      body, head, documentElement: html,
      createElement: tag => new Element(tag),
      getElementById: id => find("#" + id)[0] || null,
      querySelectorAll: find, querySelector: selector => find(selector)[0] || null,
      addEventListener() {}, removeEventListener() {},
      createTreeWalker: (root, _, filter) => {
        const nodes = [];
        const visit = element => {
          for (const child of element.children) {
            if (child instanceof Text) {
              if (filter.acceptNode(child) === 1) nodes.push(child);
            } else visit(child);
          }
        };
        visit(root);
        let index = 0;
        return { nextNode: () => nodes[index++] || null };
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "highlight.js"), "utf8"), context);
  return {
    api: context.__fc, find,
    report: { claims: [{ quote, claim: quote, verdict: "unklar" }], light: "y" },
    redraw: () => { span.replaceChildren(new Text(quote)); observer.callback(); },
    flush: () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback(); } },
    observing: () => observer.connected
  };
}

test("visible text in display:contents elements is found and highlighted yellow", () => {
  const page = fixture();
  assert.equal(page.api.apply(page.report)[0], true);
  assert.equal(page.find("fc-mark").length, 1);
  assert.equal(page.find("fc-mark")[0].dataset.v, "unklar");
  assert.match(page.find("#__fc-style")[0].textContent, /data-v="unklar"[^}]*#e0a100/);
});

test("website redraws restore lost highlights, while clearing stops restoration", () => {
  const page = fixture();
  page.api.apply(page.report);
  page.redraw();
  assert.equal(page.find("fc-mark").length, 0);
  page.flush();
  assert.equal(page.find("fc-mark").length, 1);
  page.api.clear();
  assert.equal(page.find("fc-mark").length, 0);
  assert.equal(page.observing(), false);
  page.flush();
  assert.equal(page.find("fc-mark").length, 0);
});
