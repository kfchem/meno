import { describe, expect, it } from "vitest";
import { FRAME_COLORS, FRAME_PX, frameTabParts, tabWidthPx, type FrameTab } from "./frameParts";
import { NAME_DOWN, SET_PAD } from "../workflow/look";
import { pagePx } from "./units";
import { textWidth } from "./texts";
import type { Box } from "./shapes";

const frame = (over: Partial<FrameTab> = {}): FrameTab => ({ key: "conversation:1", box: { x0: 0, y0: 0, x1: 20, y1: 10 }, tone: "rest", tab: { icon: "chat", name: "Esters", status: "through a model" }, ...over });

describe("a frame with its tab, drawn as a set's", () => {
  it("is a rounded box a hair thick, its line by its tone - nothing filled, so the page shows through", () => {
    for (const [tone, color] of [["rest", FRAME_COLORS.line], ["hover", FRAME_COLORS.hover], ["chosen", FRAME_COLORS.chosen]] as const) {
      const [box] = frameTabParts([frame({ tone })], true).shapes as Box[];
      expect(box).toMatchObject({ kind: "box", key: "conversation:1:frame", x0: 0, y0: 0, x1: 20, y1: 10, radiusPx: FRAME_PX.radius, line: { widthPx: 1, color } });
      expect(box.fill).toBeUndefined();
    }
  });

  it("says along its top its icon, its name, its status - and its warning, in Meno's warning colour - or, too small to read, its icon alone", () => {
    const read = frameTabParts([frame({ tab: { icon: "chat", name: "Esters", status: "talks", warn: "Sees the whole page" } })], true);
    const mid = 10 - NAME_DOWN;
    expect(read.icons.map((i) => [i.icon, i.color, i.y])).toEqual([["chat", FRAME_COLORS.quiet, mid], ["warning", FRAME_COLORS.warn, mid]]);
    expect(read.texts.map((t) => [t.text, t.color, t.weight])).toEqual([["Esters", FRAME_COLORS.words, 500], ["talks", FRAME_COLORS.quiet, 400], ["Sees the whole page", FRAME_COLORS.warn, 400]]);
    // (in turn, left to right, from the frame's padding, each after a gap)
    const name = read.texts[0];
    expect(name.x).toBeCloseTo(SET_PAD + pagePx(FRAME_PX.icon + FRAME_PX.gap));
    expect(read.texts[1].x).toBeCloseTo(name.x + pagePx(textWidth("Esters", 11, 500) + FRAME_PX.gap));
    const small = frameTabParts([frame()], false);
    expect([small.texts, small.icons.map((i) => i.icon)]).toEqual([[], ["chat"]]);
  });

  it("a set's: says its name and count from its padding, read, with no icon - its icon standing in for them only where they are too small to read", () => {
    const set = frame({ key: "set:3", iconAlone: true, tab: { icon: "rings", name: "Input", status: "3 structures" } });
    const read = frameTabParts([set], true);
    expect(read.icons).toEqual([]);
    expect(read.texts[0]).toMatchObject({ text: "Input", weight: 500 });
    expect(read.texts[0].x).toBeCloseTo(SET_PAD);
    expect(read.texts[1].x).toBeCloseTo(SET_PAD + pagePx(textWidth("Input", 11, 500) + FRAME_PX.gap));
    expect(tabWidthPx(set.tab, true, true)).toBeCloseTo(textWidth("Input", 11, 500) + FRAME_PX.gap + textWidth("3 structures", 11));
    const small = frameTabParts([set], false);
    expect([small.texts, small.icons.map((i) => i.icon)]).toEqual([[], ["rings"]]);
  });

  it("of the whole page, is its tab alone - a white box as wide as what it says - and takes the pointer there only", () => {
    const it = frame({ tabOnly: true, edges: true, tab: { icon: "chat", name: "Ideas", warn: "Sees the whole page" } });
    const parts = frameTabParts([it], true);
    const [box] = parts.shapes as Box[];
    const width = SET_PAD + pagePx(tabWidthPx(it.tab, true)) + SET_PAD;
    expect(box).toMatchObject({ key: "conversation:1:tab", x0: 0, y0: 10 - 2 * NAME_DOWN, y1: 10, fill: FRAME_COLORS.fill });
    expect(box.x1).toBeCloseTo(width);
    // (no edges to size: it has no frame)
    expect(parts.regions.map((r) => r.part)).toEqual(["tab"]);
  });

  it("takes the pointer at its tab, along its whole top, and - sized - at its eight edges; never inside", () => {
    const regions = frameTabParts([frame({ edges: true })], true).regions;
    expect(regions.map((r) => r.part)).toEqual(["tab", "edge:n", "edge:s", "edge:e", "edge:w", "edge:ne", "edge:nw", "edge:se", "edge:sw"]);
    expect(regions[0]).toMatchObject({ rect: { x0: 0, y0: 10 - 2 * NAME_DOWN, x1: 20, y1: 10 } });
    expect(regions[1]).toMatchObject({ band: { widthPx: FRAME_PX.edge, side: "n" }, cursor: "ns-resize" });
    expect(frameTabParts([frame()], true).regions.map((r) => r.part)).toEqual(["tab"]);
  });

  it("is as present as the caller fades it: every part", () => {
    const parts = frameTabParts([frame({ opacity: 0.4, tab: { icon: "chat", name: "A", warn: "W" } })], true);
    for (const p of [...parts.shapes, ...parts.texts, ...parts.icons]) expect(p.opacity, p.key).toBe(0.4);
  });

  it("going, is drawn but taken hold of nowhere", () => {
    const parts = frameTabParts([frame({ edges: true, noHits: true, opacity: 0.3 })], true);
    expect([parts.shapes.length, parts.regions]).toEqual([1, []]);
  });
});
