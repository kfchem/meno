import { describe, expect, it } from "vitest";
import { beganOnPage, pageTouches } from "./pageTouches";
import { fingerScroll } from "./fingerScroll";

/** An element, as much of one as a touch needs: what it is within, and whether it is typed into. */
class Part extends EventTarget {
  readonly nodeType = 1;
  readonly style = { touchAction: "" };
  readonly captured: number[] = [];
  constructor(
    readonly parentElement: Part | null = null,
    readonly typed = false,
  ) {
    super();
  }
  contains(n: unknown): boolean {
    for (let p = n as Part | null; p; p = p.parentElement) if (p === this) return true;
    return false;
  }
  closest(): Part | null {
    return this.typed ? this : (this.parentElement?.closest() ?? null);
  }
  setPointerCapture(id: number) {
    this.captured.push(id);
  }
}

/**
 * A window as a browser has it: the page's touch handlers heard on it
 * first, in the capture phase, then the element a finger came down on -
 * which hears all that finger's moves and its lift, as a touch is held to
 * where it began - unless the window's handler kept the event to itself.
 */
function screen() {
  const win = new EventTarget();
  const app = new Part();
  const box = new Part(app); // the canvas's box
  const canvas = new Part(box);
  const layer = new Part(app); // the page's HTML, laid over the canvas
  const chip = new Part(layer);
  const field = new Part(layer, true);
  const column = new Part(app);
  const dialog = new Part(app);
  const heldTo = new Map<number, Part>();
  const send = (type: string, id: number, x: number, y: number, on?: Part, more: Record<string, unknown> = {}) => {
    const target = on ?? heldTo.get(id)!;
    if (type === "pointerdown") heldTo.set(id, target);
    let kept = false;
    const fields = { pointerId: id, pointerType: "touch", isPrimary: [...heldTo.keys()][0] === id, clientX: x, clientY: y, target, ...more };
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
  };
  return { win, box, canvas, layer, chip, field, column, dialog, send };
}

/**
 * The page's own touch handlers, as PanZoom2D's are: the first finger let
 * through, and any later one - wherever the first came down - kept to
 * itself, with both fingers' moves then the page's pinch.
 */
function pageHandlers() {
  const touches = new Set<number>();
  let pinch = false;
  const heard: string[] = [];
  const s = { zooms: 0, heard };
  const keep = (e: Event) => e.stopImmediatePropagation();
  const handlers = {
    down: (e: PointerEvent) => {
      heard.push(`down ${e.pointerId}`);
      if (touches.size === 0) {
        touches.add(e.pointerId);
        return;
      }
      keep(e);
      touches.add(e.pointerId);
      pinch = true;
    },
    move: (e: PointerEvent) => {
      if (!touches.has(e.pointerId)) return;
      heard.push(`move ${e.pointerId}`);
      if (!pinch) return;
      keep(e);
      s.zooms++;
    },
    up: (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      heard.push(`up ${e.pointerId}`);
      if (pinch) keep(e);
      if (touches.size === 0) pinch = false;
    },
  };
  return { s, handlers };
}

/** The page, the column (a PDF's, pinched; or a text's, not), and what each did. */
function set(read: "pdf" | "text" = "pdf") {
  const sc = screen();
  const { s: page, handlers } = pageHandlers();
  pageTouches(sc.win as never, (t) => beganOnPage(t, [sc.box, sc.layer as never]), handlers);
  const canvasHeard: string[] = [];
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) sc.canvas.addEventListener(type, (e) => canvasHeard.push(`${type.slice(7)} ${(e as PointerEvent).pointerId}`));
  const scrolled: [number, number][] = [];
  const pinches: number[] = [];
  const frames = { ask: () => 1, cancel: () => {} };
  fingerScroll(
    sc.column as never,
    {
      scrollBy: (dx, dy) => scrolled.push([dx, dy]),
      ...(read === "pdf" ? { pinch: { begin: () => 0, to: (_: number, f: { a0: { x: number }; b0: { x: number }; a1: { x: number }; b1: { x: number } }) => pinches.push(Math.abs(f.b1.x - f.a1.x) / Math.abs(f.b0.x - f.a0.x)) } } : {}),
    },
    frames,
  );
  return { ...sc, page, canvasHeard, scrolled, pinches };
}

