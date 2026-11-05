import { describe, expect, it } from "vitest";
import { PAGE_PX } from "../utils/pageScale";
import { controlLine, controlMost, controlSize, lineWidth, pagePx, type Control } from "./units";
import { inDrawOrder, packShapes, PER, type Shape } from "./shapes";
import { hitAt, type Region } from "./hits";
import { fitted, placed, textWidth } from "./texts";
import { cellOf } from "./icons";

describe("the page's own lengths", () => {
  it("draw a line in page pixels, growing and shrinking with the page, never under a device pixel", () => {
    // (zoomed in: as the page has it)
    expect(lineWidth(1, 10 / PAGE_PX, 2)).toBeCloseTo(pagePx(1), 12);
    // (zoomed far out on a screen of two: a device pixel, half a screen pixel)
    const zoom = 0.1 / PAGE_PX;
    expect(lineWidth(1, zoom, 2)).toBeCloseTo(1 / (zoom * 2), 12);
    expect(lineWidth(1, zoom, 2)).toBeGreaterThan(pagePx(1));
  });

  it("keep a control as large as a hand needs it: its screen pixels near, no more than its own page pixels, nor its share of what it belongs to", () => {
    const port: Control = { screenPx: 9, mostPagePx: 11, leastOfPx: { of: 60, share: 1 / 6 } };
    expect(controlMost(port)).toBeCloseTo(pagePx(10), 12);
    // (near: 9 screen pixels)
    const near = 4 / PAGE_PX;
    expect(controlSize(port, near)).toBeCloseTo(9 / near, 12);
    // (far: its own most)
    const far = 0.5 / PAGE_PX;
    expect(controlSize(port, far)).toBeCloseTo(pagePx(10), 12);
    // (its line: a screen pixel, a fifth of it where it is tiny, never under a device pixel)
    expect(controlLine(9 / near, near, 2)).toBeCloseTo(1 / near, 12);
    const tiny = 3 / far;
    expect(controlLine(tiny, far, 1)).toBeCloseTo(Math.max(tiny / 5, 1 / far), 12);
  });
});

describe("shapes packed for the shader", () => {
  const box = (key: string, z?: number): Shape => ({ kind: "box", key, x0: 0, y0: 0, x1: 2, y1: 1, radiusPx: 12, fill: "#ffffff", line: { widthPx: 1, color: "#d0d7de" }, ...(z != null ? { z } : {}) });

  it("are drawn by z, then as given", () => {
    expect(inDrawOrder([box("a", 1), box("b"), box("c", 1), box("d", -1)]).map((s) => s.key)).toEqual(["d", "b", "a", "c"]);
  });

  it("carry a box's middle, half its size and its corners and line in world units, its colours made linear", () => {
    const p = packShapes([box("a")]);
    expect(p.count).toBe(1);
    expect([...p.centre.slice(0, 2)]).toEqual([1, 0.5]);
    expect([...p.half.slice(0, 2)]).toEqual([1, 0.5]);
    expect(p.radiusLine[0]).toBeCloseTo(pagePx(12), 6);
    expect(p.radiusLine[1]).toBeCloseTo(pagePx(1), 6);
    // (#ffffff linear is 1; #d0d7de's red, 0.816 in sRGB, is about 0.63 linear)
    expect(p.fill[0]).toBeCloseTo(1, 6);
    expect(p.stroke[0]).toBeCloseTo(0.63, 2);
    expect(p.kindOpacity[0]).toBe(0);
  });

  it("carry a control's screen pixels and most for the shader to size it by the zoom, and none for a ring of fixed size", () => {
    const port: Control = { screenPx: 9, mostPagePx: 11 };
    const p = packShapes([
      { kind: "ring", key: "port", x: 3, y: 4, diameterPx: 9, size: port, fill: "#ffffff", line: { widthPx: 1, color: "#6e7781" } },
      { kind: "ring", key: "dot", x: 0, y: 0, diameterPx: 6, fill: "#000000" },
    ]);
    expect([...p.control.slice(0, 3)]).toEqual([9, controlMost(port), 1].map((v) => Math.fround(v)));
    expect([...p.control.slice(PER.control, 2 * PER.control)]).toEqual([0, 0, 0]);
    expect(p.half[PER.half]).toBeCloseTo(pagePx(3), 6);
    expect(p.kindOpacity[0]).toBe(1);
    // (a ring with no line: none)
    expect(p.radiusLine[PER.radiusLine + 1]).toBe(0);
  });

  it("are packed again into the same arrays while they have room", () => {
    const first = packShapes([box("a"), box("b")]);
    const again = packShapes([box("c")], first);
    expect(again.centre).toBe(first.centre);
    expect(again.count).toBe(1);
    expect(again.keys).toEqual(["c"]);
  });
});

