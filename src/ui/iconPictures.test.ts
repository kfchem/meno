// @vitest-environment node
/**
 * Icons shown through pictures of themselves (./iconPictures), in a small stand-in for a document (the tests run with no DOM): an
 * icon that may be shown so gets its three styles once its picture is made; a change inside it takes them off at once; an icon seen
 * before is shown at once; an icon of two inks is never touched; where the test at start reads the window as drawing finely, nothing
 * is installed.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { drawsPathsCoarsely, startIconPictures } from "./iconPictures";

const INK = "rgb(36, 41, 47)";

type Opts = { attributes?: boolean; childList?: boolean; subtree?: boolean; characterData?: boolean };
type Rec = { type: string; target: FakeEl; attributeName?: string; addedNodes: FakeEl[]; removedNodes: FakeEl[] };

let observers: FakeObserver[] = [];

class FakeObserver {
  watching: { target: FakeEl; opts: Opts }[] = [];
  pending: Rec[] = [];
  queued = false;
  constructor(private cb: (r: Rec[]) => void) {
    observers.push(this);
  }
  observe(target: FakeEl, opts: Opts) {
    this.watching.push({ target, opts });
  }
  disconnect() {
    this.watching = [];
    this.pending = [];
  }
  takeRecords() {
    const r = this.pending;
    this.pending = [];
    return r;
  }
  offer(rec: Rec) {
    const hit = this.watching.some(({ target, opts }) => (rec.target === target || (opts.subtree && target.holds(rec.target))) && (rec.type === "attributes" ? opts.attributes : opts.childList));
    if (!hit) return;
    this.pending.push(rec);
    if (this.queued) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      const r = this.takeRecords();
      if (r.length) this.cb(r);
    });
  }
}

const notify = (rec: Rec) => observers.forEach((o) => o.offer(rec));

class FakeStyle {
  props = new Map<string, string>();
  constructor(private el: FakeEl) {}
  setProperty(k: string, v: string) {
    this.props.set(k, v);
    notify({ type: "attributes", target: this.el, attributeName: "style", addedNodes: [], removedNodes: [] });
  }
  removeProperty(k: string) {
    if (!this.props.delete(k)) return;
    notify({ type: "attributes", target: this.el, attributeName: "style", addedNodes: [], removedNodes: [] });
  }
  getPropertyValue(k: string) {
    return this.props.get(k) ?? "";
  }
}

class FakeEl {
  nodeType = 1;
  attrs = new Map<string, string>();
  children: FakeEl[] = [];
  parent: FakeEl | null = null;
  style = new FakeStyle(this);
  constructor(
    public localName: string,
    attrs: Record<string, string> = {},
  ) {
    for (const [k, v] of Object.entries(attrs)) this.attrs.set(k, v);
  }
  getAttribute(k: string) {
    return this.attrs.get(k) ?? null;
  }
  hasAttribute(k: string) {
    return this.attrs.has(k);
  }
  setAttribute(k: string, v: string) {
    this.attrs.set(k, v);
    notify({ type: "attributes", target: this, attributeName: k, addedNodes: [], removedNodes: [] });
  }
  appendChild(c: FakeEl) {
    c.parent = this;
    this.children.push(c);
    notify({ type: "childList", target: this, addedNodes: [c], removedNodes: [] });
    return c;
  }
  removeChild(c: FakeEl) {
    this.children = this.children.filter((x) => x !== c);
    c.parent = null;
    notify({ type: "childList", target: this, addedNodes: [], removedNodes: [c] });
  }
  holds(other: FakeEl): boolean {
    for (let p = other.parent; p; p = p.parent) if (p === this) return true;
    return false;
  }
  get isConnected(): boolean {
    return this === doc.body || doc.body.holds(this);
  }
  get ownerSVGElement(): FakeEl | null {
    for (let p = this.parent; p; p = p.parent) if (p.localName === "svg") return p;
    return null;
  }
  querySelectorAll(sel: string): FakeEl[] {
    const out: FakeEl[] = [];
    const walk = (e: FakeEl) => e.children.forEach((c) => (c.localName === sel && out.push(c), walk(c)));
    walk(this);
    return out;
  }
  querySelector(sel: string) {
    return this.querySelectorAll(sel)[0] ?? null;
  }
  getAnimations() {
    return [];
  }
}

/** Computed style, as far as an icon needs it: paint inherited down from the svg, `currentColor` as the ink. */
function computed(el: FakeEl) {
  const inherited = (k: string, fallback: string): string => {
    for (let p: FakeEl | null = el; p; p = p.parent) {
      const v = p.attrs.get(k);
      if (v !== undefined) return v === "currentColor" ? INK : v;
    }
    return fallback;
  };
  const values: Record<string, string> = {
    color: INK,
    fill: inherited("fill", "rgb(0, 0, 0)"),
    stroke: inherited("stroke", "none"),
    strokeWidth: `${inherited("stroke-width", "1")}px`,
    strokeLinecap: inherited("stroke-linecap", "butt"),
    strokeLinejoin: inherited("stroke-linejoin", "miter"),
    strokeMiterlimit: "4",
    strokeDasharray: "none",
    strokeDashoffset: "0px",
    opacity: "1",
    fillOpacity: "1",
    strokeOpacity: "1",
    fillRule: "nonzero",
    visibility: "visible",
    display: "inline",
    clipPath: "none",
    maskImage: el.style.getPropertyValue("mask-image") || "none",
    filter: "none",
    animationName: "none",
    transform: "none",
    width: el.localName === "svg" ? `${el.attrs.get("width")}px` : "auto",
    height: el.localName === "svg" ? `${el.attrs.get("height")}px` : "auto",
    paddingTop: "0px",
    paddingRight: "0px",
    paddingBottom: "0px",
    paddingLeft: "0px",
    borderTopWidth: "0px",
    borderRightWidth: "0px",
    borderBottomWidth: "0px",
    borderLeftWidth: "0px",
    overflow: el.localName === "svg" ? "hidden" : "visible",
    backgroundColor: el.style.getPropertyValue("background-color") || "rgba(0, 0, 0, 0)",
    backgroundImage: "none",
  };
  return { ...values, getPropertyValue: () => "" };
}

