import { beforeAll, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { fingerScroll } from "./fingerScroll";

/*
 * The page's pan and zoom itself - PanZoom2D, with all its listeners, on the
 * window and on the canvas - driven by touches as a browser sends them. The
 * tests run without a browser document, so its hooks are run at once (the
 * effects as it is called, a frame when asked), and what it is given by the
 * canvas and the store is made by hand: a canvas, the box its events are
 * heard on, a camera, and a store with nothing under way.
 */

/** An element, as much of one as a touch needs. */
class Part extends EventTarget {
  readonly nodeType = 1;
  readonly style = { touchAction: "" };
  readonly captured = new Set<number>();
  readonly attrs = new Set<string>();
  constructor(readonly parentElement: Part | null = null) {
    super();
  }
  setAttribute(name: string) {
    this.attrs.add(name);
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  contains(n: unknown): boolean {
    for (let p = n as Part | null; p; p = p.parentElement) if (p === this) return true;
    return false;
  }
  closest(selector: string): Part | null {
    const name = /^\[([\w-]+)\]$/.exec(selector)?.[1];
    if (!name) return null;
    return this.attrs.has(name) ? this : (this.parentElement?.closest(selector) ?? null);
  }
  setPointerCapture(id: number) {
    this.captured.add(id);
  }
  releasePointerCapture(id: number) {
    this.captured.delete(id);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0 };
  }
}

const app = new Part();
const box = new Part(app);
const canvas = new Part(box);
const column = new Part(app);
const camera = new THREE.OrthographicCamera(-400, 400, 300, -300, 0.1, 100);
camera.position.set(0, 0, 10);
let frame: ((s: { size: { width: number; height: number } }, dt: number) => void) | null = null;
const state = {
  extend: { active: false },
  fitNonce: 0,
  moveDrag: { active: false },
  hovered: { atomId: null },
  hovered3d: null,
  panHold: { active: false },
  inkMode: false,
  shapeDraft: null,
  arrowDraft: null,
  inkDraft: null,
  pushDraw: null,
  boxSelect: { active: false },
  notePress: () => {},
  takeBackPress: () => false,
  endGestures: () => {},
};
const store = { getState: () => state, subscribe: () => () => {} };

vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  useEffect: (f: () => void) => void f(),
  useRef: <T,>(v: T) => ({ current: v }),
  useContext: () => null,
}));
vi.mock("@react-three/fiber", () => ({
  useThree: () => ({ camera, gl: { domElement: canvas }, invalidate: () => {}, events: { connected: box } }),
  useFrame: (f: typeof frame) => void (frame = f),
}));
vi.mock("../store", () => ({
  useEditor: (pick?: (s: typeof state) => unknown) => (pick ? pick(state) : state),
  useEditorStore: () => store,
}));

/** The window: heard first, in the capture phase, then the element a finger came down on, which hears all that finger's later events, unless the window's handler kept the event to itself. */
const win = Object.assign(new EventTarget(), { setTimeout, clearTimeout });
/** The document, as far as it tells whether the window is hidden. */
const shown = Object.assign(new EventTarget(), { visibilityState: "visible" });
const heldTo = new Map<number, Part>();
function send(type: string, id: number, x: number, y: number, on?: Part, primary?: boolean) {
  const target = on ?? heldTo.get(id)!;
  if (type === "pointerdown") heldTo.set(id, target);
  let kept = false;
  const fields = { pointerId: id, pointerType: "touch", isPrimary: primary ?? [...heldTo.keys()][0] === id, button: 0, buttons: 1, clientX: x, clientY: y, target, timeStamp: performance.now() };
  const make = () => {
    const e = new Event(type, { cancelable: true });
    for (const [k, v] of Object.entries(fields)) Object.defineProperty(e, k, { value: v });
    e.stopImmediatePropagation = () => {
      kept = true;
    };
    return e;
  };
  win.dispatchEvent(make());
  if (!kept) target.dispatchEvent(make());
  if (type === "pointerup" || type === "pointercancel") heldTo.delete(id);
}
/** A finger's drag from (x, y) by dy, in steps, and its lift. */
function drag(id: number, x: number, y: number, dy: number, on: Part) {
  send("pointerdown", id, x, y, on);
  for (let i = 1; i <= 5; i++) send("pointermove", id, x, y + (dy * i) / 5);
  send("pointerup", id, x, y + dy);
}
/** Where the view is, a frame on. */
function viewAt() {
  frame?.({ size: { width: 800, height: 600 } }, 1 / 60);
  return { x: camera.position.x, y: camera.position.y };
}
/** Time for any glide to go, and the view held still where it is. */
function rest() {
  for (let i = 0; i < 400; i++) viewAt();
}
let scrolled: number[] = [];
let wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  Object.assign(globalThis, { window: win, PointerEvent: Event, KeyboardEvent: Event, HTMLElement: Part });
  const { ownTouches } = await import("./pageTouches");
  ownTouches(win as never, shown as never);
  const { PanZoom2D } = await import("./PanZoom2D");
  PanZoom2D();
  fingerScroll(column as never, { scrollBy: (_dx, dy) => scrolled.push(dy), pinch: { begin: () => 0, to: () => {} } }, { ask: () => 1, cancel: () => {} });
  wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
});

