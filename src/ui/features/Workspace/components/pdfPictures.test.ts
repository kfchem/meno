import { describe, expect, it } from "vitest";
import type * as THREE from "three";
import { FADE_MS, levelFor, Pictures, PREVIEW_PX, TILE, type Pic } from "./pdfPictures";

describe("the level a page is drawn at", () => {
  it("is none where the page's small picture is enough", () => {
    expect(levelFor((PREVIEW_PX / 612) * 0.9, 612)).toBe(0);
  });

  it("is the first of the levels a half power of two apart at or above what is wanted: never more than 1.41 times it a side", () => {
    expect(levelFor(1, 612)).toBe(1);
    expect(levelFor(1.2, 612)).toBeCloseTo(Math.SQRT2);
    expect(levelFor(2, 612)).toBe(2);
    expect(levelFor(4.7, 612)).toBeCloseTo(4 * Math.SQRT2);
    for (const want of [0.9, 1.3, 2.2, 3.1, 4.7, 6.5, 9.9]) {
      const l = levelFor(want, 612);
      expect(l).toBeGreaterThanOrEqual(want);
      expect(l / want).toBeLessThanOrEqual(Math.SQRT2 + 1e-9);
    }
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