/** The canvases' answers: in-between steps on a plain one and on one kept for reading back. */
let steps = { plain: 3, kept: 26 };
/** A canvas that gives no 2d context, or one that throws. */
let broken: "none" | "throws" | null = null;
let pictureCount = 0;

function fakeCanvas() {
  return {
    width: 0,
    height: 0,
    getContext: (_: string, opts?: { willReadFrequently?: boolean }) => {
      if (broken === "none") return null;
      if (broken === "throws") throw new Error("no canvas here");
      return {
        scale() {},
        stroke() {},
        drawImage() {},
        getImageData() {
          const n = opts?.willReadFrequently ? steps.kept : steps.plain;
          const data = new Uint8ClampedArray(1600 * 4);
          for (let i = 0; i < n; i++) data[i * 4 + 3] = i + 1;
          return { data };
        },
      };
    },
    toDataURL: () => `data:image/png;base64,PICTURE${++pictureCount}`,
  };
}

const doc = { body: new FakeEl("body"), createElement: () => fakeCanvas(), querySelectorAll: (s: string) => doc.body.querySelectorAll(s) };

const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
const NAMES = ["document", "window", "getComputedStyle", "MutationObserver", "Image", "Path2D", "requestIdleCallback"];

/** Lets every picture's making and every idle moment pass. */
const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 20));
};

const quickAddIcon = (d = "M2 13.5 L6 7.5 L10 13.5 L14 7.5 L18 13.5", fill?: string) => {
  const svg = new FakeEl("svg", { viewBox: "0 0 20 20", width: "20", height: "20", fill: "none", stroke: "currentColor", "stroke-width": "1.8", "stroke-linecap": "round", "stroke-linejoin": "round" });
  const path = new FakeEl("path", fill ? { d, fill } : { d });
  svg.children.push(path);
  path.parent = svg;
  return { svg, path };
};