describe("what is under the pointer on the page", () => {
  const zoom = 1 / PAGE_PX;
  const frame = { x0: 0, y0: 0, x1: 10, y1: 6 };

  it("is the topmost region: by z, then the layer laid later, then the region given later", () => {
    const under: Region[] = [{ key: "set:1", part: "tab", rect: frame }];
    const over: Region[] = [{ key: "set:2", part: "tab", rect: frame }];
    expect(hitAt([under, over], 5, 3, zoom)?.key).toBe("set:2");
    expect(hitAt([under, over.map((r) => ({ ...r, z: -1 }))], 5, 3, zoom)?.key).toBe("set:1");
    expect(hitAt([under], 11, 3, zoom)).toBeNull();
  });

  it("takes a frame's edge within its band of screen pixels, however far the zoom is, and its corner over the sides it joins", () => {
    const bands: Region[] = (["n", "e", "ne"] as const).map((side) => ({ key: "conv:3", part: side, band: { ...frame, widthPx: 8, side } }));
    // (4 screen pixels inside the top: the top)
    expect(hitAt([bands], 5, 6 - 4 / zoom, zoom)?.part).toBe("n");
    // (zoomed out four times, 8 screen pixels are 32 page pixels: 20 page pixels in, still the top - not at the zoom it was)
    expect(hitAt([bands], 5, 6 - pagePx(20), zoom / 4)?.part).toBe("n");
    expect(hitAt([bands], 5, 6 - pagePx(20), zoom)).toBeNull();
    // (at the corner: the corner, though both sides reach it)
    expect(hitAt([bands], 10, 6, zoom)?.part).toBe("ne");
  });

  it("takes a port within its grab size on the screen, the nearest of two that reach the pointer, and only what a drop accepts", () => {
    const ports: Region[] = [
      { key: "port:a", part: "take", circle: { x: 0, y: 0, diameterPx: 12 } },
      { key: "port:b", part: "take", circle: { x: 8 / zoom, y: 0, diameterPx: 12 } },
    ];
    // (5 screen pixels from a, 3 from b: b)
    expect(hitAt([ports], 5 / zoom, 0, zoom)?.key).toBe("port:b");
    expect(hitAt([ports], 3 / zoom, 0, zoom)?.key).toBe("port:a");
    // (beyond its 6 screen pixels: none)
    expect(hitAt([ports], -7 / zoom, 0, zoom)).toBeNull();
    expect(hitAt([ports], 5 / zoom, 0, zoom, (key) => key !== "port:b")?.key).toBe("port:a");
  });
});

describe("what is under the pointer, at its edges", () => {
  const zoom = 1 / PAGE_PX;
  const frame = { x0: 0, y0: 0, x1: 10, y1: 6 };

  it("takes a frame's corner over the sides it joins, whichever order they are given in", () => {
    const bands: Region[] = (["ne", "n", "e"] as const).map((side) => ({ key: "f", part: side, band: { ...frame, widthPx: 8, side } }));
    expect(hitAt([bands], 10, 6, zoom)?.part).toBe("ne");
  });

  it("takes a band as far as its screen pixels reach on either side of its edge, and no further", () => {
    const top: Region[] = [{ key: "f", part: "n", band: { ...frame, widthPx: 8, side: "n" } }];
    expect(hitAt([top], 5, 6 + 7 / zoom, zoom)?.part).toBe("n");
    expect(hitAt([top], 5, 6 - 7 / zoom, zoom)?.part).toBe("n");
    expect(hitAt([top], 5, 6 + 9 / zoom, zoom)).toBeNull();
  });

  it("takes of two circles on one centre at one z the one drawn last", () => {
    const two: Region[] = [
      { key: "under", part: "take", circle: { x: 0, y: 0, diameterPx: 12 } },
      { key: "over", part: "take", circle: { x: 0, y: 0, diameterPx: 12 } },
    ];
    expect(hitAt([two], 1 / zoom, 0, zoom)?.key).toBe("over");
  });

  it("takes a control where it is drawn, where that is larger than its grab size", () => {
    const big: Region[] = [{ key: "c", part: "take", circle: { x: 0, y: 0, diameterPx: 12, size: { screenPx: 40, mostPagePx: 100 } } }];
    // (15 screen pixels out: past its grab size's 6, within its 20 drawn)
    expect(hitAt([big], 15 / zoom, 0, zoom)?.key).toBe("c");
    expect(hitAt([big], 21 / zoom, 0, zoom)).toBeNull();
  });

  it("takes a rectangle given corner to corner either way round", () => {
    const flipped: Region[] = [{ key: "r", part: "tab", rect: { x0: 10, y0: 6, x1: 0, y1: 0 } }];
    expect(hitAt([flipped], 5, 3, zoom)?.key).toBe("r");
  });
});