describe("whose a touch is", () => {
  it("is the page's begun on the canvas or on what is laid on the page, not begun in a field typed into or off the page", () => {
    const sc = screen();
    const parts = [sc.box, sc.layer as never];
    expect(beganOnPage(sc.canvas, parts)).toBe(true);
    expect(beganOnPage(sc.chip, parts)).toBe(true);
    // (a text's node within the canvas's box: by its element)
    expect(beganOnPage({ nodeType: 3, parentElement: sc.canvas } as never, parts)).toBe(true);
    expect(beganOnPage(sc.field, parts)).toBe(false);
    expect(beganOnPage(sc.column, parts)).toBe(false);
    expect(beganOnPage(sc.dialog, parts)).toBe(false);
    expect(beganOnPage(null, parts)).toBe(false);
    expect(beganOnPage(sc.canvas, [null])).toBe(false);
  });
});

describe("two fingers begun in the column", () => {
  it("reach the column, every move of both, and pinch it about them - the page not zoomed", () => {
    const t = set();
    t.send("pointerdown", 1, 100, 300, t.column);
    t.send("pointerdown", 2, 140, 300, t.column);
    for (let i = 1; i <= 3; i++) {
      t.send("pointermove", 1, 100 - 10 * i, 300);
      t.send("pointermove", 2, 140 + 10 * i, 300);
    }
    t.send("pointerup", 1, 70, 300);
    t.send("pointerup", 2, 170, 300);
    expect(t.pinches.length).toBe(6);
    expect(t.pinches[t.pinches.length - 1]).toBeCloseTo(100 / 40);
    expect(t.page.zooms).toBe(0);
    expect(t.page.heard).toEqual([]);
    expect(t.column.captured).toEqual([1, 2]);
  });

  it("leave the other finger scrolling the column once one is lifted, and a cancel leaves nothing held: the next finger starts afresh", () => {
    const t = set();
    t.send("pointerdown", 1, 100, 300, t.column);
    t.send("pointerdown", 2, 140, 300, t.column);
    t.send("pointermove", 2, 160, 300);
    t.send("pointerup", 2, 160, 300);
    t.send("pointermove", 1, 100, 280);
    expect(t.scrolled).toEqual([[0, 20]]);
    t.send("pointercancel", 1, 100, 280);
    t.send("pointerdown", 3, 100, 300, t.column);
    t.send("pointermove", 3, 100, 290);
    t.send("pointermove", 3, 100, 270);
    t.send("pointerup", 3, 100, 270);
    expect(t.scrolled.slice(1).reduce((s, [, dy]) => s + dy, 0)).toBe(30);
    expect(t.page.zooms).toBe(0);
    expect(t.page.heard).toEqual([]);
  });

  it("on a text, zoom nothing, and the first finger goes on scrolling its lines as the second comes down", () => {
    const t = set("text");
    t.send("pointerdown", 1, 100, 300, t.column);
    t.send("pointermove", 1, 100, 280);
    t.send("pointerdown", 2, 140, 300, t.column);
    t.send("pointermove", 2, 140, 250);
    t.send("pointermove", 1, 100, 260);
    t.send("pointerup", 2, 140, 250);
    t.send("pointerup", 1, 100, 260);
    expect(t.scrolled.reduce((s, [, dy]) => s + dy, 0)).toBe(40);
    expect(t.page.zooms).toBe(0);
  });
});