let stop: () => void = () => {};

beforeEach(() => {
  for (const n of NAMES) saved[n] = g[n];
  observers = [];
  steps = { plain: 3, kept: 26 };
  broken = null;
  doc.body = new FakeEl("body");
  g.document = doc;
  g.window = { devicePixelRatio: 2, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
  g.getComputedStyle = computed;
  g.MutationObserver = FakeObserver;
  g.Image = class {
    src = "";
    decode() {
      return new Promise<void>((r) => setTimeout(r, 0));
    }
  };
  g.Path2D = class {};
  g.requestIdleCallback = undefined;
});

afterEach(() => {
  stop();
  for (const n of NAMES) g[n] = saved[n];
});

describe("icons shown through their pictures", () => {
  it("shows an icon added to the page through its picture, once it is made", async () => {
    stop = startIconPictures();
    const { svg } = quickAddIcon();
    doc.body.appendChild(svg);
    await settle();
    expect(svg.style.getPropertyValue("background-color")).toBe("currentColor");
    expect(svg.style.getPropertyValue("mask-image")).toMatch(/^url\("data:image\/png;base64,PICTURE\d+"\)$/);
    expect(svg.style.getPropertyValue("mask-size")).toBe("100% 100%");
    expect(svg.style.getPropertyValue("mask-repeat")).toBe("no-repeat");
  });

  it("takes the picture off at once when something inside changes, and puts the new one on when made", async () => {
    stop = startIconPictures();
    const { svg, path } = quickAddIcon();
    doc.body.appendChild(svg);
    await settle();
    const first = svg.style.getPropertyValue("mask-image");
    path.setAttribute("d", "M2 13.5 L18 13.5");
    await Promise.resolve();
    expect(svg.style.getPropertyValue("mask-image")).toBe("");
    expect(svg.style.getPropertyValue("background-color")).toBe("");
    await settle();
    expect(svg.style.getPropertyValue("mask-image")).not.toBe("");
    expect(svg.style.getPropertyValue("mask-image")).not.toBe(first);
    // (and back: the first picture again, at once)
    path.setAttribute("d", "M2 13.5 L6 7.5 L10 13.5 L14 7.5 L18 13.5");
    await Promise.resolve();
    expect(svg.style.getPropertyValue("mask-image")).toBe(first);
  });

  it("shows an icon seen before at once, as it comes into the page", async () => {
    stop = startIconPictures();
    const one = quickAddIcon();
    doc.body.appendChild(one.svg);
    await settle();
    doc.body.removeChild(one.svg);
    const two = quickAddIcon();
    doc.body.appendChild(two.svg);
    await Promise.resolve();
    expect(two.svg.style.getPropertyValue("mask-image")).toBe(one.svg.style.getPropertyValue("mask-image"));
  });

  it("never touches an icon of two inks", async () => {
    stop = startIconPictures();
    const { svg } = quickAddIcon("M0 0 H6 L3 4 Z", "rgb(255, 0, 0)");
    doc.body.appendChild(svg);
    await settle();
    expect(svg.style.props.size).toBe(0);
    expect(observers.length).toBe(1);
  });

  it("installs nothing where the window draws paths finely", async () => {
    steps = { plain: 17, kept: 17 };
    stop = startIconPictures();
    const { svg } = quickAddIcon();
    doc.body.appendChild(svg);
    await settle();
    expect(observers.length).toBe(0);
    expect(svg.style.props.size).toBe(0);
  });

  it("reads not coarse where a canvas gives no context or throws", () => {
    expect(drawsPathsCoarsely()).toBe(true);
    broken = "none";
    expect(drawsPathsCoarsely()).toBe(false);
    broken = "throws";
    expect(drawsPathsCoarsely()).toBe(false);
  });

  it("gives every icon back as it was when stopped", async () => {
    stop = startIconPictures({ force: true });
    const { svg } = quickAddIcon();
    doc.body.appendChild(svg);
    await settle();
    expect(svg.style.props.size).toBeGreaterThan(0);
    stop();
    expect(svg.style.props.size).toBe(0);
  });
});
