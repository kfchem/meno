import { describe, expect, it, vi } from "vitest";
import type * as THREE from "three";
import { FADE_MS, levelFor, OVERSAMPLE, Pictures, QUICK, PREVIEW_PX, TILE, UNDER_MOST, type Pic, type TileAsk } from "./pdfPictures";

// (the reader: a tile drawn at once - or, while `hold` is set, never)
const reader = vi.hoisted(() => ({ hold: false }));
vi.mock("../../../../lib/pdf/reader", () => ({
  drawPart: (a: { w?: number; h?: number }) =>
    reader.hold ? new Promise(() => {}) : Promise.resolve({ bitmap: { width: a.w ?? 360, height: a.h ?? 360 }, w: a.w ?? 360, h: a.h ?? 360, ms: 1 }),
}));

describe("the level a page is drawn at", () => {
  it("is none where the page's small picture is enough", () => {
    expect(levelFor((PREVIEW_PX / 612) * 0.9, 612)).toBe(0);
  });

  it("is twice the screen's scale, within a sixteenth of a doubling: as dark at every zoom", () => {
    expect(levelFor(1, 612)).toBe(2);
    expect(levelFor(2, 612)).toBe(4);
    for (const want of [0.9, 1.3, 2.2, 3.1, 4.7, 6.5, 9.9]) {
      const l = levelFor(want, 612) / OVERSAMPLE;
      expect(l).toBeGreaterThanOrEqual(want);
      expect(l / want).toBeLessThanOrEqual(Math.pow(2, 1 / 16) + 1e-9);
    }
    // (a view stopped a hair from where it was: the same level, the tiles it has)
    expect(levelFor(2.2, 612)).toBe(levelFor(2.21, 612));
    expect(levelFor(100, 612)).toBe(32);
  });
});

describe("a page's tiles drawn", () => {
  /** A tile come at `born`, of a full tile's size. */
  const pic = (born: number): Pic => ({ tex: { image: { width: TILE, height: TILE } } as unknown as THREE.Texture, born });

  it("are the level's own, over those of another kept under until the level's own over them have come and faded in", () => {
    const pics = new Pictures();
    // (a level-2 tile from before a zoom; the level wanted now 4: its part is the level's tiles (0,0) to (1,1))
    pics.tiles.set("p:0:2:0:0", pic(0));
    pics.tiles.set("p:0:4:0:0", pic(1000));
    const now = 1000 + FADE_MS / 2;
    let drawn = pics.tilesOf("p", 0, 4, now);
    expect(drawn.map((t) => [t.key, !!t.under])).toEqual([
      ["p:0:2:0:0", true],
      ["p:0:4:0:0", false],
    ]);
    // (kept, as wanted, while it is drawn so)
    expect(pics.wanted.get("p:0:2:0:0")).toBe(now);
    // (the level's four tiles over it come and faded in: it is drawn no more)
    for (const k of ["0:1", "1:0", "1:1"]) pics.tiles.set(`p:0:4:${k}`, pic(1000));
    drawn = pics.tilesOf("p", 0, 4, 1000 + FADE_MS);
    expect(drawn.every((t) => !t.under)).toBe(true);
    expect(drawn).toHaveLength(4);
  });

  it("keep a finer level's tiles under, after a zoom out, where the coarser level's have not come", () => {
    const pics = new Pictures();
    pics.tiles.set("p:0:4:0:0", pic(0));
    const drawn = pics.tilesOf("p", 0, 2, 10);
    expect(drawn.map((t) => [t.key, !!t.under])).toEqual([["p:0:4:0:0", true]]);
  });
});

describe("a page's tiles kept", () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));
  /** What the canvas asks of a page 3000 points square: the part seen, a screen of 2560 by 1600 pixels, its top left at (x, y) points. */
  const asked = (level: number, x: number, y: number): TileAsk => ({
    sha256: "p",
    page: 0,
    size: [3000, 3000],
    level,
    part: { x0: x, y0: y, x1: x + 2560 / level, y1: y + 1600 / level },
    nearness: () => 0,
    stillSince: () => 0,
  });

  it("keep what is drawn under a zoom made after the view stood still a long while, until the new level's tiles come", async () => {
    reader.hold = false;
    const pics = new Pictures();
    const t0 = performance.now();
    pics.ask(asked(2, 0, 0), t0);
    await settle();
    const had = [...pics.tiles.keys()];
    expect(had.length).toBeGreaterThan(0);
    // (still for ten seconds, then zoomed in: the new level's tiles on their way)
    reader.hold = true;
    const later = t0 + 10_000;
    pics.ask(asked(2.83, 0, 0), later);
    pics.letGo(later);
    for (const k of had) expect(pics.tiles.has(k)).toBe(true);
    expect(pics.tilesOf("p", 0, 2.83, later).filter((t) => t.under).map((t) => t.key).sort()).toEqual(had.sort());
    reader.hold = false;
  });

  it("stay few however long the view is panned and zoomed: none kept under for parts not seen", async () => {
    reader.hold = false;
    const pics = new Pictures();
    const levels = [2, 2.83, 4, 5.66, 4, 2.83];
    let now = performance.now();
    let most = 0;
    for (let step = 0; step < 240; step++) {
      const level = levels[step % levels.length];
      // (wandering over the page, a little further each time)
      const x = (step * 137) % 2400;
      const y = (step * 89) % 2600;
      pics.ask(asked(level, x, y), now);
      await settle();
      pics.tilesOf("p", 0, level, now);
      pics.letGo(now);
      most = Math.max(most, pics.tiles.size);
      now += 400;
    }
    // (the tiles of a screen at each of the levels seen in the last few seconds, and those kept under: tens, not hundreds)
    expect(most).toBeLessThan(10 * 12 + UNDER_MOST);
  });
});

describe("the level a page's part seen is drawn at now", () => {
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const part = { x0: 0, y0: 0, x1: 300, y1: 200 };
  const ask = (level: number): TileAsk => ({ sha256: "q", page: 0, size: [612, 792], level, part, nearness: () => 0, stillSince: () => 0 });

  it("is the quick one first, then the fine one once the quick one's tiles have come, kept after they are let go", async () => {
    reader.hold = false;
    const pics = new Pictures();
    const want = 2.2;
    const quick = levelFor(want, 612, QUICK);
    const fine = levelFor(want, 612, OVERSAMPLE);
    expect(quick).toBeLessThan(fine);
    let now = performance.now() + 1000;
    expect(pics.levelNow("q", 0, [612, 792], part, want, now)).toBe(quick);
    pics.ask(ask(quick), now);
    await settle();
    // (come, but not yet faded in: still the quick one)
    expect(pics.levelNow("q", 0, [612, 792], part, want, performance.now())).toBe(quick);
    now = performance.now() + FADE_MS;
    expect(pics.levelNow("q", 0, [612, 792], part, want, now)).toBe(fine);
    pics.ask(ask(fine), now);
    await settle();
    // (the fine one come, the quick one's let go: the fine one still)
    // (asked for again each frame the view is still, as the canvas does)
    now = performance.now() + FADE_MS + 10_000;
    pics.ask(ask(fine), now);
    pics.tilesOf("q", 0, fine, now);
    pics.letGo(now);
    const kept = [...pics.tiles.keys()];
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.every((k) => k.startsWith(`q:0:${fine}:`))).toBe(true);
    expect(pics.levelNow("q", 0, [612, 792], part, want, now)).toBe(fine);
  });
});