/** Whether one finger on the page still moves the view: a fresh drag of 100 px on the canvas. */
async function pagePans() {
  await wait(150);
  rest();
  const before = viewAt();
  drag(20, 400, 300, 100, canvas);
  const after = viewAt();
  rest();
  return Math.abs(after.y - before.y) > 50;
}

describe("the page's pan and zoom, under fingers", () => {
  it("moves the view under one finger on the canvas", async () => {
    expect(await pagePans()).toBe(true);
  });

  it("is not moved by a second finger put down on the canvas while the first, in the column, scrolls it - and one finger still pans the page after", async () => {
    await wait(150);
    rest();
    scrolled = [];
    const before = viewAt();
    send("pointerdown", 1, 700, 300, column);
    send("pointermove", 1, 700, 280);
    send("pointerdown", 2, 300, 300, canvas);
    for (let i = 1; i <= 5; i++) {
      send("pointermove", 1, 700, 280 - 10 * i);
      send("pointermove", 2, 300, 300 + 20 * i);
    }
    expect(viewAt()).toEqual(before);
    send("pointerup", 2, 300, 400);
    send("pointerup", 1, 700, 230);
    expect(viewAt()).toEqual(before);
    expect(scrolled.reduce((s, d) => s + d, 0)).toBeGreaterThan(0);
    expect(await pagePans()).toBe(true);
  });

  it("is not moved by two fingers come down at once, the first in the column, the second on the canvas - and one finger still pans the page after", async () => {
    await wait(150);
    rest();
    const before = viewAt();
    send("pointerdown", 3, 700, 300, column);
    send("pointerdown", 4, 300, 300, canvas);
    for (let i = 1; i <= 5; i++) {
      send("pointermove", 3, 700, 300 - 20 * i);
      send("pointermove", 4, 300, 300 + 20 * i);
    }
    send("pointerup", 3, 700, 200);
    send("pointerup", 4, 300, 400);
    expect(viewAt()).toEqual(before);
    expect(await pagePans()).toBe(true);
  });

  it("is not moved by a third finger on the canvas while two pinch the column - and one finger still pans the page after", async () => {
    await wait(150);
    rest();
    const before = viewAt();
    send("pointerdown", 5, 650, 300, column);
    send("pointerdown", 6, 750, 300, column);
    send("pointermove", 6, 770, 300);
    send("pointerdown", 7, 300, 300, canvas);
    for (let i = 1; i <= 5; i++) send("pointermove", 7, 300, 300 + 20 * i);
    send("pointercancel", 7, 300, 400);
    send("pointerup", 6, 770, 300);
    send("pointerup", 5, 650, 300);
    expect(viewAt()).toEqual(before);
    expect(await pagePans()).toBe(true);
  });

  it("keeps a touch begun on the page the page's, its second finger in the column too: the column scrolls nothing - and one finger still pans the page after", async () => {
    await wait(150);
    rest();
    scrolled = [];
    send("pointerdown", 8, 300, 300, canvas);
    send("pointerdown", 9, 700, 300, column);
    for (let i = 1; i <= 5; i++) {
      send("pointermove", 8, 300 - 5 * i, 300);
      send("pointermove", 9, 700 + 5 * i, 300);
    }
    send("pointerup", 9, 725, 300);
    send("pointerup", 8, 275, 300);
    expect(scrolled).toEqual([]);
    expect(await pagePans()).toBe(true);
  });
});

describe("a finger whose lift never came", () => {
  it("off the page, holds its touch under way while the window has it - a finger said not to be first, on the canvas, is that touch's - and once the window is left, the next finger on the canvas pans, whatever it is said to be", async () => {
    await wait(150);
    rest();
    const before = viewAt();
    send("pointerdown", 30, 700, 300, column, true);
    // (its lift never heard)
    drag(31, 300, 300, 100, canvas);
    expect(viewAt()).toEqual(before);
    win.dispatchEvent(new Event("blur"));
    send("pointerdown", 32, 300, 300, canvas, false);
    for (let i = 1; i <= 5; i++) send("pointermove", 32, 300, 300 + 20 * i);
    send("pointerup", 32, 300, 400);
    expect(Math.abs(viewAt().y - before.y)).toBeGreaterThan(50);
    // (its lift come late: the column's, as its down was)
    send("pointerup", 30, 700, 300);
    expect(await pagePans()).toBe(true);
  });

  it("on the page, once the window is hidden, leaves the next touch in the column to the column - every finger of it, whatever it is said to be", async () => {
    await wait(150);
    rest();
    const heard: string[] = [];
    for (const type of ["pointerdown", "pointermove", "pointerup"]) column.addEventListener(type, (e) => heard.push(`${type.slice(7)} ${(e as PointerEvent).pointerId}`));
    send("pointerdown", 40, 300, 300, canvas, true);
    // (its lift never heard)
    shown.visibilityState = "hidden";
    shown.dispatchEvent(new Event("visibilitychange"));
    shown.visibilityState = "visible";
    const before = viewAt();
    send("pointerdown", 41, 650, 300, column, false);
    send("pointerdown", 42, 750, 300, column, false);
    send("pointermove", 41, 630, 300);
    send("pointermove", 42, 770, 300);
    send("pointerup", 42, 770, 300);
    send("pointerup", 41, 630, 300);
    expect(heard).toEqual(["down 41", "down 42", "move 41", "move 42", "up 42", "up 41"]);
    expect(viewAt()).toEqual(before);
    send("pointerup", 40, 300, 300);
    expect(await pagePans()).toBe(true);
  });
});
