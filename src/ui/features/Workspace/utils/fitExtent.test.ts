import { describe, expect, it } from "vitest";
import type { Wire } from "../store/types";
import { setGives, stepTakes } from "../workflow/look";
import { joined, notesOnPage, screenToPage, wiresExtent } from "./fitExtent";
import { PAGE_PX } from "./pageScale";

const set = { id: 1, x0: 0, x1: 2, y0: -1, y1: 1 };
const wire = (step: number, port = "in"): Wire => ({ id: 9, from: { set: 1 }, to: { step, port } });

describe("what Fit to content takes in past the frames and cards", () => {
  it("takes in a wire going back to a step on the left as far as it loops out, either side", () => {
    const left = { id: 2, x: -10, y: 3, kind: "filter" as const };
    const b = wiresExtent([set], [left], [wire(2)])!;
    const p = setGives(set);
    const q = stepTakes(left, 0);
    // (its curve leaves the set going right and comes into the step going right: past both)
    expect(b.x1).toBeGreaterThan(p.x);
    expect(b.x0).toBeLessThan(q.x);
    expect([b.y0, b.y1]).toEqual([Math.min(p.y, q.y), Math.max(p.y, q.y)]);
  });

  it("takes in a wire to a step on the right no further than its ends; and none naming what is not there", () => {
    const right = { id: 2, x: 20, y: 3, kind: "filter" as const };
    const b = wiresExtent([set], [right], [wire(2)])!;
    expect(b.x0).toBeCloseTo(setGives(set).x, 9);
    expect(b.x1).toBeCloseTo(stepTakes(right, 0).x, 9);
    expect(wiresExtent([set], [right], [wire(7)])).toBeNull();
    expect(wiresExtent([], [], [])).toBeNull();
  });

  it("puts a chip on the screen on the page as the view stands - y up - and leaves one not shown out", () => {
    const view = { x: 10, y: 5, zoom: 2 };
    const canvas = { left: 0, top: 0, width: 200, height: 100 };
    // (the canvas's middle at 100, 50: the camera's middle, 10, 5 on the page)
    expect(screenToPage([{ left: 100, right: 140, top: 50, bottom: 60 }], view, canvas)).toEqual({ x0: 10, x1: 30, y0: 0, y1: 5 });
    expect(screenToPage([{ left: 0, right: 0, top: 0, bottom: 0 }], view, canvas)).toBeNull();
    expect(joined({ x0: 0, y0: 0, x1: 1, y1: 1 }, null)).toEqual({ x0: 0, y0: 0, x1: 1, y1: 1 });
  });

  it("puts a molecule's notes over the same point at the zoom a fit comes to, as large as they are drawn there - between three quarters and half as large again", () => {
    const canvas = { left: 0, top: 0, width: 200, height: 100 };
    // (the page at its own scale: a page pixel a screen pixel; notes 40 wide, 20 high, standing 8 over the page's point 0, 0)
    const zoom = 1 / PAGE_PX;
    const view = { x: 0, y: 0, zoom };
    const notes = [{ box: { left: 80, right: 120, top: 22, bottom: 42 }, gap: 8 }];
    const at = notesOnPage(notes, view, canvas, zoom)!;
    expect([at.x0, at.x1, at.y0, at.y1].map((v) => Number((v / PAGE_PX).toFixed(6)))).toEqual([-20, 20, 8, 28]);
    // (zoomed out to a tenth: the notes drawn at three quarters - on the page, 7.5 times as large as at its own scale)
    const far = notesOnPage(notes, view, canvas, zoom / 10)!;
    expect(Number(((far.x1 - far.x0) / PAGE_PX).toFixed(6))).toBe(40 * 0.75 * 10);
    expect(Number((far.y0 / PAGE_PX).toFixed(6))).toBe(80);
  });
});

