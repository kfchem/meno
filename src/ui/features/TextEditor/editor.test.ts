import { describe, expect, it, vi } from "vitest";

// (the type measured by a letter's width of 8, tabs and all: the editor needs no canvas to be tried)
vi.mock("./linePictures", () => ({
  LINE_PX: 20,
  lineWidth: (line: string) => line.length * 8,
  xAt: (line: string, col: number) => Math.min(col, line.length) * 8,
  colAt: (line: string, x: number) => Math.max(0, Math.min(line.length, Math.round(x / 8))),
}));

import { BAR_EDGE, BAR_PX, Editor, GUTTER_PX, NUMBER_GAP, NUMBER_PAD, PAD_PX } from "./editor";

const lines = (n: number, wide = 10) => Array.from({ length: n }, (_, i) => `${i}`.padEnd(wide, "x")).join("\n");
const viewed = (text: string, w = 400, h = 300) => {
  const ed = new Editor(text);
  ed.viewW = w;
  ed.viewH = h;
  return ed;
};

describe("a text's editor and the column of line numbers", () => {
  it("has a column as wide as its last number needs, with room either side", () => {
    expect(viewed(lines(5)).gutter).toBe(GUTTER_PX);
    const long = viewed(lines(12000));
    expect(long.gutter).toBeGreaterThan(GUTTER_PX);
    // (five digits of 8, and the room either side)
    expect(long.gutter).toBe(5 * 8 + NUMBER_GAP + NUMBER_PAD);
  });

  it("puts a place on the view, and finds it again from there, past the column - however many lines", () => {
    for (const n of [5, 12000]) {
      const ed = viewed(lines(n, 60));
      for (const line of [0, 3, 8]) {
        for (const col of [0, 5, 40]) {
          const p = ed.lines.start(line) + col;
          const x = ed.xOf(p);
          expect(x).toBe(ed.gutter + PAD_PX + col * 8);
          expect(ed.at(x, ed.topOf(line) + 1)).toBe(p);
        }
      }
    }
  });

  it("scrolls across as far as the longest line and the column leave of it", () => {
    for (const n of [5, 12000]) {
      const ed = viewed(lines(n, 100), 300);
      expect(ed.mostLeft).toBe(800 + 2 * PAD_PX - (300 - ed.gutter));
    }
  });

  it("keeps a caret in view by the column's own width", () => {
    const ed = viewed(lines(12000, 200), 300);
    ed.sel = { anchor: ed.lines.start(2) + 190, head: ed.lines.start(2) + 190 };
    ed.reveal();
    expect(ed.xOf(ed.sel.head)).toBeGreaterThanOrEqual(ed.gutter);
    expect(ed.xOf(ed.sel.head)).toBeLessThanOrEqual(300);
  });

  it("eases to a wider column as the count takes another digit, every reader seeing the step", () => {
    const ed = viewed(lines(99));
    expect(ed.gutter).toBe(GUTTER_PX);
    ed.setText(lines(100000));
    const goal = ed.gutterGoal;
    expect(goal).toBeGreaterThan(GUTTER_PX);
    // (not at once: still the old width until a step is taken)
    expect(ed.gutter).toBe(GUTTER_PX);
    expect(ed.xOf(0)).toBe(GUTTER_PX + PAD_PX);
    expect(ed.easeGutter(1 / 60)).toBe(true);
    expect(ed.gutter).toBeGreaterThan(GUTTER_PX);
    expect(ed.gutter).toBeLessThan(goal);
    expect(ed.xOf(0)).toBe(ed.gutter + PAD_PX);
    let steps = 0;
    while (ed.easeGutter(1 / 60) && steps++ < 600);
    expect(ed.gutter).toBe(goal);
    expect(ed.easeGutter(1 / 60)).toBe(false);
  });
});

describe("a text's scroll bars", () => {
  it("are none where the text fits", () => {
    expect(viewed(lines(3), 600, 300).thumbs).toEqual({ v: null, h: null });
  });

  it("start at the start of their tracks at the top and the left, the horizontal one beside the column", () => {
    const ed = viewed(lines(12000, 200), 300, 300);
    const { v, h } = ed.thumbs;
    expect(v!.start).toBe(0);
    expect(h!.start).toBe(ed.gutter);
  });

  it("end at the end of their tracks at the most, a line's worth below the last line counted", () => {
    const ed = viewed(lines(12000, 200), 300, 300);
    ed.scrollTo(ed.mostTop, ed.mostLeft);
    expect(ed.scrollTop).toBe(ed.mostTop);
    const { v, h } = ed.thumbs;
    expect(v!.start + v!.len).toBeCloseTo(v!.track);
    expect(h!.start + h!.len).toBeCloseTo(ed.gutter + h!.track);
  });

  it("run the whole view where one shows alone, and stop short of the corner where both show", () => {
    const tall = viewed(lines(500, 10), 400, 300).thumbs;
    expect(tall.h).toBeNull();
    expect(tall.v!.track).toBe(300);
    const both = viewed(lines(500, 200), 300, 300);
    const corner = BAR_PX + BAR_EDGE;
    expect(both.thumbs.v!.track).toBe(300 - corner);
    expect(both.thumbs.h!.track).toBe(300 - both.gutter - corner);
  });
});
