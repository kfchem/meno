import { describe, expect, it } from "vitest";
import { FRAME_COLORS, FRAME_PX, frameLine, frameTabParts, OUTWARD_LINE, tabNameBox, tabNamesKept, tabStart, tabWidthPx, type FarTabs, type FrameTab } from "./frameParts";
import { NAME_PX } from "./cardBands";
import { PAGE_PX } from "../utils/pageScale";
import { NAME_DOWN, PX, TAB_INSET } from "../workflow/look";
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
    // (in turn, left to right, from the tab's inset, each after a gap)
    const name = read.texts[0];
    expect(name.x).toBeCloseTo(TAB_INSET + pagePx(FRAME_PX.icon + FRAME_PX.gap));
    expect(read.texts[1].x).toBeCloseTo(name.x + pagePx(textWidth("Esters", 11, 500) + FRAME_PX.gap));
    const small = frameTabParts([frame()], false);
    expect([small.texts, small.icons.map((i) => i.icon)]).toEqual([[], ["chat"]]);
  });

  it("a set's: says its name and count from its padding, read, with no icon - its icon standing in for them only where they are too small to read", () => {
    const set = frame({ key: "set:3", iconWhenSmall: true, tab: { icon: "rings", name: "Input", status: "3 structures" } });
    const read = frameTabParts([set], true);
    expect(read.icons).toEqual([]);
    expect(read.texts[0]).toMatchObject({ text: "Input", weight: 500 });
    expect(read.texts[0].x).toBeCloseTo(TAB_INSET);
    expect(read.texts[1].x).toBeCloseTo(TAB_INSET + pagePx(textWidth("Input", 11, 500) + FRAME_PX.gap));
    expect(tabWidthPx(set.tab, true, true)).toBeCloseTo(textWidth("Input", 11, 500) + FRAME_PX.gap + textWidth("3 structures", 11));
    const small = frameTabParts([set], false);
    expect([small.texts, small.icons.map((i) => i.icon)]).toEqual([[], ["rings"]]);
  });

  it("starts its words where a set's name is written anew: the field over its tab stands where its name did (pageGl/PageField)", () => {
    const box = { x0: 3, y0: 0, x1: 23, y1: 10 };
    const set = frame({ key: "set:3", box, iconWhenSmall: true, tab: { icon: "rings", name: "Input", status: "3 structures" } });
    const name = frameTabParts([set], true).texts[0];
    expect([name.x, name.y]).toEqual([tabStart(box).x, tabStart(box).y]);
    expect(tabStart(box).y).toBeCloseTo(10 - NAME_DOWN, 12);
  });

  it("of the whole page, is its tab alone - a white box as wide as what it says - and takes the pointer there only", () => {
    const it = frame({ tabOnly: true, edges: true, tab: { icon: "chat", name: "Ideas", warn: "Sees the whole page" } });
    const parts = frameTabParts([it], true);
    const [box] = parts.shapes as Box[];
    const width = TAB_INSET + pagePx(tabWidthPx(it.tab, true)) + TAB_INSET;
    expect(box).toMatchObject({ key: "conversation:1:tab", x0: 0, y0: 10 - 2 * NAME_DOWN, y1: 10, fill: FRAME_COLORS.fill });
    expect(box.x1).toBeCloseTo(width);
    // (no edges to size: it has no frame)
    expect(parts.regions.map((r) => r.part)).toEqual(["tab"]);
  });

  it("starts its tab's words as far from its left edge as its icon stands from its top - a conversation's and a set's alike", () => {
    // (11 px: the icon, 14 px, its middle NAME_DOWN down)
    expect(TAB_INSET).toBeCloseTo(11 * PX, 12);
    expect(TAB_INSET).toBeCloseTo(NAME_DOWN - pagePx(FRAME_PX.icon / 2), 12);
    const box = { x0: 3, y0: 0, x1: 23, y1: 10 };
    const talk = frameTabParts([frame({ box, outward: true })], true);
    const icon = talk.icons[0];
    expect(icon.x - pagePx(FRAME_PX.icon / 2) - box.x0).toBeCloseTo(box.y1 - (icon.y + pagePx(FRAME_PX.icon / 2)), 12);
    // (a set's, read, its name where a conversation's icon starts; too small to read, its icon there)
    const set = frame({ key: "set:3", box, iconWhenSmall: true, tab: { icon: "rings", name: "Input", status: "3 structures" } });
    expect(frameTabParts([set], true).texts[0].x).toBeCloseTo(box.x0 + TAB_INSET, 12);
    expect(frameTabParts([set], false).icons[0].x - pagePx(FRAME_PX.icon / 2)).toBeCloseTo(box.x0 + TAB_INSET, 12);
    // (a tab alone ends as far past its words as they start in: read or not, with its icon or without)
    for (const [it, read] of [[frame({ box, tabOnly: true }), true], [frame({ box, tabOnly: true }), false], [{ ...set, tabOnly: true as const }, true]] as const) {
      const [tab] = frameTabParts([it], read).shapes as Box[];
      expect(tab.x1).toBeCloseTo(box.x0 + TAB_INSET + pagePx(tabWidthPx(it.tab, read, it.iconWhenSmall)) + TAB_INSET, 12);
    }
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

describe("an outward frame - what lies inside it may be sent away from this computer", () => {
  it("is never a set's hairline: dashed in Meno's colour, heavier pointed at and heavier still chosen, its weight eased between", () => {
    for (const tone of ["rest", "hover", "chosen"] as const) {
      const line = (frameTabParts([frame({ outward: true, tone })], true).shapes[0] as Box).line!;
      expect(line).toMatchObject({ color: OUTWARD_LINE.color, dashed: OUTWARD_LINE.dashed, widthPx: OUTWARD_LINE[tone] });
      expect(line.dashed).toBeDefined();
      expect(frameLine({ tone }).dashed).toBeUndefined();
    }
    // (half-way from rest to pointed at: half-way in weight)
    expect(frameLine({ tone: "hover", outward: true, level: 0.5 }).widthPx).toBeCloseTo((OUTWARD_LINE.rest + OUTWARD_LINE.hover) / 2, 9);
    expect(frameLine({ tone: "chosen", outward: true, level: 1.5 }).widthPx).toBeCloseTo((OUTWARD_LINE.hover + OUTWARD_LINE.chosen) / 2, 9);
  });

  it("has its icon in Meno's colour, as its line is; of the whole page, its tab's box dashed the same", () => {
    expect(frameTabParts([frame({ outward: true })], true).icons[0].color).toBe(OUTWARD_LINE.color);
    expect(frameTabParts([frame()], true).icons[0].color).toBe(FRAME_COLORS.quiet);
    const tab = frameTabParts([frame({ outward: true, tabOnly: true })], true).shapes[0] as Box;
    expect(tab.line).toMatchObject({ color: OUTWARD_LINE.color, dashed: OUTWARD_LINE.dashed });
  });
});

describe("a set's tab, zoomed out", () => {
  const set = (over: Partial<FrameTab> = {}) => frame({ key: "set:3", box: { x0: 3, y0: 0, x1: 23, y1: 10 }, iconWhenSmall: true, tab: { icon: "rings", name: "Input", status: "3 structures" }, ...over });
  const far = (over: Partial<FarTabs> = {}): FarTabs => ({ scale: 0.4, band: "named", words: 0, ...over });
  const nameFar = (items: FrameTab[], f: FarTabs, read = false) => frameTabParts(items, read, f).texts.find((t) => t.key.endsWith(":nameFar"));

  it("says its name instead of its icon, eleven screen pixels high whatever the scale, from where its words start, cut at its frame's width inside its inset either side", () => {
    // (at these scales as high as its band, it stands in it)
    for (const scale of [0.7, 0.4, 0.33]) {
      const t = nameFar([set()], far({ scale }))!;
      expect(t).toMatchObject({ text: "Input", weight: 500, anchor: "start", baseline: "middle", opacity: 1 });
      expect(t.sizePx * scale).toBeCloseTo(NAME_PX, 12);
      expect([t.x, t.y]).toEqual([tabStart(set().box).x, tabStart(set().box).y]);
      expect(t.maxWidthPx).toBeCloseTo(20 / PAGE_PX - 22, 9);
    }
    // (no icon of its own standing there, nor its words)
    const d = frameTabParts([set()], false, far());
    expect([d.icons, d.texts.map((t) => t.key)]).toEqual([[], ["set:3:nameFar"]]);
  });

  it("rises over its frame's top where it is higher than its band: its lower edge from the band's, up to the frame's top at twice the band's height - never down over what its frame holds", () => {
    const box = set().box;
    const band = 2 * NAME_DOWN;
    const bandBottom = box.y1 - band;
    const ofScale = (scale: number) => {
      const t = nameFar([set()], far({ scale }))!;
      return { t, h: pagePx(t.sizePx) };
    };
    const inBand = ofScale(0.33);
    expect(inBand.h).toBeLessThan(band);
    expect(inBand.t.y).toBeCloseTo(tabStart(box).y, 12);
    for (const scale of [0.3, 0.25, 0.2, 0.15, 0.1, 0.03, 0.005]) {
      const { t, h } = ofScale(scale);
      expect(h).toBeGreaterThan(band);
      // (its lower edge never below the band's: nothing it holds is under it)
      expect(t.y - h / 2).toBeGreaterThanOrEqual(bandBottom - 1e-12);
      // (the lower edge as far up as the height says: from the band's, to the frame's top at twice the band)
      expect(t.y - h / 2).toBeCloseTo(box.y1 - band * Math.min(1, Math.max(0, 2 - h / band)), 12);
      // (and the box the overlap is found on is where it is drawn)
      const b = tabNameBox(set(), scale);
      expect([b.y0, b.y1]).toEqual([t.y - h / 2, t.y + h / 2]);
    }
    // (far off: wholly above its frame, none of it in the frame)
    for (const scale of [0.1, 0.03]) expect(tabNameBox(set(), scale).y0).toBeGreaterThanOrEqual(box.y1 - 1e-12);
    // (the edge: as high as the band is in it)
    const s = band / pagePx(NAME_PX);
    expect(tabNameBox(set(), 1 / s).y0).toBeCloseTo(bandBottom, 12);
  });

  it("is cut inside its frame, a tab's inset from each side: a name that would be wider than that is cut short, and in the marked band left out", () => {
    const narrow = set({ box: { x0: 0, y0: 0, x1: 100 * PAGE_PX, y1: 10 }, tab: { icon: "rings", name: "Energy window" } });
    const t = nameFar([narrow], far())!;
    expect(t.maxWidthPx).toBeCloseTo(100 - 22, 9);
    // (the name's right edge, from its start, lies inside the frame's, an inset in)
    const b = tabNameBox(narrow, 0.4);
    expect(b.x1).toBeLessThanOrEqual(narrow.box.x1 - TAB_INSET + 1e-9);
    // (a frame no wider than its two insets: no room, none fits)
    const none = set({ box: { x0: 0, y0: 0, x1: 22 * PAGE_PX, y1: 10 } });
    expect(tabNameBox(none, 0.4)).toMatchObject({ fits: false });
    expect(nameFar([none], far())!.maxWidthPx).toBe(0);
  });

  it("crosses over from its words as they fade: its words as far as they are read, its name as far as they are not", () => {
    const half = frameTabParts([set()], false, far({ words: 0.25 }));
    expect(half.texts.map((t) => [t.key.split(":").pop(), t.opacity])).toEqual([["name", 0.25], ["status", 0.25], ["nameFar", 0.75]]);
    // (read, nothing of the other)
    const read = frameTabParts([set()], true, far({ words: 1 }));
    expect(read.texts.map((t) => t.key.split(":").pop())).toEqual(["name", "status"]);
    // (going, fading with the frame)
    expect(nameFar([set({ opacity: 0.5 })], far())?.opacity).toBe(0.5);
  });

  it("leaves its name out as far as it is made to, where it lies over one before it", () => {
    expect(nameFar([set()], far({ labels: new Map([["set:3", 0]]) }))).toBeUndefined();
    expect(nameFar([set()], far({ labels: new Map([["set:3", 0.5]]) }))?.opacity).toBe(0.5);
    expect(nameFar([set()], far({ labels: new Map([["other", 0]]) }))?.opacity).toBe(1);
  });

  it("changes nothing of a frame whose tab is its icon alone - a conversation's - nor where the words are read", () => {
    const chat = frame();
    expect(frameTabParts([chat], false, far()).texts).toEqual([]);
    expect(frameTabParts([chat], false, far()).icons.map((i) => i.icon)).toEqual(["chat"]);
    expect(frameTabParts([chat], true, far({ words: 1 }))).toEqual(frameTabParts([chat], true));
  });

  it("keeps the names that do not overlap, in the order the tabs are read, and leaves out one that lies over another frame - frames that overlap lose their names, a frame clear of them keeps its own", () => {
    const a = set({ key: "a", box: { x0: 0, y0: 0, x1: 3, y1: 10 }, tab: { icon: "rings", name: "Conformers" } });
    const b = set({ key: "b", box: { x0: 1, y0: 0, x1: 4, y1: 10 }, tab: { icon: "rings", name: "Optimised" } });
    const c = set({ key: "c", box: { x0: 90, y0: 0, x1: 93, y1: 10 }, tab: { icon: "rings", name: "Energy" } });
    expect([...tabNamesKept([b, a, c], 0.4, "named")].sort()).toEqual(["c"]);
    expect([...tabNamesKept([a, c], 0.4, "named")].sort()).toEqual(["a", "c"]);
    // (one that is not a set's, or takes no pointer, takes no part)
    expect([...tabNamesKept([frame(), set({ noHits: true })], 0.4, "named")]).toEqual([]);
  });

  it("leaves out of the marked band a name that would be cut short - and it keeps none from showing", () => {
    // (a narrow frame: its name is wider than the frame and half as much again at its size on the screen)
    const narrow = set({ key: "n", box: { x0: 0, y0: 0, x1: 0.2, y1: 10 } });
    const wide = set({ key: "w", box: { x0: 0.05, y0: 0, x1: 30, y1: 10 }, tab: { icon: "rings", name: "Input" } });
    expect(tabNameBox(narrow, 0.1).fits).toBe(false);
    expect([...tabNamesKept([narrow, wide], 0.1, "marked")]).toEqual(["w"]);
    // (named: cut with an ellipsis, shown)
    expect([...tabNamesKept([narrow], 0.1, "named")]).toEqual(["n"]);
  });

  it("never prints a name over a neighbour: a name that would lie over another frame's box, or a card's (`clear`), is left out, in the named band and the marked; touching, or clear, it stays", () => {
    const box = { x0: 3, y0: 0, x1: 23, y1: 10 };
    const mine = set({ key: "m", box, tab: { icon: "rings", name: "Tag" } });
    for (const band of ["named", "marked"] as const) {
      const scale = band === "named" ? 0.4 : 0.1;
      const name = tabNameBox(mine, scale);
      // (another frame, over where the name lies)
      const beside = set({ key: "up", box: { x0: (name.x0 + name.x1) / 2, y0: name.y0 + 0.5 * (name.y1 - name.y0), x1: name.x1 + 5, y1: name.y1 + 5 } });
      expect([...tabNamesKept([mine, beside], scale, band)]).not.toContain("m");
      // (a card's box likewise)
      expect([...tabNamesKept([mine], scale, band, [{ x0: name.x0, x1: name.x0 + 0.01, y0: name.y0 + 0.01, y1: name.y1 + 1 }])]).not.toContain("m");
      // (clear by a hair, or touching, it stays - only where the marked band's name fits)
      const fits = band === "named" || name.fits;
      const touching = [{ x0: name.x1, x1: name.x1 + 1, y0: name.y0, y1: name.y1 }, { x0: name.x0, x1: name.x1, y0: name.y1, y1: name.y1 + 1 }];
      expect([...tabNamesKept([mine], scale, band, touching)].includes("m")).toBe(fits);
    }
  });

  it("holds a name inside its frame's width in the marked band and above its frame, the page's cards beside it clear: a name is shown whole, clear of its molecules and what is beside it, or not at all", () => {
    // (the names of a row of frames at the smallest scales: each shown name inside its frame, wholly above it, clear of every other box)
    const frames = [0, 1, 2, 3].map((k) => set({ key: `s${k}`, box: { x0: k * 8, y0: 0, x1: k * 8 + 6, y1: 10 }, tab: { icon: "rings", name: ["Tagged", "Input", "A rather long name", "Out"][k] } }));
    for (const scale of [0.24, 0.15, 0.1, 0.05, 0.01]) {
      const kept = tabNamesKept(frames, scale, "marked");
      for (const it of frames) {
        const b = tabNameBox(it, scale);
        if (!kept.has(it.key)) continue;
        expect(b.fits).toBe(true);
        expect(b.x0).toBeGreaterThanOrEqual(it.box.x0 - 1e-12);
        expect(b.x1).toBeLessThanOrEqual(it.box.x1 + 1e-12);
        // (nothing of it below the band, where the molecules are)
        expect(b.y0).toBeGreaterThanOrEqual(it.box.y1 - 2 * NAME_DOWN - 1e-12);
        for (const other of frames) if (other !== it) expect(b.x1 <= other.box.x0 || other.box.x1 <= b.x0 || b.y1 <= other.box.y0 || other.box.y1 <= b.y0).toBe(true);
      }
    }
  });

  it("has a name that lies over a frame holding its own whole - a set nested in another - kept, the outer frame's own name unaffected; a frame that holds it in x alone is a neighbour", () => {
    const outer = set({ key: "outer", box: { x0: 0, y0: 0, x1: 100, y1: 50 }, tab: { icon: "rings", name: "All" } });
    const inner = set({ key: "inner", box: { x0: 10, y0: 5, x1: 30, y1: 20 }, tab: { icon: "rings", name: "Part" } });
    // (the inner name lies within the outer frame's box)
    const b = tabNameBox(inner, 0.4);
    expect(b.x0).toBeGreaterThanOrEqual(outer.box.x0);
    expect(b.y1).toBeLessThan(outer.box.y1);
    expect([...tabNamesKept([outer, inner], 0.4, "named")].sort()).toEqual(["inner", "outer"]);
    // (outer holds it in x, not in y: its top is under the inner's - then it is a neighbour, and the inner name lies over it)
    const short = set({ key: "short", box: { x0: 0, y0: 0, x1: 100, y1: 19.5 }, tab: { icon: "rings", name: "Low" } });
    const tall = set({ key: "tall", box: { x0: 10, y0: 5, x1: 30, y1: 20 }, tab: { icon: "rings", name: "Part" } });
    const t = tabNameBox(tall, 0.4);
    expect(t.y0).toBeLessThan(short.box.y1);
    expect([...tabNamesKept([short, tall], 0.4, "named")]).not.toContain("tall");
    // (and in y alone: its right edge short of the inner's)
    const narrow = set({ key: "narrow", box: { x0: 0, y0: 0, x1: 11.5, y1: 50 }, tab: { icon: "rings", name: "Left" } });
    const wide = set({ key: "wide", box: { x0: 10, y0: 5, x1: 30, y1: 20 }, tab: { icon: "rings", name: "Part" } });
    expect(tabNameBox(wide, 0.4).x0).toBeLessThan(narrow.box.x1);
    expect(tabNameBox(wide, 0.4).x1).toBeGreaterThan(narrow.box.x1);
    expect([...tabNamesKept([narrow, wide], 0.4, "named")]).not.toContain("wide");
  });

  it("is not stopped by a frame that takes no pointer - one going - or one that is no set's - a conversation's tab alone: neither is a neighbour", () => {
    const mine = set({ key: "m", box: { x0: 3, y0: 0, x1: 23, y1: 10 }, tab: { icon: "rings", name: "Tag" } });
    const name = tabNameBox(mine, 0.4);
    const over = { x0: (name.x0 + name.x1) / 2, y0: name.y0 + 0.01, x1: name.x1 + 5, y1: name.y1 + 5 };
    expect([...tabNamesKept([mine, frame({ key: "going", box: over, noHits: true })], 0.4, "named")]).toContain("m");
    expect([...tabNamesKept([mine, frame({ key: "chat", box: over, tabOnly: true })], 0.4, "named")]).toContain("m");
    // (the same frame as a set, taking the pointer: it is in the way)
    expect([...tabNamesKept([mine, set({ key: "other", box: over })], 0.4, "named")]).not.toContain("m");
  });
});
