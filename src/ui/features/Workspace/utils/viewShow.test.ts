import { describe, expect, it } from "vitest";
import { shownWith, viewToShow } from "./viewShow";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import type { Model } from "../store/types";

// (a canvas 1000 by 600 pixels at a zoom of 10: 100 by 60 of the page, its middle at the origin)
const view = { x: 0, y: 0, zoom: 10 };
const screen = { w: 1000, h: 600, cover: 0 };

describe("what was just put down, shown", () => {
  it("leaves the view as it is where it is seen whole", () => {
    expect(viewToShow(view, screen, { x0: -10, x1: 10, y0: -5, y1: 5 })).toBeNull();
  });

  it("counts what lies under the column as not seen - and moves along, as little as takes it in", () => {
    // (the column over the right 400 pixels: what can be seen is x from -50 to -10)
    const under = { x0: 0, x1: 8, y0: -2, y1: 2 };
    expect(viewToShow(view, screen, under)).toBeNull();
    const to = viewToShow(view, { ...screen, cover: 400 }, under)!;
    expect(to.zoom).toBe(10);
    // (its right edge, 48 pixels in, at what the column leaves)
    expect(to.x + 50 - 40).toBeCloseTo(8 + 4.8, 9);
    expect(to.y).toBe(0);
  });

  it("zooms out as little as needed, never in, for what is too big - in the middle of what can be seen", () => {
    const big = { x0: -100, x1: 100, y0: -10, y1: 10 };
    const to = viewToShow(view, { ...screen, cover: 400 }, big)!;
    expect(to.zoom).toBeCloseTo((600 - 96) / 200, 9);
    // (its middle half the column to the left of the canvas's)
    expect(to.x).toBeCloseTo(200 / to.zoom, 9);
    const small = viewToShow({ ...view, zoom: 0.5 }, screen, { x0: -1, x1: 1, y0: -1, y1: 1 });
    expect(small).toBeNull();
  });
});

describe("a put-down asks to be shown", () => {
  it("a structure read, and one opened onto a page with something on it - one opened onto an empty page is fitted", () => {
    const doc = createWorkspaceDocument();
    const store = createEditorStore(doc);
    connectStoreToDocument(store, doc);
    const st = () => store.getState();
    const one = { atoms: [{ id: 1, x: 40, y: 0, el: "C" }, { id: 2, x: 41.5, y: 0, el: "O" }], bonds: [{ id: 3, a: 1, b: 2, order: 1 }] } as Model;
    const fit0 = st().fitNonce;
    st().appendModel(one);
    expect(st().fitNonce).toBe(fit0 + 1);
    expect(st().showRequest).toBeNull();
    st().appendModel({ ...one, atoms: one.atoms.map((a) => ({ ...a, x: a.x + 100 })) });
    expect(st().fitNonce).toBe(fit0 + 1);
    expect(st().showRequest?.box.x0).toBeLessThan(140);
    expect(st().showRequest?.box.x1).toBeGreaterThan(141.5);
    const n = st().showRequest!.n;
    st().putRead({ ...one, atoms: one.atoms.map((a) => ({ ...a, y: a.y + 50 })) });
    expect(st().showRequest?.n).toBe(n + 1);
    expect(st().showRequest?.box.y1).toBeGreaterThan(50);
  });
});

describe("molecules made in 3D from a drawing, shown", () => {
  const seen = (v: { x: number; y: number; zoom: number }, b: { x0: number; x1: number; y0: number; y1: number }) =>
    b.x0 >= v.x - 50 / (v.zoom / 10) - 1e-9 && b.x1 <= v.x + 50 / (v.zoom / 10) + 1e-9 && b.y0 >= v.y - 30 / (v.zoom / 10) - 1e-9 && b.y1 <= v.y + 30 / (v.zoom / 10) + 1e-9;
  it("are shown with the drawing they were made from: the view takes both in, never the one by leaving the other", () => {
    // (the drawing at the view's left edge; what was made beyond its right edge)
    const drawing = { x0: -48, x1: -38, y0: -5, y1: 5 };
    const made = { x0: 45, x1: 70, y0: -5, y1: 5 };
    const to = viewToShow(view, screen, shownWith([drawing], made))!;
    expect(seen(to, drawing) && seen(to, made)).toBe(true);
    // (the made one alone, as before: the view goes to it and the drawing leaves)
    const alone = viewToShow(view, screen, made)!;
    expect(seen(alone, drawing)).toBe(false);
  });
  it("leave the view as it is where both are seen whole; and with nothing placed, the drawing alone is what is shown", () => {
    const drawing = { x0: -10, x1: 0, y0: -5, y1: 5 };
    expect(viewToShow(view, screen, shownWith([drawing], { x0: 5, x1: 15, y0: -5, y1: 5 }))).toBeNull();
    expect(shownWith([drawing, { x0: 20, x1: 30, y0: 0, y1: 8 }], null)).toEqual({ x0: -10, x1: 30, y0: -5, y1: 8 });
  });
});