describe("words on the page", () => {
  it("are measured by Plex's own advances where there is no canvas, and cut with an ellipsis to fit", () => {
    const w = textWidth("Conformers", 11);
    expect(w).toBeGreaterThan(40);
    expect(w).toBeLessThan(70);
    expect(fitted("Conformers", 11, 400, w + 1)).toBe("Conformers");
    const cut = fitted("Conformers of the lowest", 11, 400, w);
    expect(cut.endsWith("…")).toBe(true);
    expect(textWidth(cut, 11)).toBeLessThanOrEqual(w);
  });

  it("are placed by their anchor: from their start, about their middle, back from their end; and by the capitals' middle where asked", () => {
    const t = { key: "a", x: 10, y: 5, text: "Set", sizePx: 11, color: "#000000" };
    const w = pagePx(textWidth("Set", 11));
    expect(placed({ ...t, anchor: "start" }).x).toBeCloseTo(10, 9);
    expect(placed({ ...t, anchor: "middle" }).x).toBeCloseTo(10 - w / 2, 9);
    expect(placed({ ...t, anchor: "end" }).x).toBeCloseTo(10 - w, 9);
    expect(placed({ ...t, anchor: "start", baseline: "middle" }).y).toBeLessThan(5);
    expect(placed({ ...t, anchor: "start" }).size).toBeCloseTo(pagePx(11), 12);
  });
});

describe("the icons' atlas", () => {
  it("lays icons in a square of cells, row by row from the top", () => {
    const first = cellOf(0, 9);
    expect(first.side).toBe(3);
    for (const [k, v] of Object.entries({ u0: 0, u1: 1 / 3, v0: 2 / 3, v1: 1 })) expect(first[k as keyof typeof first], k).toBeCloseTo(v, 12);
    const middle = cellOf(4, 9);
    expect(middle.u0).toBeCloseTo(1 / 3, 12);
    expect(middle.v0).toBeCloseTo(1 / 3, 12);
    expect(cellOf(9, 10).side).toBe(4);
  });
});

describe("the page's layers of regions", () => {
  const zoom = 1 / PAGE_PX;
  const frame = { x0: 0, y0: 0, x1: 10, y1: 6 };
  it("find the region under a point and the handlers of the layer it is in: the later layer over the earlier, as each is changed, until it goes", async () => {
    const { PageRegions } = await import("./PageHits");
    const all = new PageRegions();
    const told: string[] = [];
    const a = all.add({ regions: [{ key: "set:1", part: "tab", rect: frame }], on: { down: (k) => told.push(`a ${k}`) } });
    const b = all.add({ regions: [{ key: "set:2", part: "tab", rect: frame }], on: { down: (k) => told.push(`b ${k}`) } });
    const hit = all.at(5, 3, zoom)!;
    hit.on.down?.(hit.key, hit.part, { screen: { x: 0, y: 0 }, page: { x: 5, y: 3 }, zoom: 1, event: {} as MouseEvent });
    expect(told).toEqual(["b set:2"]);
    // (the later layer moved away: the earlier one's)
    all.set(b, { regions: [{ key: "set:2", part: "tab", rect: { x0: 20, y0: 0, x1: 30, y1: 6 } }], on: {} });
    expect(all.at(5, 3, zoom)?.key).toBe("set:1");
    all.remove(a);
    expect(all.at(5, 3, zoom)).toBeNull();
    expect(all.at(25, 3, zoom)?.key).toBe("set:2");
  });
});

describe("a line of runs", () => {
  it("lays its runs one after another by their widths, about its anchor, each its own colour - leaving out empty ones", async () => {
    const { lineOf, widthOfRuns } = await import("./texts");
    const runs = [
      { text: "1 / 5", color: "#6e7781" },
      { text: "", color: "#000000" },
      { text: " · Failed", color: "#cd4560", weight: 500 as const },
    ];
    const start = lineOf("chip", 2, 1, "start", runs, 11);
    expect(start.map((t) => t.key)).toEqual(["chip:0", "chip:1"]);
    expect(start[0].x).toBeCloseTo(2, 9);
    expect(start[1].x).toBeCloseTo(2 + pagePx(textWidth("1 / 5", 11)), 9);
    expect(start[1]).toMatchObject({ color: "#cd4560", weight: 500 });
    const middle = lineOf("chip", 2, 1, "middle", runs, 11);
    expect(middle[0].x).toBeCloseTo(2 - pagePx(widthOfRuns(runs, 11)) / 2, 9);
  });
});

describe("where the page's WebGL is drawn", () => {
  it("after the molecules in 3D and their joints, as the page's HTML lay over them all", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const { PAGE_GL_ORDER } = await import("./PageShapes");
    const view = readFileSync(join(__dirname, "../components/Molecule3DView.tsx"), "utf8");
    const over = Number(/export const OVER_PAGE = (\d+);/.exec(view)![1]);
    const most = Math.max(...[...view.matchAll(/renderOrder=\{OVER_PAGE \+ (\d+)\}/g)].map((m) => over + Number(m[1])), over);
    expect(PAGE_GL_ORDER).toBeGreaterThan(most);
  });
});