describe("two fingers begun on the page", () => {
  it("are the page's pinch, wherever the second comes down - the column hears none of it", () => {
    const t = set();
    t.send("pointerdown", 1, 100, 300, t.canvas);
    t.send("pointerdown", 2, 900, 300, t.column);
    t.send("pointermove", 1, 90, 300);
    t.send("pointermove", 2, 910, 300);
    t.send("pointerup", 1, 90, 300);
    t.send("pointerup", 2, 910, 300);
    expect(t.page.zooms).toBe(2);
    expect(t.pinches).toEqual([]);
    expect(t.scrolled).toEqual([]);
    expect(t.column.captured).toEqual([]);
  });

  it("begun on what is laid on the page - a chip - are the page's too", () => {
    const t = set();
    t.send("pointerdown", 1, 100, 300, t.chip);
    t.send("pointerdown", 2, 140, 300, t.canvas);
    t.send("pointermove", 2, 150, 300);
    expect(t.page.zooms).toBe(1);
  });
});

describe("one finger in the column and one on the page", () => {
  it("each go to their own part: the column scrolls with its finger, the canvas hears its own as one finger, and nothing is pinched", () => {
    const t = set();
    t.send("pointerdown", 1, 900, 300, t.column);
    t.send("pointerdown", 2, 100, 300, t.canvas);
    t.send("pointermove", 1, 900, 280);
    t.send("pointermove", 2, 100, 320);
    t.send("pointerup", 1, 900, 280);
    t.send("pointerup", 2, 100, 320);
    expect(t.scrolled).toEqual([[0, 20]]);
    expect(t.pinches).toEqual([]);
    expect(t.page.zooms).toBe(0);
    expect(t.canvasHeard).toEqual(["down 2", "move 2", "up 2"]);
  });
});

describe("a touch begun in a field typed into on the page, or in a dialog", () => {
  it("is left alone by the page, every finger of it", () => {
    for (const where of ["field", "dialog"] as const) {
      const t = set();
      const on = t[where];
      const heard: string[] = [];
      for (const type of ["pointerdown", "pointermove", "pointerup"]) on.addEventListener(type, (e) => heard.push(`${type.slice(7)} ${(e as PointerEvent).pointerId}`));
      t.send("pointerdown", 1, 10, 10, on);
      t.send("pointerdown", 2, 30, 10, on);
      t.send("pointermove", 2, 40, 10);
      t.send("pointerup", 2, 40, 10);
      t.send("pointerup", 1, 10, 10);
      expect(heard).toEqual(["down 1", "down 2", "move 2", "up 2", "up 1"]);
      expect(t.page.heard).toEqual([]);
    }
  });
});

describe("a first finger whose lift never came", () => {
  it("is let go as a new first finger comes down: whose the new touch is, is where it begins", () => {
    const t = set();
    t.send("pointerdown", 1, 100, 300, t.column, { isPrimary: true });
    // (its lift never heard)
    t.send("pointerdown", 2, 100, 300, t.canvas, { isPrimary: true });
    t.send("pointerdown", 3, 140, 300, t.canvas, { isPrimary: false });
    t.send("pointermove", 3, 150, 300);
    expect(t.page.zooms).toBe(1);
  });

  it("leaves the page's touches alone too as a new one begins in the column", () => {
    const sc = screen();
    const { s: page, handlers } = pageHandlers();
    pageTouches(sc.win as never, (t) => beganOnPage(t, [sc.box]), handlers);
    sc.send("pointerdown", 1, 100, 300, sc.canvas, { isPrimary: true });
    sc.send("pointerdown", 2, 900, 300, sc.column, { isPrimary: true });
    sc.send("pointerdown", 3, 940, 300, sc.column, { isPrimary: false });
    sc.send("pointermove", 3, 950, 300);
    expect(page.heard).toEqual(["down 1"]);
  });
});

describe("a mouse or a pen", () => {
  it("goes to the page's handlers as ever, wherever it is", () => {
    const t = set();
    t.send("pointerdown", 7, 900, 300, t.column, { pointerType: "mouse" });
    expect(t.page.heard).toEqual(["down 7"]);
  });
});
