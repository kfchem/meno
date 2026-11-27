import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { shownWith, viewToShow } from "./viewShow";
import { letViewGoalGo, setViewGoal, viewGoalOf } from "../components/viewGoal";
import { connectStoreToDocument, createEditorStore } from "../store";
import { createWorkspaceDocument } from "../document";
import type { Model } from "../store/types";
import { placeRow, type Box, type Turned } from "../chem/make3d";
import { madeRoom } from "./fitExtent";

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

  it("counts a column opening as it is asked as open: the view, followed by it the rest of the way, comes to rest showing it whole", () => {
    // (the column to cover the right 400 pixels, not open yet; the view will follow it by half of that, 20 of the page)
    const opening = { ...screen, cover: 400, coverNow: 0 };
    const followed = (to: { x: number; y: number; zoom: number }) => ({ ...to, x: to.x + 200 / to.zoom });
    // (seen whole on the canvas now, but under the column once it is open: moved along, as little as takes it in beside it)
    const right = { x0: 20, x1: 30, y0: -2, y1: 2 };
    expect(viewToShow(view, { ...screen, cover: 0 }, right)).toBeNull();
    const to = viewToShow(view, opening, right)!;
    expect(to.zoom).toBe(10);
    const rest = followed(to);
    expect(rest.x + 50 - 40).toBeCloseTo(30 + 4.8, 9);
    // (too wide for what the column leaves: out as little as needed, never in, in the middle of what is seen once it is open)
    const wide = { x0: -40, x1: 40, y0: -5, y1: 5 };
    const out = viewToShow(view, opening, wide)!;
    expect(out.zoom).toBeCloseTo((600 - 96) / 80, 9);
    const at = followed(out);
    expect(at.x - 500 / out.zoom).toBeCloseTo(-40 - 48 / out.zoom, 9);
    expect(at.x + 500 / out.zoom - 400 / out.zoom).toBeCloseTo(40 + 48 / out.zoom, 9);
    // (seen whole where the following brings the view: left as it is - the following alone takes it there)
    expect(viewToShow(view, opening, { x0: 0, x1: 4, y0: -2, y1: 2 })).toBeNull();
    // (and one shutting: the view, followed back, shows what it would not have before)
    expect(viewToShow(view, { ...screen, cover: 0, coverNow: 400 }, { x0: -65, x1: -60, y0: -2, y1: 2 })).toBeNull();
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
  // (the canvas above: x from -50 to 50, y from -30 to 30 can be seen; the margin, 48 pixels, is 4.8 of the page)
  it("leave the view as it is where the drawing and what was made are both seen whole", () => {
    expect(viewToShow(view, screen, shownWith([{ x0: -10, x1: 0, y0: -5, y1: 5 }], { x0: 5, x1: 15, y0: -5, y1: 5 }))).toBeNull();
  });

  it("move it along as little as takes both in with the margin, where both fit at this zoom", () => {
    // (made out to the right, past x = 50; the drawing near the left edge: the view goes 4.8 to the right, no further, and keeps the drawing)
    const drawing = { x0: -40, x1: -30, y0: -5, y1: 5 };
    const made = { x0: 35, x1: 50, y0: -5, y1: 5 };
    const to = viewToShow(view, screen, shownWith([drawing], made))!;
    expect(to.zoom).toBe(10);
    expect(to.x).toBeCloseTo(4.8, 9);
    expect(to.y).toBe(0);
    expect(drawing.x0 - 4.8).toBeGreaterThanOrEqual(to.x - 50);
  });

  it("zoom out as little as needed where both do not fit at this zoom: never the one taken in by leaving the other", () => {
    // (together 100 wide: 100 + 2 x 4.8 is more than the 100 seen, so out to (1000 - 96) / 100 = 9.04, their middle x = 20 in the middle)
    const drawing = { x0: -30, x1: -20, y0: -5, y1: 5 };
    const made = { x0: 45, x1: 70, y0: -5, y1: 5 };
    const to = viewToShow(view, screen, shownWith([drawing], made))!;
    expect(to.zoom).toBeCloseTo(9.04, 9);
    expect(to.x).toBeCloseTo(20, 9);
    expect(to.y).toBeCloseTo(0, 9);
    // (what was made alone, as the view went before: along by 70 + 4.8 - 50 = 24.8, its left edge at -25.2 - the drawing, from
    //  -30, no longer seen whole)
    const alone = viewToShow(view, screen, made)!;
    expect(alone.x).toBeCloseTo(24.8, 9);
    expect(drawing.x0).toBeLessThan(alone.x - 50);
  });

  describe("with what stands on the page with what was made: its chip under it, 10 + 28 = 38 page px = 38 x 1.8 / 48 = 1.425 of the page", () => {
    // (the canvas above, its middle at y = 25: x from -50 to 50, y from -5 to 55 seen; a drawing 80 wide in the middle, what is
    //  above it taken; one molecule 20 wide, 2 tall - to its right from 42.7, to its left to -42.7, out of view; above, past
    //  what is taken, out of view; below, its body from y = -2.7 down to -4.7, in view, and its chip from -4.7 down to -6.125, not)
    const seen = { x: 0, y: 25, zoom: 10 };
    const seenBox = { x0: -50, x1: 50, y0: -5, y1: 55 };
    const drawing: Box = { x0: -40, x1: 40, y0: 0, y1: 10 };
    const taken: Box[] = [{ x0: -45, x1: 45, y0: 11, y1: 58 }];
    const made: Turned = { turn: [0, 0, 0, 1], start: { x: 0, y: 0 }, reach: { x0: -10, x1: 10, y0: -1, y1: 1 }, flat: [], height: 1 };

    it("a molecule seen whole with its chip cut off by the window's edge is not in view: the view takes in it, its chip and the drawing", () => {
      const row = placeRow([made], drawing, seenBox, undefined, taken, { below: 1.425, right: 0 });
      expect(row.inView).toBe(false);
      // (none in view: to the right, as ever - its body from y = 5 - 1 = 4 to 6, its chip down to 4 - 1.425 = 2.575)
      expect(row.box.x0).toBeCloseTo(42.7, 9);
      expect(row.box.x1).toBeCloseTo(62.7, 9);
      expect(row.box.y0).toBeCloseTo(2.575, 9);
      expect(row.box.y1).toBeCloseTo(6, 9);
      // (with the drawing: 102.7 wide, out to (1000 - 96) / 102.7, its middle x = (-40 + 62.7) / 2 = 11.35, y = (0 + 10) / 2 = 5)
      const to = viewToShow(seen, screen, shownWith([drawing], row.box))!;
      expect(to.zoom).toBeCloseTo(904 / 102.7, 9);
      expect(to.zoom).toBeLessThan(10);
      expect(to.x).toBeCloseTo(11.35, 9);
      expect(to.y).toBeCloseTo(5, 9);
    });

    it("the view moves by what brings the chip in: body from y = -25 to -20 seen with its margin, its chip to -26.425; up by 26.425 + 4.8 - 30 = 1.225", () => {
      const body = { x0: -10, x1: 10, y0: -25, y1: -20 };
      expect(viewToShow(view, screen, body)).toBeNull();
      expect(viewToShow(view, screen, { ...body, y0: body.y0 - madeRoom(0).below })).toEqual({ x: 0, y: expect.closeTo(-1.225, 9), zoom: 10 });
    });

    it("no move where it is seen whole with its chip: below, the view's foot at -7, its chip at -6.125", () => {
      const lower = { x0: -50, x1: 50, y0: -7, y1: 53 };
      const row = placeRow([made], drawing, lower, undefined, taken, madeRoom(0));
      expect(row.inView).toBe(true);
      expect(row.box.y0).toBeCloseTo(-6.125, 9);
      expect(row.box.y1).toBeCloseTo(-2.7, 9);
      expect(viewToShow({ x: 0, y: 23, zoom: 10 }, { ...screen }, shownWith([drawing], row.box), 0)).toBeNull();
    });

    it("the mark of its notes beside its top right corner: 6 page px out and 10 wide, 16 x 1.8 / 48 = 0.6 of the page, at any zoom; none where it says nothing", () => {
      expect(madeRoom(2).right).toBeCloseTo(0.6, 9);
      expect(madeRoom(1).right).toBeCloseTo(0.6, 9);
      expect(madeRoom(0).right).toBe(0);
      expect(madeRoom(0).below).toBeCloseTo(1.425, 9);
    });

    it("a molecule with notes is placed and seen with its mark: to the right, its body from 42.7 to 62.7, its mark out to 63.3", () => {
      const row = placeRow([made], drawing, seenBox, undefined, taken, madeRoom(1));
      expect(row.inView).toBe(false);
      // (the row's box from the drawing's edge 40 and the gap 2.7 to the body's right 62.7 and the mark's 0.6: 63.3; the body's middle at 42.7 + 10 = 52.7)
      expect(row.box.x0).toBeCloseTo(42.7, 9);
      expect(row.box.x1).toBeCloseTo(63.3, 9);
      expect(row.at[0].x).toBeCloseTo(52.7, 9);
    });
  });

  it("take in every part of the drawing, and the drawing alone where nothing was placed", () => {
    expect(shownWith([{ x0: -10, x1: 0, y0: -5, y1: 5 }, { x0: 20, x1: 30, y0: 0, y1: 8 }], null)).toEqual({ x0: -10, x1: 30, y0: -5, y1: 8 });
  });

  it("end, at once, as the chemist takes the view: the eased move is the page's own view goal, which a press, a wheel or a pinch lets go", () => {
    const cam = new THREE.OrthographicCamera();
    const to = viewToShow(view, screen, shownWith([{ x0: -40, x1: -30, y0: -5, y1: 5 }], { x0: 35, x1: 50, y0: -5, y1: 5 }))!;
    setViewGoal(cam, to);
    expect(viewGoalOf(cam)).toEqual(to);
    // (what PanZoom2D does on a press, a wheel turn or a pinch's start before anything else)
    letViewGoalGo(cam);
    expect(viewGoalOf(cam)).toBeUndefined();
  });
});
